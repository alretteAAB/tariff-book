"""Export semua data Buku Tarif ke CSV, untuk direview. Hanya MEMBACA: tidak ada
data yang diubah atau dihapus.

    cd scripts
    python export_all.py                  # tarif + golongan + clinical pathway
    python export_all.py --only tarif     # atau: --only golongan / --only cp
    python export_all.py --out D:\\review  # folder lain

Hasil di scripts/export_YYYY-MM-DD/ (folder ini tidak ikut ke git):
- tarif_semua.csv      semua RS dari semua shard, kolom sama dengan format upload
                       (rumah_sakit, group_non_group, nama_group, kategori_harga,
                       nama_layanan, kelas_kamar, tahun, tarif) + shard.
                       ~2 juta baris: tidak muat dibuka utuh di Excel (maks.
                       ~1 juta baris), buka dengan Power BI / Python / database,
                       atau filter dulu.
- golongan.csv         rumah_sakit, tahun, specialty, golongan, service_code,
                       nama_layanan (format upload golongan).
- clinical_pathway.csv format file gabungan: Treatment Place, DIAGNOSIS, Medical
                       Treatment, Diagnose Id, LOS, KEGIATAN, Item, Keterangan,
                       QTY, KELAS, TARIF; satu baris per item x kelas.
- ringkasan.txt        jumlah baris per RS dan per file, dicocokkan dengan
                       shard_stats() di database.
CSV: UTF-8 dengan BOM (karakter seperti "≥" tampil benar di Excel), pemisah koma.

Kredensial: scripts/.env yang sama dengan script upload (SHARDS, SHARD_n_URL,
SHARD_n_SERVICE_KEY, GOLONGAN_URL, GOLONGAN_SERVICE_KEY).
"""
import argparse
import csv
import datetime
import os
import sys
from collections import Counter
from decimal import Decimal
from pathlib import Path

from upload_tarif import Progress, fmt_int, load_env, shard_config

PAGE = 1000   # batas baris per request API Supabase
KELAS_ORDER = {"KELAS 1": 1, "KELAS 2": 2, "KELAS 3": 3, "ODS": 4}


def num(v):
    """Angka tanpa ".0" yang tidak perlu (2025.0 -> 2025); None -> ""."""
    if v is None:
        return ""
    if isinstance(v, Decimal):
        v = float(v)
    if isinstance(v, float) and v.is_integer():
        return int(v)
    if isinstance(v, str):
        try:
            f = float(v)
            return int(f) if f.is_integer() else v
        except ValueError:
            return v
    return v


def text(v):
    return "" if v is None else v


def open_csv(path: Path, header: list):
    f = open(path, "w", encoding="utf-8-sig", newline="")
    w = csv.writer(f)
    w.writerow(header)
    return f, w


def read_all(db, table: str, cols: str, key: str = "id") -> list:
    """Semua baris sebuah tabel, PAGE baris per request, urut `key` (keyset)."""
    rows, last = [], None
    while True:
        q = db.table(table).select(cols).order(key).limit(PAGE)
        if last is not None:
            q = q.gt(key, last)
        batch = q.execute().data
        rows += batch
        if len(batch) < PAGE:
            return rows
        last = batch[-1][key]


def read_ranged(db, table: str, cols: str, order: list) -> list:
    """Semua baris tabel tanpa kolom id tunggal (urut beberapa kolom, offset)."""
    rows, start = [], 0
    while True:
        q = db.table(table).select(cols)
        for c in order:
            q = q.order(c)
        batch = q.range(start, start + PAGE - 1).execute().data
        rows += batch
        if len(batch) < PAGE:
            return rows
        start += PAGE


# --- Tarif -----------------------------------------------------------------
TARIF_HEADER = ["rumah_sakit", "group_non_group", "nama_group", "kategori_harga",
                "nama_layanan", "kelas_kamar", "tahun", "tarif", "shard"]


