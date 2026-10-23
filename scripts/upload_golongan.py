"""Upload data golongan operasi (CSV) ke project Supabase golongan.

    cd scripts
    python upload_golongan.py buku_golongan_rs_a.csv [buku_golongan_rs_b.csv ...] --dry-run
    python upload_golongan.py buku_golongan_rs_a.csv [buku_golongan_rs_b.csv ...]

Kolom CSV: rumah_sakit, specialty, golongan, nama_layanan, dan service_code
(opsional; buku yang tidak punya kode boleh tanpa kolom ini).
Awalan "OPERASI " pada golongan dibuang ("OPERASI KECIL" -> "KECIL"), supaya
semua buku memakai nilai yang sama di filter dan urutan.

Baris yang persis sama dengan yang sudah ada dilewati oleh database
(golongan_operasi_unique), jadi upload ulang file yang sama tidak membuat dobel.

Kredensial di scripts/.env (jangan di-commit):
    GOLONGAN_URL=https://xxxx.supabase.co
    GOLONGAN_SERVICE_KEY=eyJ...   # service_role key project golongan
"""
import argparse
import csv
import os
import sys
from collections import Counter
from pathlib import Path

from upload_tarif import Progress, load_env

BATCH_SIZE = 500
UNIQUE_COLS = "rumah_sakit,specialty,golongan,service_code,nama_layanan"
KNOWN_GOLONGAN = {
    "KECIL", "SEDANG", "SEDANG 1", "SEDANG 2", "SEDANG 3",
    "BESAR 1", "BESAR 2", "BESAR 3", "KHUSUS 1", "KHUSUS 2", "KHUSUS 3",
}
REQUIRED = ("rumah_sakit", "specialty", "golongan", "nama_layanan")


def read_rows(paths: list) -> list:
    rows = []
    for path in paths:
        with open(path, encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            missing = [c for c in REQUIRED if c not in (reader.fieldnames or [])]
            if missing:
                sys.exit(f"{path}: kolom tidak ada: {', '.join(missing)}")
            for line, r in enumerate(reader, start=2):
                row = {c: (r.get(c) or "").strip() for c in REQUIRED}
                if row["golongan"].upper().startswith("OPERASI "):
                    row["golongan"] = row["golongan"][len("OPERASI "):].strip()
                row["service_code"] = (r.get("service_code") or "").strip() or None
                empty = [c for c in REQUIRED if not row[c]]
                if empty:
                    sys.exit(f"{path} baris {line}: kolom kosong: {', '.join(empty)}")
                rows.append(row)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Upload golongan operasi ke Supabase")
    parser.add_argument("csv", nargs="+")
    parser.add_argument("--dry-run", action="store_true", help="tampilkan rencana saja, tanpa menulis")
    args = parser.parse_args()

    load_env(Path(__file__).with_name(".env"))
    url, key = os.environ.get("GOLONGAN_URL"), os.environ.get("GOLONGAN_SERVICE_KEY")
    if not url or not key:
        sys.exit("GOLONGAN_URL / GOLONGAN_SERVICE_KEY belum diisi di scripts/.env")

    rows = read_rows(args.csv)
    per_rs = Counter(r["rumah_sakit"] for r in rows)
    unknown = Counter(r["golongan"] for r in rows if r["golongan"] not in KNOWN_GOLONGAN)

    from supabase import create_client
    db = create_client(url, key)
    stats = db.rpc("shard_stats").execute().data
    existing = {h["rumah_sakit"]: h["rows"] for h in stats["hospitals"]}
    print(f"project golongan: {stats['db_size']}, {len(existing)} RS")

    print("\nRencana:")
    for rs in sorted(per_rs):
        note = f"  (sudah ada {existing[rs]} baris)" if rs in existing else ""
        print(f"  {'tambah' if rs in existing else 'baru':6}  {per_rs[rs]:>6} baris  {rs}{note}")
    commas = sorted({r[c] for r in rows for c in ("rumah_sakit", "specialty", "golongan") if "," in r[c]})
    if commas:
        sys.exit("Nilai berikut mengandung koma, padahal filter di website memisahkan pilihan\n"
                 "dengan koma. Ganti komanya dulu di CSV:\n  " + "\n  ".join(commas))
    if unknown:
        print("\nPerhatian: golongan di luar daftar tingkat (akan diurutkan paling akhir):")
        for g, n in unknown.most_common():
            print(f"  {g!r}: {n} baris")
    if any(rs in existing for rs in per_rs):
        print("\nBaris yang sama persis dengan yang sudah ada akan dilewati.")
    if args.dry_run:
        print("\n--dry-run: tidak ada yang ditulis.")
        return

    print()
    bar = Progress("Mengirim baris", len(rows))
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        db.table("golongan_operasi").upsert(
            batch, on_conflict=UNIQUE_COLS, ignore_duplicates=True
        ).execute()
        bar.add(len(batch))
    bar.finish()

    after = {h["rumah_sakit"]: h["rows"] for h in db.rpc("shard_stats").execute().data["hospitals"]}
    print("\nSelesai. Jumlah baris per RS sekarang:")
    for rs in sorted(per_rs):
        print(f"  {after.get(rs, 0):>6}  {rs}")


if __name__ == "__main__":
    main()
