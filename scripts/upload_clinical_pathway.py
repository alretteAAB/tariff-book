"""Upload paket Clinical Pathway (Excel) ke project Supabase golongan.

    cd scripts
    python upload_clinical_pathway.py tarif_gabungan.xlsx --dry-run
    python upload_clinical_pathway.py tarif_gabungan.xlsx

Dua format Excel dibaca (sheet pertama; kolom lain diabaikan). Satu baris =
satu rincian paket; TARIF adalah harga total paket untuk (RS, kelas), diulang
di tiap baris.
- Format gabungan (mis. "Sampling Tarif Gabungan ... Garda"): Treatment Place
  (nama RS lengkap), DIAGNOSIS, Medical Treatment (boleh kosong, untuk paket
  medis tanpa tindakan khusus), Diagnose Id (ICD 10), LOS, KEGIATAN, Item,
  Keterangan, QTY, KELAS, TARIF.
- Format per group (g1v2/g2v2/g3v2): CABANG, Diagnosis, Medical Treatment,
  ICD 10, Tindakan, LOS, KEGIATAN, Item, Keterangan, QTY, KELAS, TARIF. Nama RS
  = --rs-prefix + CABANG ("Mitra Keluarga" + "Bekasi Timur").

Yang dilakukan:
- Teks dirapikan: spasi di depan/belakang dan spasi ganda dihapus; label yang
  sama kecuali huruf besar/kecil memakai ejaan yang paling sering dipakai di
  semua file sekaligus. LOS jadi angka.
- Satu card = rumah sakit x diagnosis x medical treatment x ICD 10, dengan
  harga per kelas dan daftar rinciannya. Rincian harus sama di semua kelas
  (yang beda hanya harganya); kalau tidak, script berhenti sebelum menulis.
- Upload per rumah sakit lewat cp_upload(): data lama RS itu diganti dalam
  satu transaksi, jadi upload ulang file yang sama tidak membuat dobel.

Kredensial di scripts/.env (jangan di-commit):
    GOLONGAN_URL=https://xxxx.supabase.co
    GOLONGAN_SERVICE_KEY=eyJ...   # service_role key project golongan
Sebelum upload pertama: jalankan sql/golongan/04_clinical_pathway.sql.
"""
import argparse
import os
import re
import sys
from collections import Counter
from pathlib import Path

import pandas as pd

from upload_tarif import Progress, fmt_int, load_env

# Both source formats are mapped onto these columns.
FORMATS = {
    "gabungan": {"RS": "Treatment Place", "DIAG": "DIAGNOSIS", "MT": "Medical Treatment",
                 "ICD": "Diagnose Id", "TINDAKAN": None},
    "per group": {"RS": "CABANG", "DIAG": "Diagnosis", "MT": "Medical Treatment",
                  "ICD": "ICD 10", "TINDAKAN": "Tindakan"},
}
COMMON = ["LOS", "KEGIATAN", "Item", "Keterangan", "QTY", "KELAS", "TARIF"]
ALIASES = {"DIAGNOSA": "Medical Treatment"}   # older per-group exports
TEXT = ["RS", "DIAG", "MT", "ICD", "TINDAKAN", "KEGIATAN", "Item", "Keterangan", "KELAS"]
CARD = ["RS", "DIAG", "MT", "ICD"]
KELAS_ORDER = {"KELAS 1": 1, "KELAS 2": 2, "KELAS 3": 3, "ODS": 4}


def tidy(v):
    return re.sub(r"\s+", " ", v).strip() if isinstance(v, str) else v


def none_if_nan(v):
    return None if v is None or (isinstance(v, float) and pd.isna(v)) else v


def read_files(paths: list, prefix: str) -> pd.DataFrame:
    frames = []
    for path in paths:
        df = pd.read_excel(path, dtype=object).rename(columns=ALIASES)
        fmt = "gabungan" if "Treatment Place" in df.columns else "per group"
        cols = FORMATS[fmt]
        missing = [c for c in [v for v in cols.values() if v] + COMMON if c not in df.columns]
        if missing:
            sys.exit(f"{path}: kolom tidak ada ({fmt}): {', '.join(missing)}")
        out = pd.DataFrame({k: (df[v] if v else None) for k, v in cols.items()})
        for c in COMMON:
            out[c] = df[c]
        if fmt == "per group":
            out["RS"] = out["RS"].map(lambda c: f"{prefix} {c}".strip() if isinstance(c, str) else c)
        out["_file"] = Path(path).name
        out["_row"] = range(2, len(out) + 2)   # Excel row number, for messages
        print(f"{Path(path).name}: format {fmt}, {fmt_int(len(out))} baris")
        frames.append(out)
    df = pd.concat(frames, ignore_index=True)

    empty = df[df["RS"].isna() | df["DIAG"].isna()]
    if len(empty):
        r = empty.iloc[0]
        sys.exit(f"Nama RS / diagnosis kosong di {r['_file']} baris {r['_row']}")

    # one spelling per label (ignoring spaces and case), the most used one
    for c in TEXT:
        df[c] = df[c].map(tidy)
        counts = Counter(df[c].dropna())
        best = {}
        for spelling in sorted(counts, key=lambda s: (-counts[s], s)):
            best.setdefault(spelling.lower(), spelling)
        df[c] = df[c].map(lambda v: best[v.lower()] if isinstance(v, str) else v)

    bad_los = df[pd.to_numeric(df["LOS"], errors="coerce").isna()]
    if len(bad_los):
        r = bad_los.iloc[0]
        sys.exit(f"LOS bukan angka di {r['_file']} baris {r['_row']}: {r['LOS']!r}")
    df["LOS"] = pd.to_numeric(df["LOS"]).astype(int)
    df["TARIF"] = pd.to_numeric(df["TARIF"], errors="raise")
    df["QTY"] = pd.to_numeric(df["QTY"], errors="coerce")
    return df


