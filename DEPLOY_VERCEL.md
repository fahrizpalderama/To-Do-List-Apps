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

## 3. Masalah "Google has not completed the verification process" (Error 403)

Jika orang lain (selain email dev Anda) melihat error `403: access_denied` saat mencoba login, itu karena Google Project Anda masih dalam mode **Testing**.

**Cara Memperbaiki:**
1. Buka [Google Cloud Console OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent).
2. Ada dua pilihan:
   - **Pilihan A**: Tambahkan email mereka di bagian **Test Users**.
   - **Pilihan B**: Klik tombol **PUBLISH APP** agar statusnya menjadi "In Production".
3. Jika Anda memilih Pilihan B, Google akan menampilkan peringatan "App not verified". Pengguna cukup klik **Advanced** -> **Go to [nama-app] (unsafe)** untuk melanjutkan.

## 4. Diagnosa Mandiri
Akses: `https://nama-proyek-anda.vercel.app/api/debug/config`
