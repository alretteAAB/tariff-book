"""Upload data golongan operasi (CSV atau Excel) ke project Supabase golongan.

    cd scripts
    python upload_golongan.py buku_golongan.xlsx [buku_lain.csv ...] --dry-run
    python upload_golongan.py buku_golongan.xlsx [buku_lain.csv ...]

Kolom: rumah_sakit, tahun, specialty, golongan, service_code, nama_layanan.
service_code boleh kosong (buku yang tidak punya kode boleh tanpa kolom ini).
Excel: sheet pertama. CSV: pemisah koma, titik koma, atau tab.
Awalan "OPERASI " pada golongan dibuang ("OPERASI KECIL" -> "KECIL"), supaya
semua buku memakai nilai yang sama di filter dan urutan.

Baris yang persis sama dengan yang sudah ada (termasuk tahunnya) dilewati oleh
database (golongan_operasi_unique), jadi upload ulang file yang sama tidak
membuat dobel. Baris yang sama di tahun lain adalah baris baru.

Data lama yang di-upload sebelum ada kolom tahun tidak punya tahun. Kalau RS di
file ini masih punya baris tanpa tahun, rencana menyebutkannya; tambahkan
--hapus-tanpa-tahun untuk menghapus baris tanpa tahun milik RS tersebut
sebelum upload (RS lain tidak disentuh).

Kredensial di scripts/.env (jangan di-commit):
    GOLONGAN_URL=https://xxxx.supabase.co
    GOLONGAN_SERVICE_KEY=eyJ...   # service_role key project golongan
"""
import argparse
import csv
import os
import re
import sys
from collections import Counter
from pathlib import Path

from upload_tarif import Progress, load_env

BATCH_SIZE = 500
UNIQUE_COLS = "rumah_sakit,tahun,specialty,golongan,service_code,nama_layanan"
KNOWN_GOLONGAN = {
    "KECIL", "SEDANG", "SEDANG 1", "SEDANG 2", "SEDANG 3",
    "BESAR 1", "BESAR 2", "BESAR 3", "KHUSUS 1", "KHUSUS 2", "KHUSUS 3",
}
REQUIRED = ("rumah_sakit", "tahun", "specialty", "golongan", "nama_layanan")
TEXT = ("rumah_sakit", "specialty", "golongan", "nama_layanan")


def cell(v) -> str:
    """Isi sel sebagai teks rapi; sel kosong (None / NaN dari Excel) jadi ""."""
    if v is None or (isinstance(v, float) and v != v):
        return ""
    if isinstance(v, float) and v.is_integer():   # 2025.0 dari Excel
        v = int(v)
    return str(v).strip()


def read_table(path: str):
    """(nama kolom, list baris dict) dari .xlsx/.xls (sheet pertama) atau CSV."""
    if Path(path).suffix.lower() in (".xlsx", ".xls"):
        import pandas as pd
        df = pd.read_excel(path, dtype=object)
        cols = [cell(c) for c in df.columns]
        return cols, [dict(zip(cols, r)) for r in df.itertuples(index=False, name=None)]
    with open(path, encoding="utf-8-sig", newline="") as f:
        head = f.readline()
        f.seek(0)
        # Excel berbahasa Indonesia menyimpan CSV dengan titik koma
        delim = max(",;\t", key=head.count)
        reader = csv.DictReader(f, delimiter=delim)
        return [c.strip() for c in reader.fieldnames or []], list(reader)