def export_tarif(out: Path, report: list) -> None:
    from supabase import create_client
    shards = {sid: create_client(url, key) for sid, (url, key) in shard_config().items()}

    # Per shard: nama referensi (id -> nama), data RS, dan jumlah baris per RS.
    plan = []      # (nama RS, shard id, rumah_sakit_id, baris menurut shard_stats)
    refs, groups = {}, {}
    for sid, db in shards.items():
        print(f"shard {sid}: membaca daftar nama...")
        refs[sid] = {t: {r["id"]: r["nama"] for r in read_all(db, t, "id,nama")}
                     for t in ("rumah_sakit_ref", "kategori_ref", "kelas_kamar_ref", "layanan_ref")}
        groups[sid] = {r["rumah_sakit"]: r for r in read_all(
            db, "rumahsakit", "rumah_sakit,group_non_group,nama_group", key="rumah_sakit")}
        stats = {h["rumah_sakit"]: h["rows"] for h in db.rpc("shard_stats").execute().data["hospitals"]}
        for rs_id, nama in refs[sid]["rumah_sakit_ref"].items():
            if stats.get(nama):
                plan.append((nama, sid, rs_id, stats[nama]))
    plan.sort(key=lambda p: (p[0].lower(), p[1]))

    total = sum(p[3] for p in plan)
    print(f"\nTarif: {fmt_int(total)} baris dari {len(plan)} RS di {len(shards)} shard")
    f, w = open_csv(out / "tarif_semua.csv", TARIF_HEADER)
    bar = Progress("Mengambil tarif", total)
    written_total = 0
    report.append("TARIF (tarif_semua.csv)")
    try:
        for nama, sid, rs_id, expected in plan:
            db, ref, grp = shards[sid], refs[sid], groups[sid].get(nama, {})
            rows, last = [], None
            while True:
                q = (db.table("tarif_v2").select("id,kategori_id,kelas_kamar_id,layanan_id,tahun,tarif")
                     .eq("rumah_sakit_id", rs_id).order("id").limit(PAGE))
                if last is not None:
                    q = q.gt("id", last)
                batch = q.execute().data
                rows += batch
                bar.add(len(batch))
                if len(batch) < PAGE:
                    break
                last = batch[-1]["id"]
            out_rows = [(
                nama, text(grp.get("group_non_group")), text(grp.get("nama_group")),
                ref["kategori_ref"].get(r["kategori_id"], ""),
                ref["layanan_ref"].get(r["layanan_id"], ""),
                ref["kelas_kamar_ref"].get(r["kelas_kamar_id"], "") if r["kelas_kamar_id"] is not None else "",
                num(r["tahun"]), num(r["tarif"]), sid,
            ) for r in rows]
            out_rows.sort(key=lambda r: (r[6] if r[6] != "" else 0, r[3], r[4], r[5]))
            w.writerows(out_rows)
            written_total += len(out_rows)
            mark = "" if len(out_rows) == expected else f"   BEDA, database: {fmt_int(expected)}"
            report.append(f"  {fmt_int(len(out_rows)):>10}  shard {sid}  {nama}{mark}")
    finally:
        f.close()
    bar.finish()
    report.append(f"  {fmt_int(written_total):>10}  total (database: {fmt_int(total)})\n")


# --- Golongan ----------------------------------------------------------------
GOLONGAN_HEADER = ["rumah_sakit", "tahun", "specialty", "golongan", "service_code", "nama_layanan"]


def golongan_client():
    url, key = os.environ.get("GOLONGAN_URL"), os.environ.get("GOLONGAN_SERVICE_KEY")
    if not url or not key:
        sys.exit("GOLONGAN_URL / GOLONGAN_SERVICE_KEY belum diisi di scripts/.env")
    from supabase import create_client
    return create_client(url, key)


def export_golongan(out: Path, report: list) -> None:
    db = golongan_client()
    print("\nGolongan: membaca...")
    rows = read_all(db, "golongan_operasi", "id," + ",".join(GOLONGAN_HEADER))
    rows.sort(key=lambda r: (r["rumah_sakit"].lower(), -(r["tahun"] or 0), r["specialty"],
                             r["golongan"], r["nama_layanan"]))
    f, w = open_csv(out / "golongan.csv", GOLONGAN_HEADER)
    with f:
        w.writerows([[text(r[c]) if c != "tahun" else num(r[c]) for c in GOLONGAN_HEADER] for r in rows])
    per_rs = Counter(r["rumah_sakit"] for r in rows)
    expected = {h["rumah_sakit"]: h["rows"] for h in db.rpc("shard_stats").execute().data["hospitals"]}
    report.append("GOLONGAN (golongan.csv)")
    for rs in sorted(per_rs, key=str.lower):
        mark = "" if per_rs[rs] == expected.get(rs) else f"   BEDA, database: {fmt_int(expected.get(rs, 0))}"
        report.append(f"  {fmt_int(per_rs[rs]):>10}  {rs}{mark}")
    report.append(f"  {fmt_int(len(rows)):>10}  total\n")
    print(f"  {fmt_int(len(rows))} baris")


