# Panduan Deploy ke Vercel

Aplikasi ini sudah dikonfigurasi untuk berjalan di Vercel. Namun, ada beberapa langkah penting yang harus Anda lakukan di dashboard Vercel agar fitur Login (Google OAuth) dan sinkronisasi Google Sheets berjalan dengan lancar.

## 1. Konfigurasi Environment Variables di Vercel

Buka proyek Anda di Vercel, lalu buka menu **Settings > Environment Variables**. Tambahkan variabel-variabel berikut:

| Key | Value | Keterangan |
| :--- | :--- | :--- |
| `APP_URL` | `https://nama-proyek-anda.vercel.app` | URL utama aplikasi Anda di Vercel (tanpa garis miring di akhir). |
| `GOOGLE_CLIENT_ID` | `...` | Client ID yang Anda dapatkan dari Google Cloud Console. |
| `GOOGLE_CLIENT_SECRET` | `...` | Client Secret yang Anda dapatkan dari Google Cloud Console. |
| `NODE_ENV` | `production` | (Opsional, biasanya otomatis diset oleh Vercel). |

---

## 2. Update Redirect URI di Google Cloud Console

Google OAuth sangat ketat terhadap URL redirect. Anda harus mendaftarkan URL Vercel Anda di Google Cloud Console:

1. Buka [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Pilih proyek Anda.
3. Edit **OAuth 2.0 Client IDs** yang Anda gunakan.
4. Di bagian **Authorized redirect URIs**, tambahkan URL baru:
   - `https://nama-proyek-anda.vercel.app/auth/callback`
5. Simpan perubahan.

---

## 3. Masalah "Gagal memuat URL login"

Jika Anda masih melihat error ini setelah deploy:
1. **Pastikan Variabel Lingkungan sudah benar**: Cek kembali apakah `GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET` sudah dimasukkan di Vercel.
2. **Redeploy**: Setelah mengubah Environment Variables di Vercel, Anda biasanya perlu melakukan **Redeploy** agar perubahan tersebut diterapkan.
3. **Cek Log**: Buka tab **Logs** di dashboard Vercel untuk melihat jika ada pesan error spesifik dari server saat mencoba mengakses `/api/auth/url`.

## Diagnosa Mandiri
Anda dapat mengecek status konfigurasi server dengan mengakses:
`https://nama-proyek-anda.vercel.app/api/debug/config`

Jika `hasClientId` atau `hasClientSecret` bernilai `false`, berarti variabel lingkungan belum terbaca dengan benar oleh Vercel.