def read_rows(paths: list) -> list:
    rows = []
    for path in paths:
        cols, records = read_table(path)
        missing = [c for c in REQUIRED if c not in cols]
        if missing:
            sys.exit(f"{path}: kolom tidak ada: {', '.join(missing)}\n"
                     f"  kolom yang ada: {', '.join(cols)}")
        for line, r in enumerate(records, start=2):
            r = {k.strip() if isinstance(k, str) else k: v for k, v in r.items()}
            row = {c: cell(r.get(c)) for c in TEXT}
            if not any(row.values()) and not cell(r.get("tahun")):
                continue   # baris kosong di akhir sheet
            if row["golongan"].upper().startswith("OPERASI "):
                row["golongan"] = row["golongan"][len("OPERASI "):].strip()
            row["service_code"] = cell(r.get("service_code")) or None
            empty = [c for c in REQUIRED if not (row.get(c) if c != "tahun" else cell(r.get(c)))]
            if empty:
                sys.exit(f"{path} baris {line}: kolom kosong: {', '.join(empty)}")
            tahun = cell(r.get("tahun"))
            if not re.fullmatch(r"(19|20)\d\d", tahun):
                sys.exit(f"{path} baris {line}: tahun bukan tahun 4 angka: {tahun!r}")
            row["tahun"] = int(tahun)
            rows.append(row)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Upload golongan operasi ke Supabase")
    parser.add_argument("files", nargs="+", metavar="file", help=".xlsx/.xls atau .csv")
    parser.add_argument("--dry-run", action="store_true", help="tampilkan rencana saja, tanpa menulis")
    parser.add_argument("--hapus-tanpa-tahun", action="store_true",
                        help="hapus dulu baris lama tanpa tahun milik RS yang ada di file ini")
    args = parser.parse_args()

    load_env(Path(__file__).with_name(".env"))
    url, key = os.environ.get("GOLONGAN_URL"), os.environ.get("GOLONGAN_SERVICE_KEY")
    if not url or not key:
        sys.exit("GOLONGAN_URL / GOLONGAN_SERVICE_KEY belum diisi di scripts/.env")

    rows = read_rows(args.files)
    per_rs = Counter(r["rumah_sakit"] for r in rows)
    per_rs_tahun = Counter((r["rumah_sakit"], r["tahun"]) for r in rows)
    unknown = Counter(r["golongan"] for r in rows if r["golongan"] not in KNOWN_GOLONGAN)

    from supabase import create_client
    db = create_client(url, key)
    stats = db.rpc("shard_stats").execute().data
    if any("rows_no_tahun" not in h for h in stats["hospitals"]) or \
            "tahun" not in db.rpc("get_golongan_filters").execute().data:
        sys.exit("Database golongan belum punya kolom tahun. Jalankan dulu di SQL Editor project\n"
                 "golongan: sql/golongan/01_schema.sql, 02_rpc.sql, lalu 03_security.sql.")
    existing = {h["rumah_sakit"]: h["rows"] for h in stats["hospitals"]}
    no_tahun = {h["rumah_sakit"]: h["rows_no_tahun"] for h in stats["hospitals"] if h["rows_no_tahun"]}
    print(f"project golongan: {stats['db_size']}, {len(existing)} RS")

    print("\nRencana:")
    for rs, tahun in sorted(per_rs_tahun):
        note = f"  (RS ini sudah punya {existing[rs]} baris)" if rs in existing else ""
        print(f"  {'tambah' if rs in existing else 'baru':6}  {per_rs_tahun[rs, tahun]:>6} baris  {tahun}  {rs}{note}")
    old = {rs: n for rs, n in no_tahun.items() if rs in per_rs}
    if old:
        print("\nRS berikut masih punya baris lama TANPA tahun (dari upload sebelum ada kolom tahun):")
        for rs, n in sorted(old.items()):
            print(f"  {n:>6} baris  {rs}")
        if args.hapus_tanpa_tahun:
            print("--hapus-tanpa-tahun: baris tanpa tahun milik RS di atas dihapus sebelum upload.")
        else:
            print("Baris itu tetap ada dan akan tampil dobel dengan yang bertahun. Jalankan lagi\n"
                  "dengan --hapus-tanpa-tahun untuk menghapusnya sebelum upload.")
    if unknown:
        print("\nPerhatian: golongan di luar daftar tingkat (akan diurutkan paling akhir):")
        for g, n in unknown.most_common():
            print(f"  {g!r}: {n} baris")
    if any(rs in existing for rs in per_rs):
        print("\nBaris yang sama persis dengan yang sudah ada akan dilewati.")
    if args.dry_run:
        print("\n--dry-run: tidak ada yang ditulis.")
        return

    if args.hapus_tanpa_tahun and old:
        for rs in sorted(old):
            db.table("golongan_operasi").delete().eq("rumah_sakit", rs).is_("tahun", "null").execute()
        print(f"\nBaris tanpa tahun dihapus untuk {len(old)} RS.")

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
