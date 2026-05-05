# Panduan Pengguna SocieT-RT

## Daftar Isi

- [Login](#login)
- [Register (Pendaftaran)](#register-pendaftaran)
- [Panduan Super_Admin](#panduan-super_admin)
- [Panduan Ketua_RT](#panduan-ketua_rt)
- [Panduan Pengurus](#panduan-pengurus)
- [Panduan Warga](#panduan-warga)
- [Panduan Security_Guard](#panduan-security_guard)

---

## Login

1. Buka halaman login (`/login`)
2. Masukkan **Email** dan **Password**
3. Klik **Sign In**
4. Setelah berhasil → redirect ke Dashboard

**Catatan:**
- Tenant dideteksi otomatis dari subdomain (misal `rt-melati.societ-rt.com`)
- Akun terkunci 30 menit setelah 5x gagal login
- Session berlaku 24 jam

**Akun Default (Dev):** `admin@societ-rt.com` / `Admin@123456`

---

## Register (Pendaftaran)

**Prasyarat:** Invitation Token dari Ketua_RT atau Pengurus (berlaku 72 jam)

1. Buka `/register`
2. Isi: Nama (min 2 karakter), Email, Password (min 8), Confirm Password, Invitation Token
3. Klik **Create Account**
4. Login dengan email dan password yang didaftarkan

**Catatan:** Role ditentukan oleh pembuat invitation. Satu email = satu akun per tenant.

---

## Panduan Super_Admin

### Dashboard Platform (`/admin`)
Total tenant, MRR, total user, subscription per plan.

### Manajemen Tenant (`/admin/tenants`)
- **Buat Tenant:** Nama, RT/RW, Region, Alamat, Kontak → subdomain auto-generate
- **Suspend:** Blokir semua akses API tenant
- **Reactivate:** Aktifkan kembali

### Feature Flags (`/admin/feature-flags`)
Toggle fitur per tenant. Override berlaku langsung.

### Impersonation (`/admin/tenants/[id]/impersonate`)
Masuk ke tenant sebagai Ketua_RT (max 60 menit). Semua aksi tercatat di audit.

### Tenant Health (`/admin/tenants/[id]/health`)
User aktif, storage, API requests, aktivitas terakhir.

---

## Panduan Ketua_RT

### Dashboard (`/`)
Total warga, saldo kas, iuran belum bayar, voting aktif, alert darurat, pengumuman terbaru, kegiatan mendatang.

### Manajemen User (`/users`)
- **Invite:** Isi email + role → generate token → kirim ke calon user
- **Assign Role:** Ubah role user (tidak bisa assign Super_Admin)

### Data Warga (`/residents`)
- Tambah KK (nomor, alamat, blok)
- Tambah individu (nama, NIK 16 digit, tanggal lahir, gender, telepon, status, kategori, kontak darurat)
- Import/Export CSV
- Format CSV: `household_number,name,nik,date_of_birth,gender,phone,status,categories,emergency_contact_name,emergency_contact_phone,emergency_contact_relationship`

### Keuangan (`/finance`)
- **Catat Transaksi:** Tipe (pemasukan/pengeluaran), jumlah (>0), deskripsi, kategori, tanggal
- **Iuran** (`/finance/iuran`): Status per KK per bulan, catat pembayaran
- **Laporan** (`/finance/report`): Pilih rentang tanggal → saldo awal/akhir, total per kategori

### Voting (`/voting`)
- **Buat:** Judul, deskripsi, opsi (min 2), mode (anonim/terverifikasi), deadline
- **Hasil:** Real-time (refresh 5 detik)

### Pengumuman (`/announcements`)
- Buat: Judul, konten, kategori (umum/keamanan/keuangan/kegiatan/darurat)
- Lampiran: Max 5 file, max 10MB per file
- Notifikasi otomatis ke semua warga

### Darurat (`/emergency`)
- Lihat alert aktif
- Update status: Active → Responding → Resolved

### Peta (`/map`)
- Marker per rumah, popup detail (KK, alamat, kepala keluarga, jumlah penghuni)
- Filter: blok, status, kategori

### Ronda (`/security/patrols`)
- Buat jadwal (tanggal, slot waktu, anggota)
- Lihat absensi dan laporan kejadian

### Surat (`/administration/letters`)
- Lihat pengajuan → Approve (+ PDF) atau Reject (+ alasan)
- Notifikasi otomatis ke pemohon

### Kegiatan (`/events`)
- Buat kegiatan (judul, deskripsi, tanggal, waktu, lokasi)
- Lihat RSVP

### Audit Log (`/audit`)
- Semua aksi dalam tenant, filter tipe/tanggal
- Data sensitif otomatis dimasking

---

## Panduan Pengurus

### Bisa:
- Data Warga (CRUD, CSV)
- Keuangan (transaksi, iuran, laporan)
- Pengumuman (buat + lampiran)
- Darurat (trigger + kelola status)
- Peta (lihat + update koordinat)
- Ronda (jadwal, absensi, kejadian)
- Kegiatan (buat, RSVP)
- Tamu & Paket (catat masuk/keluar)
- Invite User
- Voting (ikut, tidak bisa buat)
- Surat (ajukan untuk diri sendiri)

### Tidak Bisa:
- Assign role
- Approve/reject surat
- Billing, Audit log, Dashboard metrik

---

## Panduan Warga

### Voting (`/voting`)
Lihat voting aktif → pilih opsi → vote (sekali per voting) → lihat hasil.

### Pengumuman (`/announcements`)
Lihat pengumuman, filter kategori.

### Tombol Darurat (`/emergency`)
Klik tombol → izinkan GPS (opsional) → alert terkirim ke pengurus dalam 3 detik.

### Kegiatan (`/events`)
Lihat kegiatan → RSVP (hadir/tidak) → reminder H-24 jam.

### Surat (`/administration/letters`)
Ajukan surat (Pengantar/Domisili/SKTM) → tunggu approval → download PDF.

### Ronda (`/security/patrols`)
Lihat jadwal → check-in saat bertugas → reminder jika belum check-in 30 menit.

### Keuangan (`/finance`) — Read Only
Lihat saldo, transaksi, status iuran sendiri.

### Notifikasi (`/notifications`)
Terima: pengumuman, iuran, voting, kegiatan, paket, darurat. Tandai dibaca.

### Privasi (`/privacy`)
- Ekspor data pribadi (JSON)
- Ajukan penghapusan data
- Lihat riwayat consent

---

## Panduan Security_Guard

### Tamu (`/visitors`)
- **Catat Masuk:** Nama, tujuan, rumah tujuan → notifikasi otomatis ke rumah
- **Catat Keluar:** Klik "Catat Keluar" → timestamp tercatat

### Paket (`/packages`)
- **Catat Paket:** Rumah penerima, kurir, deskripsi → notifikasi otomatis

### Ronda (`/security/patrols`)
- Lihat jadwal → **Check-in** saat bertugas
- Reminder otomatis jika belum check-in 30 menit

### Laporan Kejadian (`/security/incidents`)
Buat laporan: tanggal, waktu, deskripsi, lokasi, tingkat keparahan (low/medium/high/critical).

### Darurat (`/emergency`)
Trigger alert sendiri + terima notifikasi dari warga.

### Lainnya:
Voting (ikut), Kegiatan (RSVP), Pengumuman (lihat), Notifikasi, Privasi.

---

## Tips

- **Notifikasi:** Masuk ke inbox (`/notifications`). Push notification jika browser mengizinkan.
- **Keamanan:** Password min 8 karakter. Akun terkunci 30 menit setelah 5x gagal. Session 24 jam.
- **Multi-Tenant:** Setiap RT/RW punya subdomain sendiri. Data terisolasi penuh antar tenant.
- **Invitation:** Token berlaku 72 jam. Minta token baru jika expired.
