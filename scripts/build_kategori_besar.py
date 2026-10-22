"""Tulis mapping kategori -> kategori besar (dari Excel) untuk tab Kenaikan Harga.

    cd scripts
    python build_kategori_besar.py mapping_kategori_besar.xlsx

Membaca sheet "Mapping": kolom "nama (asli)" (kategori_harga persis seperti di
database) dan "kategori_besar". Baris dengan kategori_besar kosong tidak ikut
(kategori itu tidak dihitung di dashboard). Nama dipakai PERSIS: spasi dan huruf
besar/kecil tidak diubah, karena dashboard hanya membandingkan item yang 100% sama.

Hasilnya frontend/functions/api/_kategori_besar.json. Commit file itu; setelah
deploy, website memakai mapping baru.
"""
import argparse
import json
import sys
from pathlib import Path

import pandas as pd

# Urutan tampil di dashboard
KATEGORI_BESAR = [
    "Laboratorium",
    "Radiologi",
    "Kamar",
    "Obat, Alkes & BHP",
    "Jasa Medis (Dokter & Konsultasi)",
]
OUT = Path(__file__).resolve().parent.parent / "frontend" / "functions" / "api" / "_kategori_besar.json"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("xlsx")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()

    # keep_default_na=False: kategori bernama "NA"/"NULL" tetap teks, bukan kosong
    df = pd.read_excel(args.xlsx, sheet_name="Mapping", dtype=str, keep_default_na=False)
    for col in ("nama (asli)", "kategori_besar"):
        if col not in df.columns:
            sys.exit(f'Kolom "{col}" tidak ada di sheet Mapping')

    mapping, errors = {}, []
    for nama, besar in zip(df["nama (asli)"], df["kategori_besar"]):
        besar = besar.strip()
        if not nama or not besar:
            continue
        if besar not in KATEGORI_BESAR:
            errors.append(f'"{nama}": kategori_besar "{besar}" bukan salah satu dari {KATEGORI_BESAR}')
        elif mapping.get(nama, besar) != besar:
            errors.append(f'"{nama}" dipetakan ke "{mapping[nama]}" dan "{besar}"')
        else:
            mapping[nama] = besar
    if errors:
        sys.exit("Mapping tidak valid:\n  " + "\n  ".join(errors))

    data = {"kategori_besar": KATEGORI_BESAR, "mapping": dict(sorted(mapping.items()))}
    Path(args.out).write_text(json.dumps(data, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    counts = {k: sum(v == k for v in mapping.values()) for k in KATEGORI_BESAR}
    print(f"{len(mapping)} kategori dipetakan ({len(df) - len(mapping)} baris kosong/dobel dilewati) -> {args.out}")
    for k, n in counts.items():
        print(f"  {n:5d}  {k}")


if __name__ == "__main__":
    main()