# --- Clinical Pathway --------------------------------------------------------
CP_HEADER = ["Treatment Place", "DIAGNOSIS", "Medical Treatment", "Diagnose Id", "LOS",
             "KEGIATAN", "Item", "Keterangan", "QTY", "KELAS", "TARIF"]


def export_cp(out: Path, report: list) -> None:
    db = golongan_client()
    print("\nClinical Pathway: membaca...")
    paket = read_all(db, "cp_paket", "id,rumah_sakit,diagnosis,medical_treatment,icd10,los")
    harga, rincian = {}, {}
    for h in read_ranged(db, "cp_harga", "paket_id,kelas,tarif", ["paket_id", "kelas"]):
        harga.setdefault(h["paket_id"], []).append(h)
    for r in read_ranged(db, "cp_rincian", "paket_id,urut,kegiatan,item,keterangan,qty", ["paket_id", "urut"]):
        rincian.setdefault(r["paket_id"], []).append(r)

    paket.sort(key=lambda p: (p["rumah_sakit"].lower(), p["icd10"] or "", p["diagnosis"],
                              p["medical_treatment"] or ""))
    f, w = open_csv(out / "clinical_pathway.csv", CP_HEADER)
    n_rows, per_rs = 0, Counter()
    with f:
        for p in paket:
            head = [p["rumah_sakit"], p["diagnosis"], text(p["medical_treatment"]), text(p["icd10"]), num(p["los"])]
            kelas = sorted(harga.get(p["id"], []), key=lambda h: (KELAS_ORDER.get(h["kelas"].upper(), 9), h["kelas"]))
            items = sorted(rincian.get(p["id"], []), key=lambda r: r["urut"]) or [None]
            for h in kelas or [{"kelas": "", "tarif": None}]:
                for it in items:
                    body = ["", "", "", ""] if it is None else \
                        [text(it["kegiatan"]), text(it["item"]), text(it["keterangan"]), num(it["qty"])]
                    w.writerow(head + body + [h["kelas"], num(h["tarif"])])
                    n_rows += 1
            per_rs[p["rumah_sakit"]] += 1
    report.append("CLINICAL PATHWAY (clinical_pathway.csv)")
    for rs in sorted(per_rs, key=str.lower):
        report.append(f"  {fmt_int(per_rs[rs]):>10} paket  {rs}")
    report.append(f"  {fmt_int(len(paket)):>10} paket, {fmt_int(n_rows)} baris CSV (item x kelas)\n")
    print(f"  {fmt_int(len(paket))} paket, {fmt_int(n_rows)} baris")


def main() -> None:
    ap = argparse.ArgumentParser(description="Export semua data Buku Tarif ke CSV (hanya membaca)")
    ap.add_argument("--only", choices=["tarif", "golongan", "cp"], help="export satu bagian saja")
    ap.add_argument("--out", help="folder hasil (default: scripts/export_YYYY-MM-DD)")
    args = ap.parse_args()

    load_env(Path(__file__).with_name(".env"))
    out = Path(args.out) if args.out else Path(__file__).with_name(f"export_{datetime.date.today():%Y-%m-%d}")
    out.mkdir(parents=True, exist_ok=True)
    print(f"Folder hasil: {out.resolve()}\n")

    report = [f"Export Buku Tarif, {datetime.datetime.now():%Y-%m-%d %H:%M}",
              "Baris bertanda 'BEDA, database: n' berarti jumlah di file tidak sama dengan isi database.", ""]
    if args.only in (None, "tarif"):
        export_tarif(out, report)
    if args.only in (None, "golongan"):
        export_golongan(out, report)
    if args.only in (None, "cp"):
        export_cp(out, report)

    (out / "ringkasan.txt").write_text("\n".join(report) + "\n", encoding="utf-8")
    problems = sum("   BEDA, database:" in line for line in report)
    print(f"\nSelesai. File ada di {out.resolve()}")
    print("Ringkasan: ringkasan.txt" + (f"  (PERHATIAN: {problems} RS jumlahnya tidak cocok)" if problems else ""))


if __name__ == "__main__":
    main()
