# Robot Photobooth lokal

Pertahankan UI/UX sumber; backend menyimpan sesi, foto kamera, dan frame final pada komputer ini. Foto demo/ilustrasi prototype bukan hasil kamera.

## Menjalankan di Windows

1. Pasang Node.js 20 atau lebih baru.
2. Buka PowerShell pada folder proyek.
3. Jalankan `npm install`.
4. Salin `.env.example` menjadi `.env` bila ingin mengganti konfigurasi.
5. Jalankan `npm start`.
6. Buka `http://127.0.0.1:4173` atau `http://localhost:4173`; izinkan akses kamera.

`getUserMedia` butuh secure context: `localhost`/`127.0.0.1` diizinkan browser modern. Bila kamera tidak terdeteksi, cek izin browser dan tutup aplikasi lain yang memakai kamera. Tombol “Cepat” mempercepat countdown untuk pengujian. Kamera aktif wajib; aplikasi menolak menyimpan placeholder sebagai hasil foto.

## Data

- Foto asli: `storage/photos/original/`
- Sesi JSON: `storage/sessions/`
- Ekspor JPEG: `storage/exports/`
- Log error: `storage/logs/app.log`
- Backup HTML asli: `ROBOT PHOTOBOOTH – UI_UX System (3).html.bak`

Foto ditangkap pada resolusi yang browser/kamera berikan dan disimpan sebagai JPEG. Sesi berada di browser yang sama menggunakan `localStorage`; tombol “Kembali ke awal” memulai sesi baru, data sesi lama tetap di disk.

## Batasan mode lokal

- Pembayaran adalah **simulasi**, tidak ada charge atau transaksi sungguhan.
- AI default memakai Gemini API (`generateContent`, model `gemini-nano-banana-2.1`); OpenAI (`/v1/images/edits`) dan Puter tetap bisa dipilih lewat `AI_PROVIDER`. Contoh konfigurasi ada di `.env.example`. Salin ke `.env`, lalu isi key hanya di file lokal. Key yang pernah dibagikan di chat harus dicabut. Generasi nyata perlu key valid, akses model, dan billing/kuota aktif.
- Cetak memakai dialog browser setelah JPEG frame disimpan. Tidak ada konfirmasi printer fisik.
- QR valid menuju halaman hasil lokal. QR bisa dibuka di komputer ini; perangkat lain tidak dapat mencapai `localhost` komputer booth. Akses LAN perlu konfigurasi bind/firewall dan URL LAN, tidak diaktifkan otomatis.
- Editing frame yang diekspor mendukung foto, crop/zoom, putar, balik, brightness, filter, serta filter demo yang dipilih. Filter demo tetap bukan gambar generatif.
- Font Fredoka masih diambil dari Google Fonts oleh HTML asli; offline, browser pakai fallback CSS.

## Verifikasi

`npm run check` memeriksa sintaks backend. Jalankan `npm start`, lalu cek `http://127.0.0.1:4173/api/health`. Uji webcam, printer, dan touchscreen pada perangkat target. Untuk mengecek layanan terpisah tanpa mengganggu port yang sudah digunakan, jalankan `cmd /c "set PORT=4174&&node server.js"`.
