# Rencana: Sharding tariff-book ke beberapa project Supabase free

## Konteks

Tabel `tarif_v2` sekarang berisi 1,97 juta baris dan memakan 391 MB dari kuota 500 MB di satu project Supabase free. Index sendiri 278 MB. Kamu berencana menambah data sampai 10-20 juta baris (±1,6-3,2 GB), jadi merapikan index (hemat ±80 MB) tidak cukup. Anggaran Rp0 dan jaringan kantor memblokir host pihak ketiga, jadi API tetap harus lewat Cloudflare Pages Functions.

Rencananya: pecah data per rumah sakit ke beberapa project Supabase (shard), dan buat lapisan router di Pages Functions yang memilih shard serta menggabungkan hasilnya. Frontend tidak berubah.

## Kondisi sekarang

- Frontend memanggil `/api/*` (lihat `API = "/api"` di `frontend/src/lib/utils.jsx`).
- `frontend/functions/api/` berisi lima endpoint (`filters`, `search`, `suggest`, `export`, `compare`). Semuanya memanggil RPC lewat `supabase-js` dengan satu client dari `_supabase.js`.
- DB sudah dinormalisasi: `tarif_v2` memakai `layanan_id`, `rumah_sakit_id`, `kategori_id`, `kelas_kamar_id`, ditambah tabel `layanan_ref`, `kategori_ref`, `kelas_kamar_ref`.
- Kode di repo tertinggal dari DB. `sql/rpc.sql` dan RPC di repo masih memakai tabel `tarif`, sedangkan RPC yang jalan di Supabase sudah kamu ubah ke `tarif_v2`. Perubahan itu belum masuk repo.
- Folder `backend/` (Express + `pg`) masih ada, padahal sudah tidak dipakai.
- Script upload data milikmu ada di luar repo, memasukkan data langsung ke Postgres lewat `DATABASE_URL`.

## Cara kerja setelah sharding

1. Tiap shard adalah satu project Supabase dengan skema yang sama: `tarif_v2`, tabel referensi, index, RPC, dan policy RLS. Isi `layanan_ref` per shard hanya nama layanan milik rumah sakit di shard itu.
2. Satu rumah sakit tinggal utuh di satu shard, karena `pct_increase` membandingkan 2026 dengan 2025 dari rumah sakit yang sama.
3. Daftar shard ada di env Cloudflare (`SHARDS=1,2,3`, lalu `SHARD_1_URL`, `SHARD_1_KEY`, dan seterusnya). Menambah shard tidak mengubah kode.
4. Modul baru `functions/api/_shards.js` membangun peta rumah sakit ke shard dari hasil `get_filters` tiap shard, disimpan di cache beberapa menit.
5. Cara tiap endpoint bekerja:
   - `filters`: panggil semua shard paralel, gabungkan daftar unik kategori, rumah sakit, tahun, kelas, dan relasi.
   - `search`: kalau filter `rumah_sakit` jatuh ke satu shard, teruskan ke shard itu seperti sekarang. Kalau tidak, minta `page * 50` baris teratas dari tiap shard dengan urutan yang sama, gabungkan di Worker memakai pembanding yang meniru `build_order_by`, ambil irisan halaman, dan jumlahkan `total_count`. Kedalaman halaman dibatasi (misalnya 100 halaman) pada jalur multi-shard.
   - `suggest`: RPC ditambah kolom skor kemiripan. Worker menggabungkan hasil tiap shard, membuang nama kembar, mengurutkan menurut skor, dan mengambil 6.
   - `export`: tiap shard mengirim baris terurut sampai batas 50.000, Worker menggabungkan dan memotong di 50.000.
   - `compare`: tiap shard mengirim baris mentah (batas 10.000 total), lalu blok pivot yang sudah ada di `compare.js` berjalan di atas gabungannya tanpa perubahan.
6. Worker terpisah dengan Cron Trigger mem-ping tiap shard sekali sehari supaya project free tidak di-pause.

## Yang saya kerjakan di kode

1. Sinkronkan repo dengan DB: tulis ulang `sql/rpc.sql` sesuai fungsi `tarif_v2` yang sedang jalan (butuh hasil `pg_get_functiondef` darimu).
2. Pecah SQL jadi berkas per tujuan di `sql/shard/`: skema dan index, RPC, grant dan RLS, dan `shard_stats()` untuk ukuran DB dan daftar rumah sakit.
3. Tulis `_shards.js` (registry, peta rumah sakit, fan-out, pembanding urutan, penggabung) dan ubah kelima endpoint memakainya.
4. Tambah tes untuk pembanding dan penggabung dengan `node --test` (bawaan Node, tanpa dependensi baru).
5. Tulis Worker keep-alive di `workers/keepalive/` dengan `wrangler.jsonc` berisi cron harian.
6. Adaptasi script upload-mu menjadi sadar shard: rumah sakit baru masuk ke shard dengan ruang terbanyak, dan satu rumah sakit tidak pernah dipecah. Aku perlu script aslinya ditaruh di repo atau ditempel di chat.
7. Tulis script pemindahan rumah sakit dari shard 1 ke shard 2 beserta pengecekan jumlah baris sebelum dan sesudah.
8. Tulis runbook SQL untuk mengosongkan ruang di shard 1 (lihat bagian jebakan).
9. Hapus `backend/` setelah verifikasi, dan perbarui `CLAUDE.md` dan README.

