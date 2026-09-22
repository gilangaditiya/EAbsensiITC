# E-Absensi ITC — Android + FCM

Project Android Studio Kotlin yang membungkus aplikasi HTML/CSS/JS asli dengan WebView dan menambahkan Firebase Cloud Messaging (FCM).

## Sebelum build
1. Buat project Android app di Firebase Console.
2. Tambahkan Android app dengan package: `com.smkganesa.eabsensi`.
3. Download `google-services.json` dan letakkan di `app/google-services.json`.
4. Buka project ini di Android Studio dan lakukan Gradle Sync.
5. Build > Build App Bundle(s) / APK(s) > Build APK(s).

## Push notification pengumuman
Semua instalasi aplikasi otomatis subscribe ke topic FCM `pengumuman_itc`.

Agar setiap INSERT pada tabel Supabase `Pengumuman` otomatis menjadi notifikasi, buat server-side webhook/Edge Function yang mengirim FCM HTTP v1 ke topic tersebut. Jangan menaruh Firebase service-account private key di aplikasi Android.

Payload FCM yang dikirim ke topic:
{
  "message": {
    "topic": "pengumuman_itc",
    "notification": {
      "title": "JUDUL",
      "body": "ISI"
    },
    "data": {
      "title": "JUDUL",
      "body": "ISI"
    }
  }
}

## Catatan
- HTML/CSS/JS asli berada di `app/src/main/assets/`.
- Kamera QR memakai WebView permission dan permission Android CAMERA.
- Android 13+ membutuhkan POST_NOTIFICATIONS; aplikasi meminta permission saat pertama dibuka.
