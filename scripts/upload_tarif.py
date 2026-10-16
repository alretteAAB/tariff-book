"""Upload data tarif dari CSV ke shard Supabase yang tepat.

    cd scripts
    pip install supabase pandas
    python upload_tarif.py data_tarif_baru.csv --dry-run   # cek dulu: RS mana ke shard mana
    python upload_tarif.py data_tarif_baru.csv

Kolom CSV: rumah_sakit, group_non_group, nama_group, kategori_harga,
nama_layanan, kelas_kamar, tahun, tarif, pct_increase (opsional).

Aturan shard:
- RS yang sudah ada di sebuah shard selalu ditambah ke shard itu
  (satu RS tidak pernah dipecah, karena pct_increase membandingkan baris
  RS yang sama di satu database).
- RS baru masuk ke shard dengan ruang kosong terbanyak, asalkan muat.
  Kalau tidak ada yang muat, script berhenti sebelum menulis apa pun:
  buat shard baru dulu (atau pindahkan RS dengan scripts/move-hospital.js).

Kredensial di scripts/.env (jangan di-commit):
    SHARDS=1,2
    SHARD_1_URL=https://xxxx.supabase.co
    SHARD_1_SERVICE_KEY=eyJ...   # service_role key (anon tidak boleh menulis karena RLS)
"""
import argparse
import os
import sys
from pathlib import Path

import pandas as pd

# Ukuran per baris termasuk index dan tabel referensi: 447 MB / 1,83 juta
# baris di shard 1 (Oktober 2026), dibulatkan ke atas.
BYTES_PER_ROW = 260
QUOTA_BYTES = 500 * 1024 * 1024        # kuota database Supabase free
HEADROOM_BYTES = 50 * 1024 * 1024      # sisakan ruang untuk VACUUM, index, dll.
BATCH_SIZE = 500
UNIQUE_COLS = "rumah_sakit_id,kategori_id,kelas_kamar_id,layanan_id,tahun,tarif"