Urutan rilis, tiap tahap bisa di-deploy sendiri:
- Tahap 0: sinkronisasi repo dengan DB.
- Tahap 1: kode shard dengan satu shard (`SHARDS=1`). Perilaku tidak berubah, jadi aman sebagai uji.
- Tahap 2: buat shard 2, pindahkan sebagian rumah sakit.
- Tahap 3: keep-alive.
- Tahap 4: script upload sadar shard.

## Yang harus kamu kerjakan di luar kode

Bagian ini butuh akun atau kredensialmu, jadi saya tidak bisa melakukannya:

1. Buat project Supabase tambahan. Setahu saya free plan membatasi sekitar 2 project aktif per akun, jadi kamu mungkin butuh beberapa akun. Baca ToS Supabase soal itu sebelum mulai.
2. Di tiap project: jalankan berkas SQL dari `sql/shard/` di SQL Editor, lalu salin Project URL dan anon key format lama (JWT `eyJ...`).
3. Di Cloudflare Pages (Production dan Preview): isi `SHARDS` dan pasangan `SHARD_n_URL` dan `SHARD_n_KEY`. Kunci tidak boleh di-commit.
4. Simpan connection string Postgres tiap shard (`DATABASE_URL_n`) di `.env` lokal untuk script upload dan pemindahan data. Jangan kirim isinya ke chat.
5. Backup sebelum memindahkan data (`pg_dump`, atau tabel backup seperti `tarif_v2_backup_86_20260923`).
6. Deploy Worker keep-alive: `wrangler login`, set secret tiap shard, lalu `wrangler deploy`.
7. Jalankan script pemindahan dan runbook pengosongan ruang, karena keduanya menyentuh data produksimu.
8. Setelah semua terverifikasi, matikan host lama backend (Railway atau lainnya).

## Jebakan yang sudah saya ketahui

- `DELETE` tidak mengecilkan ukuran DB. Kuota Supabase dihitung dari ukuran file, jadi setelah memindahkan rumah sakit keluar dari shard 1, ruangnya baru kembali setelah `VACUUM FULL`, yang butuh ruang kosong sebesar tabel yang tersisa. Jalurnya: drop index dulu, `DELETE`, `VACUUM FULL`, buat ulang index. Runbook akan menuliskan urutannya.
- Urutan teks di Postgres (collation) dan di JavaScript bisa berbeda untuk karakter tertentu, jadi urutan gabungan lintas shard bisa sedikit bergeser dibanding satu DB. Pembanding akan memakai `Intl.Collator` dan dicek dengan data nyata.
- Halaman yang dalam pada pencarian tanpa filter rumah sakit lebih berat. Batas kedalaman menjaga biaya tetap terkendali.
- Satu rumah sakit harus muat di satu shard (±2,5 juta baris). Kalau ada yang lebih besar, rencana ini perlu diubah.
- Satu shard yang pause atau error mematikan pencarian untuk rumah sakit di dalamnya. Router akan mengembalikan hasil dari shard yang sehat dan menandai respons sebagian, supaya satu shard mati tidak menjatuhkan semuanya.
- Join `pct_increase` di kode lama tidak mencocokkan `rumah_sakit`. Kalau `layanan_id` dipakai bersama banyak rumah sakit, barisnya bisa terduplikasi. Saya cek ini saat membaca fungsi yang sedang jalan di Tahap 0.

## Verifikasi

- Tes unit: `node --test` untuk pembanding urutan, penggabung `search`, penggabung `suggest`, dan penyatuan `filters`.
- Sebelum memindahkan data: dengan `SHARDS=1`, bandingkan keluaran `/api/search`, `/api/suggest`, `/api/compare`, dan `/api/export` dengan sebelum perubahan. Hasilnya harus sama.
- Setelah dipecah: jumlah baris per rumah sakit di shard tujuan sama dengan sebelum dipindah, dan `total` pada `/api/search` tanpa filter sama dengan `count(*)` gabungan semua shard.
- Daftar cek yang sama dengan bagian 9 di `CLAUDE.md` dijalankan di URL Preview: `filters`, `search?q=usg`, `search?tahun=2026`, tes salah ketik `q=uzg`, `suggest`, `export` (csv dan xls), `compare`, dan kolom `pct_increase` terisi di baris 2026.
- Matikan satu shard sengaja (env salah) di Preview dan pastikan API tetap menjawab dari shard lain dengan penanda hasil sebagian.
