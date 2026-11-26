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

URL preview branch: buka Cloudflare → Workers & Pages → **tariff-book** →
Deployments, lalu cari deploy dari branch PR. Alias-nya berbentuk
`<nama-branch>.tariff-book.pages.dev`, misalnya
`claude-tender-franklin-bddncg.tariff-book.pages.dev`.

1. **Zero Trust:** di dashboard Cloudflare, menu **Zero Trust**. Saat pertama
   kali, pilih nama tim (misalnya `buku-tarif`, jadi
   `buku-tarif.cloudflareaccess.com`) dan plan **Free**. Cloudflare bisa
   meminta kartu, tapi plan Free tidak ditagih.
2. **Metode login:** Zero Trust → Settings → Authentication → Login methods.
   Pastikan **One-time PIN** ada. Biasanya sudah aktif.
3. **Aplikasi:** Access → Applications → **Add an application** →
   **Self-hosted**.
   - Application name: `Buku Tarif (uji)`
   - Session Duration: **6 hours**
   - Domain: hanya alias preview dari langkah di atas. Jangan isi
     `tariff-book.pages.dev` dulu.
4. **Policy:** nama `Email kantor`, Action **Allow**, Include
   **Emails ending in** `@asuransiastra.com`. Simpan.
5. **Pengaman API (Preview saja):** buka aplikasi tadi dan salin
   **Application Audience (AUD) Tag**. Lalu buka Workers & Pages →
   tariff-book → Settings → Variables and Secrets. Pilih environment
   **Preview** (bukan Production) dan tambah:
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
1. Di aplikasi Access yang sama, tambah domain `tariff-book.pages.dev` dan
   `*.tariff-book.pages.dev`. Yang kedua mengunci semua URL preview juga.
2. Isi `ACCESS_TEAM_DOMAIN` dan `ACCESS_AUD` yang sama di environment
   **Production**.
3. Merge PR-nya (kode tanpa env tidak mengunci apa pun, jadi urutan langkah
   1–3 aman).

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
