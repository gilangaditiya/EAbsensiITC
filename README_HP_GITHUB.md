# E-Absensi ITC — Build APK dari HP

Project ini sudah dilengkapi GitHub Actions. Kamu tidak perlu Android Studio untuk membuat APK.

## Yang perlu disiapkan

1. Akun GitHub.
2. Project Firebase.
3. File `google-services.json` dari Firebase.

## Cara upload project dari HP

1. Buka GitHub di Chrome.
2. Buat repository baru, misalnya `EAbsensiITC`.
3. Upload seluruh isi folder project ini ke repository.
4. Pastikan struktur paling atas terlihat seperti:

```text
.github/
app/
build.gradle.kts
settings.gradle.kts
gradle.properties
```

5. Dari Firebase Console, buat Android App dengan package:

```text
com.smkganesa.eabsensi
```

6. Download `google-services.json`.
7. Di GitHub, masuk ke folder `app/` lalu upload file `google-services.json`.

> File ini berisi konfigurasi Firebase untuk aplikasi Android. Jangan pernah memasukkan Firebase service-account private key ke dalam project Android.

## Membuat APK

Workflow akan berjalan otomatis ketika ada push ke branch `main` atau `master`.

Atau jalankan manual:

1. Buka tab **Actions** di repository.
2. Pilih **Build E-Absensi ITC APK**.
3. Tekan **Run workflow**.
4. Tunggu sampai selesai.
5. Buka hasil workflow yang berhasil.
6. Pada bagian **Artifacts**, download `EAbsensiITC-debug-apk`.
7. Extract ZIP artifact tersebut di HP.
8. APK di dalamnya adalah `app-debug.apk`.

## Catatan notifikasi pengumuman

APK ini sudah mempunyai kode Firebase Cloud Messaging (FCM) dan otomatis subscribe ke topic:

```text
pengumuman_itc
```

Namun notifikasi otomatis ketika pengelola membuat data baru di tabel Supabase `Pengumuman` masih membutuhkan:

```text
Supabase Pengumuman INSERT
        ↓
Supabase Database Webhook
        ↓
Supabase Edge Function
        ↓
Firebase FCM
        ↓
topic: pengumuman_itc
        ↓
semua HP yang sudah terpasang dan mengizinkan notifikasi
```

Edge Function tersebut harus menggunakan Firebase service-account credential yang disimpan sebagai secret Supabase, bukan di APK.