def build_cards(df: pd.DataFrame) -> list:
    cards, problems = [], []
    for key, g in df.groupby(CARD, sort=True, dropna=False):
        rs, diagnosis, treatment, icd = (none_if_nan(v) for v in key)
        where = " / ".join(v for v in (rs, diagnosis, treatment) if v)
        harga = []
        rincian_per_kelas = {}
        for kelas, k in g.groupby("KELAS", sort=False):
            tarif = k["TARIF"].unique()
            if len(tarif) != 1:
                shown = ", ".join(fmt_int(round(float(t))) for t in sorted(tarif)[:3])
                problems.append(f"{where} / {kelas}: TARIF tidak sama di semua baris ({shown})")
                continue
            harga.append({"kelas": kelas, "tarif": float(tarif[0])})
            rincian_per_kelas[kelas] = [
                (none_if_nan(r.KEGIATAN), none_if_nan(r.Item), none_if_nan(r.Keterangan),
                 None if pd.isna(r.QTY) else float(r.QTY))
                for r in k.itertuples(index=False)
            ]
        lists = {tuple(v) for v in rincian_per_kelas.values()}
        if len(lists) > 1:
            problems.append(f"{where}: rincian berbeda antar kelas ({', '.join(rincian_per_kelas)})")
            continue
        los = g["LOS"].unique()
        if len(los) != 1:
            problems.append(f"{where}: LOS tidak sama ({sorted(los)})")
            continue
        harga.sort(key=lambda h: (KELAS_ORDER.get(h["kelas"].upper(), 9), h["kelas"]))
        rincian = [{"kegiatan": a, "item": b, "keterangan": c, "qty": d} for a, b, c, d in next(iter(lists), ())]
        cards.append({
            "rumah_sakit": rs,
            "diagnosis": diagnosis,
            "medical_treatment": treatment,
            "icd10": icd,
            "tindakan": none_if_nan(g["TINDAKAN"].iloc[0]),
            "los": int(los[0]),
            "harga": harga,
            "rincian": rincian,
        })
    if problems:
        sys.exit("Data tidak bisa di-upload:\n  " + "\n  ".join(problems[:20])
                 + (f"\n  ... dan {len(problems) - 20} lagi" if len(problems) > 20 else ""))
    return cards


def main() -> None:
    ap = argparse.ArgumentParser(description="Upload paket Clinical Pathway ke project golongan")
    ap.add_argument("xlsx", nargs="+")
    ap.add_argument("--rs-prefix", default="Mitra Keluarga", help='format per group: awalan nama RS sebelum CABANG (default "Mitra Keluarga")')
    ap.add_argument("--dry-run", action="store_true", help="tampilkan rencana saja, tanpa menulis")
    args = ap.parse_args()

    df = read_files(args.xlsx, args.rs_prefix)
    cards = build_cards(df)
    per_rs = {}
    for c in cards:
        per_rs.setdefault(c["rumah_sakit"], []).append(c)

    load_env(Path(__file__).with_name(".env"))
    url, key = os.environ.get("GOLONGAN_URL"), os.environ.get("GOLONGAN_SERVICE_KEY")
    if not url or not key:
        sys.exit("GOLONGAN_URL / GOLONGAN_SERVICE_KEY belum diisi di scripts/.env")
    from supabase import create_client
    db = create_client(url, key)
    try:
        existing = set(db.rpc("cp_filters").execute().data["rumah_sakit"])
    except Exception as err:
        sys.exit(f"cp_filters() tidak bisa dipanggil ({err}).\n"
                 "Jalankan dulu sql/golongan/04_clinical_pathway.sql di project golongan.")

    print(f"{fmt_int(len(df))} baris dari {len(args.xlsx)} file -> {len(cards)} card, {len(per_rs)} rumah sakit\n")
    print("Rencana:")
    for rs, cs in sorted(per_rs.items()):
        zero = sum(1 for c in cs for h in c["harga"] if h["tarif"] == 0)
        note = f"  ({zero} harga 0 = belum tersedia)" if zero else ""
        print(f"  {'ganti' if rs in existing else 'baru':5}  {len(cs):>3} card  "
              f"{sum(len(c['rincian']) for c in cs):>5} rincian  {rs}{note}")
    if any(rs in existing for rs in per_rs):
        print("\nRS bertanda 'ganti' sudah ada: datanya diganti seluruhnya dengan isi file ini.")
    if args.dry_run:
        print("\n--dry-run: tidak ada yang ditulis.")
        return

    print()
    bar = Progress("Upload per RS", len(per_rs))
    totals = Counter()
    for rs, cs in sorted(per_rs.items()):
        res = db.rpc("cp_upload", {"payload": {"rumah_sakit": [rs], "paket": cs}}).execute().data
        totals.update(res)
        bar.add()
    bar.finish()
    print(f"\nSelesai: {fmt_int(totals['paket'])} card, {fmt_int(totals['harga'])} harga, "
          f"{fmt_int(totals['rincian'])} rincian (diganti: {fmt_int(totals['deleted'])} card lama).")


if __name__ == "__main__":
    main()
