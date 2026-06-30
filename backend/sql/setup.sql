-- Buku Tarif — penyiapan database (jalankan sekali di Supabase SQL Editor).
--
-- 1. Mengaktifkan pencarian fuzzy/toleran salah ketik (pg_trgm).
-- 2. Membuat index untuk mempercepat pencarian, filter, dan join YoY.
--
-- Catatan Supabase: pg_trgm juga bisa diaktifkan lewat
--   Dashboard → Database → Extensions → cari "pg_trgm" → enable.
-- Menjalankan skrip ini di SQL Editor sudah cukup. Aman dijalankan ulang
-- (semua memakai IF NOT EXISTS).

-- Ekstensi trigram untuk ILIKE cepat + similarity (toleran salah ketik)
create extension if not exists pg_trgm;

-- Index trigram untuk pencarian nama layanan (mendukung ILIKE '%...%' dan operator <%)
create index if not exists idx_tarif_nama_trgm
  on tarif using gin (nama_layanan gin_trgm_ops);

-- Index filter
create index if not exists idx_tarif_tahun        on tarif (tahun);
create index if not exists idx_tarif_rumah_sakit  on tarif (rumah_sakit);
create index if not exists idx_tarif_kategori     on tarif (kategori_harga);
create index if not exists idx_tarif_kelas        on tarif (kelas_kamar);

-- Index komposit untuk mempercepat self-join perhitungan % vs tahun lalu
create index if not exists idx_tarif_join
  on tarif (nama_layanan, kategori_harga, kelas_kamar, tahun);

-- Setelah dijalankan, RESTART server backend agar mendeteksi pg_trgm aktif
-- (pengecekan dilakukan sekali saat start).
