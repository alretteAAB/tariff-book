# Login OTP email kantor (Cloudflare Access)

Buku Tarif bisa dikunci supaya hanya email `@asuransiastra.com` yang bisa
masuk. Orang mengetik emailnya, Cloudflare mengirim kode 6 digit ke email
itu, lalu mereka masuk selama 6 jam. Tidak ada akun atau password, dan tidak
terhubung ke sistem IT kantor. Siapa yang masuk dan kapan tercatat di
Cloudflare.

Ada dua lapis pengaman:
1. **Cloudflare Access**, di depan seluruh situs (halaman dan `/api`).
   Diatur di dashboard dan tidak ada di kode.
2. **Pemeriksaan di API** (`frontend/functions/api/_middleware.js` +
   `_access.js`). Setiap `/api/*` harus membawa token login Access yang sah:
   tanda tangan cocok dengan kunci tim, AUD dan issuer benar, belum
   kedaluwarsa, dan email berakhiran persis `@asuransiastra.com`. Kalau
   pengaturan Access suatu saat salah, data tetap tidak bisa diambil.
   Pemeriksaan ini hanya aktif kalau env `ACCESS_TEAM_DOMAIN` dan
   `ACCESS_AUD` diisi.

Gratis untuk 50 orang yang login (Zero Trust Free). Di atas itu ada biaya
per orang.

## A. Uji dulu di URL preview (production tidak berubah)

Setiap push ke branch PR punya dua alamat (lihat komentar Cloudflare di PR):
- alamat per deploy, misalnya `https://146c69a4.tariff-book.pages.dev`.
  Alamat ini berganti setiap push;
- alamat branch yang tetap, misalnya
  `https://claude-tender-franklin-bddnc.tariff-book.pages.dev`. Nama branch
  dipotong oleh Cloudflare.

1. **Zero Trust:** di dashboard Cloudflare, menu **Zero Trust**. Saat pertama
   kali, pilih nama tim (misalnya `buku-tarif`, jadi
   `buku-tarif.cloudflareaccess.com`) dan plan **Free**. Cloudflare bisa
   meminta kartu, tapi plan Free tidak ditagih.
2. **Metode login:** Zero Trust → Settings → Authentication → Login methods.
   Pastikan **One-time PIN** ada. Biasanya sudah aktif.
3. **Kunci semua alamat preview:** Workers & Pages → **tariff-book** →
   Settings → General → **Access policy** → **Enable**. Cloudflare membuat
   aplikasi Access untuk `*.tariff-book.pages.dev`, yaitu semua preview.
   Production `tariff-book.pages.dev` tidak ikut terkunci.
4. **Atur aplikasinya:** Zero Trust → Access → Applications → buka aplikasi
   yang baru dibuat itu:
   - Session Duration: **6 hours**
   - Policies: ubah atau ganti menjadi Action **Allow**, Include
     **Emails ending in** `@asuransiastra.com`. Bawaannya hanya email akun
     Cloudflare kamu.
5. **Pengaman API (Preview saja):** di aplikasi itu salin
   **Application Audience (AUD) Tag**. Lalu buka Workers & Pages →
   tariff-book → Settings → Variables and Secrets, pilih environment
   **Preview** (bukan Production), dan tambah:
   - `ACCESS_TEAM_DOMAIN` = `buku-tarif.cloudflareaccess.com` (nama tim kamu)
   - `ACCESS_AUD` = AUD tag tadi

   Lalu **Retry deployment** di deploy preview terbaru.

### Cek
- Buka URL preview di jendela incognito. Halaman login Cloudflare harus
  muncul.
- Masukkan email `@asuransiastra.com`. Kode masuk ke email, lalu situs
  terbuka dan header menampilkan "Masuk sebagai …".
- Masukkan email Gmail. Kode tidak dikirim, atau masuknya ditolak.
- Buka `<URL preview>/api/filters` di incognito tanpa login. Datanya tidak
  boleh muncul.
- Production `tariff-book.pages.dev` harus tetap terbuka seperti biasa.
- Coba dari jaringan kantor: halaman `…cloudflareaccess.com` harus bisa
  dibuka. Kalau email kode tidak datang, cek folder spam atau karantina
  email kantor (pengirimnya Cloudflare).
- Log masuk: Zero Trust → Logs → **Access**, berisi email, waktu, dan IP.

## B. Go-live (setelah uji OK)
1. Di aplikasi Access yang sama, tambah domain `tariff-book.pages.dev`
   (production). Alamat preview sudah terkunci.
2. Isi `ACCESS_TEAM_DOMAIN` dan `ACCESS_AUD` yang sama di environment
   **Production**.
3. **Matikan salinan lain dari repo ini.** Setiap push juga di-deploy ke
   Cloudflare Pages `buku-harga`, Cloudflare Workers `tariff-book`
   (`*.workers.dev`), dan Vercel `tariff-book` (`*.vercel.app`). Salinan yang
   tidak dikunci adalah pintu belakang. Lepaskan dari repo atau hapus
   project yang tidak dipakai. Yang masih dipakai dikunci dengan Access dan
   env yang sama.
4. Merge PR-nya (kode tanpa env tidak mengunci apa pun, jadi urutan langkah
   ini aman).

## Kalau ada masalah
- **Semua orang tiba-tiba tidak bisa ambil data** (API 401 `login_required`):
  `ACCESS_AUD` atau `ACCESS_TEAM_DOMAIN` tidak cocok dengan aplikasi Access.
  Perbaiki env-nya, atau kosongkan kedua env untuk mematikan pemeriksaan
  API. Access di depan situs tetap berjalan.
- **API 503 `login_check_failed`:** kunci tim tidak bisa diambil dari
  `https://<tim>.cloudflareaccess.com/cdn-cgi/access/certs`. Cek ejaan nama
  tim.
- **Mematikan login sementara:** nonaktifkan atau hapus aplikasi di Zero
  Trust → Access → Applications, lalu kosongkan kedua env.
- **Sesi habis saat halaman terbuka:** situs menampilkan "Sesi login habis"
  dengan tombol **Masuk lagi** (`frontend/src/lib/session.js`).