def load_env(path: Path) -> None:
    """KEY=VALUE per baris dari scripts/.env; variabel yang sudah ada menang."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def shard_config() -> dict:
    ids = [s.strip() for s in os.environ.get("SHARDS", "").split(",") if s.strip()]
    if not ids:
        sys.exit("SHARDS belum diisi di scripts/.env (contoh: SHARDS=1,2)")
    config = {}
    for sid in ids:
        url = os.environ.get(f"SHARD_{sid}_URL")
        key = os.environ.get(f"SHARD_{sid}_SERVICE_KEY")
        if not url or not key:
            sys.exit(f"SHARD_{sid}_URL / SHARD_{sid}_SERVICE_KEY belum diisi")
        config[sid] = (url, key)
    return config


def clean(value):
    """NaN dari pandas -> None (NaN tidak bisa dikirim sebagai JSON)."""
    return None if pd.isna(value) else value


def choose_shards(rows_per_rs: dict, stats: dict) -> dict:
    """Tentukan shard untuk tiap RS. Tidak menulis apa pun.

    rows_per_rs: {nama RS: jumlah baris baru}
    stats: {shard id: {"size": byte, "hospitals": set nama RS}} dari shard_stats()
    Mengembalikan {nama RS: shard id}; berhenti (SystemExit) kalau ada yang tidak muat.
    """
    free = {sid: QUOTA_BYTES - HEADROOM_BYTES - s["size"] for sid, s in stats.items()}
    plan, problems = {}, []
    # RS terbesar dulu, supaya yang besar dapat tempat sebelum ruang terpecah-pecah
    for rs, n in sorted(rows_per_rs.items(), key=lambda kv: -kv[1]):
        need = n * BYTES_PER_ROW
        holders = [sid for sid, s in stats.items() if rs in s["hospitals"]]
        if len(holders) > 1:
            problems.append(f"{rs}: ada di lebih dari satu shard ({', '.join(holders)}), rapikan dulu")
            continue
        if holders:
            sid = holders[0]
            if free[sid] < need:
                problems.append(f"{rs}: shard {sid} tidak muat (+{need // 2**20} MB, sisa {free[sid] // 2**20} MB); "
                                f"pindahkan RS lain dari shard {sid} dulu")
                continue
        else:
            fitting = [sid for sid in free if free[sid] >= need]
            if not fitting:
                problems.append(f"{rs}: tidak muat di shard mana pun (+{need // 2**20} MB); buat shard baru")
                continue
            sid = max(fitting, key=lambda s: free[s])
        free[sid] -= need
        plan[rs] = sid
    if problems:
        sys.exit("Tidak ada yang ditulis:\n  " + "\n  ".join(problems))
    return plan


class ShardWriter:
    """Penulisan ke satu shard, dengan cache id referensi (seperti script lama)."""

    def __init__(self, client):
        self.db = client
        self.cache = {"rumah_sakit_ref": {}, "kategori_ref": {}, "kelas_kamar_ref": {}, "layanan_ref": {}}

    def get_or_create_id(self, table: str, nama):
        if nama is None:
            return None
        cache = self.cache[table]
        if nama in cache:
            return cache[nama]
        res = self.db.table(table).select("id").eq("nama", nama).execute()
        if res.data:
            cache[nama] = res.data[0]["id"]
        else:
            cache[nama] = self.db.table(table).insert({"nama": nama}).execute().data[0]["id"]
        return cache[nama]

    def upsert_rumahsakit(self, rs: str, group_non_group, nama_group) -> None:
        # display_name RS yang sudah ada tidak ditimpa (banyak yang sudah dirapikan
        # manual, misalnya "Rs Ngoerah" -> "RS Ngoerah"); hanya data grup yang diperbarui.
        exists = self.db.table("rumahsakit").select("rumah_sakit").eq("rumah_sakit", rs).execute().data
        if exists:
            self.db.table("rumahsakit").update(
                {"group_non_group": group_non_group, "nama_group": nama_group}
            ).eq("rumah_sakit", rs).execute()
        else:
            self.db.table("rumahsakit").insert({
                "rumah_sakit": rs, "display_name": rs,
                "group_non_group": group_non_group, "nama_group": nama_group,
            }).execute()

    def sync_room_mapping(self, rows: list) -> None:
        """Samakan room_class_mapping dengan shard pertama (filter kelas kamar memakainya)."""
        if rows:
            self.db.table("room_class_mapping").upsert(rows, on_conflict="room_class").execute()

    def insert_tarif(self, df: pd.DataFrame) -> int:
        rows = [{
            "rumah_sakit_id": self.get_or_create_id("rumah_sakit_ref", clean(r.rumah_sakit)),
            "kategori_id":    self.get_or_create_id("kategori_ref", clean(r.kategori_harga)),
            "kelas_kamar_id": self.get_or_create_id("kelas_kamar_ref", clean(r.kelas_kamar)),
            "layanan_id":     self.get_or_create_id("layanan_ref", clean(r.nama_layanan)),
            "tahun":          int(r.tahun),
            "tarif":          None if pd.isna(r.tarif) else int(r.tarif),
            "pct_increase":   clean(getattr(r, "pct_increase", None)),
        } for r in df.itertuples(index=False)]
        for i in range(0, len(rows), BATCH_SIZE):
            # Baris yang persis sama (unique combo) dilewati, jadi upload yang
            # terputus bisa diulang. Kecuali baris tanpa kelas_kamar: NULL tidak
            # dianggap sama oleh constraint, jadi baris itu akan terduplikasi.
            self.db.table("tarif_v2").upsert(
                rows[i:i + BATCH_SIZE], on_conflict=UNIQUE_COLS, ignore_duplicates=True
            ).execute()
            print(f"    {min(i + BATCH_SIZE, len(rows))}/{len(rows)}", end="\r")
        print()
        return len(rows)


def fetch_stats(clients: dict) -> dict:
    stats = {}
    for sid, client in clients.items():
        s = client.rpc("shard_stats").execute().data
        stats[sid] = {"size": s["db_size_bytes"], "hospitals": {h["rumah_sakit"] for h in s["hospitals"]}}
        print(f"shard {sid}: {s['db_size']}, {len(s['hospitals'])} RS")
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Upload data tarif ke shard Supabase")
    parser.add_argument("csv", nargs="?", default="data_tarif_baru.csv")
    parser.add_argument("--dry-run", action="store_true", help="tampilkan rencana saja, tanpa menulis")
    args = parser.parse_args()

    load_env(Path(__file__).with_name(".env"))
    from supabase import create_client
    clients = {sid: create_client(url, key) for sid, (url, key) in shard_config().items()}

    df = pd.read_csv(args.csv)
    df["rumah_sakit"] = df["rumah_sakit"].astype(str).str.strip()
    rows_per_rs = df.groupby("rumah_sakit").size().to_dict()

    stats = fetch_stats(clients)
    plan = choose_shards(rows_per_rs, stats)
    print("\nRencana:")
    for rs, sid in sorted(plan.items(), key=lambda kv: (kv[1], kv[0])):
        status = "tambah" if rs in stats[sid]["hospitals"] else "baru"
        print(f"  shard {sid}  {status:6}  {rows_per_rs[rs]:>7} baris  {rs}")
    if args.dry_run:
        print("\n--dry-run: tidak ada yang ditulis.")
        return

    first = next(iter(clients))
    mapping = clients[first].table("room_class_mapping").select("room_class,mapped_room_class").execute().data
    writers = {sid: ShardWriter(c) for sid, c in clients.items()}
    for sid in sorted(set(plan.values())):
        if sid != first:
            writers[sid].sync_room_mapping(mapping)

    master = df[["rumah_sakit", "group_non_group", "nama_group"]].drop_duplicates(subset=["rumah_sakit"])
    for r in master.itertuples(index=False):
        sid = plan[r.rumah_sakit]
        print(f"\n{r.rumah_sakit} -> shard {sid}")
        w = writers[sid]
        w.upsert_rumahsakit(r.rumah_sakit, clean(r.group_non_group), clean(r.nama_group))
        n = w.insert_tarif(df[df["rumah_sakit"] == r.rumah_sakit])
        print(f"  {n} baris dikirim")

    print("\nSelesai. Jumlah baris per RS sekarang:")
    for sid in sorted(set(plan.values())):
        s = clients[sid].rpc("shard_stats").execute().data
        counts = {h["rumah_sakit"]: h["rows"] for h in s["hospitals"]}
        for rs in sorted(rs for rs, p in plan.items() if p == sid):
            print(f"  shard {sid}  {counts.get(rs, 0):>7}  {rs}")
        print(f"  shard {sid} ukuran: {s['db_size']}")


if __name__ == "__main__":
    main()
