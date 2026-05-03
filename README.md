# SocieT-RT — Platform Manajemen Komunitas RT/RW

Platform digital multi-tenant SaaS untuk pengelolaan RT/RW/perumahan/komunitas warga. Setiap tenant merepresentasikan satu RT, RW, cluster, atau komunitas dengan data yang terisolasi penuh.

## Daftar Isi

- [Fitur Utama](#fitur-utama)
- [Tech Stack](#tech-stack)
- [Arsitektur](#arsitektur)
- [Prasyarat](#prasyarat)
- [Instalasi & Setup](#instalasi--setup)
- [Menjalankan Aplikasi](#menjalankan-aplikasi)
- [Struktur Proyek](#struktur-proyek)
- [Role & Hak Akses](#role--hak-akses)
- [Panduan Pengguna per Role](#panduan-pengguna-per-role)
- [Subscription Plans](#subscription-plans)
- [Environment Variables](#environment-variables)
- [Database](#database)
- [Background Jobs](#background-jobs)
- [Deployment](#deployment)
- [Scripts](#scripts)

---

## Fitur Utama

| Modul | Deskripsi |
|-------|-----------|
| **Multi-Tenancy** | Isolasi data per tenant dalam satu database |
| **Autentikasi** | JWT + HTTP-only cookie, invitation-based registration |
| **RBAC** | 5 role dengan hierarki akses |
| **Data Warga** | Kelola KK & individu, CSV import/export |
| **Keuangan** | Uang kas, iuran bulanan, laporan keuangan |
| **Voting** | Polling anonim/terverifikasi, real-time tally |
| **Pengumuman** | Broadcast dengan kategori & lampiran |
| **Darurat** | Tombol darurat + GPS, notifikasi real-time |
| **Peta Warga** | Peta interaktif Leaflet dengan filter |
| **Ronda** | Jadwal, absensi, laporan kejadian |
| **Surat** | Pengajuan & approval surat online |
| **Kegiatan** | Jadwal kegiatan + RSVP |
| **Tamu & Paket** | Pencatatan + notifikasi ke rumah tujuan |
| **Billing** | Subscription plan, invoice, payment gateway |
| **Notifikasi** | Push, email, inbox via BullMQ |
| **Audit Log** | Append-only, masking data sensitif |
| **Dashboard** | Metrik untuk Ketua_RT dan Super_Admin |
| **PWA** | Installable, offline indicator |

---

## Tech Stack

| Kategori | Teknologi |
|----------|-----------|
| Framework | Next.js 15 App Router, React 19 |
| Bahasa | TypeScript (strict mode) |
| Database | PostgreSQL 16 + Prisma 7 |
| Cache | Redis 7 (ioredis) |
| Job Queue | BullMQ |
| DI Container | Awilix |
| Validasi | Zod |
| Form | React Hook Form |
| Server State | TanStack Query |
| Client State | Zustand |
| Peta | Leaflet + React-Leaflet |
| i18n | i18next |
| File Storage | AWS S3 / MinIO |
| Auth | JWT (jose) + bcrypt |
| Styling | Tailwind CSS 4 |
| Testing | Vitest + fast-check |

---

## Arsitektur

Clean Architecture + Domain-Driven Design dengan 21 bounded contexts:

```
src/
├── core/           # Domain logic (entities, use cases, repository interfaces)
├── infrastructure/ # Implementations (Prisma repos, Redis, BullMQ, S3)
├── presentation/   # UI (React components, ViewModels, screens)
├── app/            # Next.js routes & API handlers
└── middleware.ts   # Auth + tenant resolution
```

Dependency rule: `app → presentation → core ← infrastructure`

---

## Prasyarat

- Node.js >= 20
- Docker & Docker Compose
- npm >= 10

---

## Instalasi & Setup

```bash
# 1. Clone & install
git clone <repository-url>
cd societ-rt
npm install

# 2. Jalankan infrastructure
docker-compose up -d

# 3. Setup database
npm run prisma:generate
npx prisma migrate dev --name init
npm run prisma:seed

# 4. Jalankan aplikasi
npm run dev
```

Buka http://localhost:3000

**Login default:** `admin@societ-rt.com` / `Admin@123456` (Super_Admin)

---

## Struktur Proyek

```
societ-rt/
├── prisma/schema.prisma    # 25+ database models
├── prisma/seed.ts          # Data awal (plans, admin, feature flags)
├── src/core/domains/       # 21 domain directories
├── src/infrastructure/     # Repos, adapters, workers, DI
├── src/presentation/       # 20 feature screens, shared components
├── src/app/api/            # 22 API route groups, 40+ endpoints
├── docker-compose.yml      # PostgreSQL + Redis + MinIO
├── Dockerfile              # Production image
└── .env                    # Environment variables
```

---

## Role & Hak Akses

### Hierarki

```
Super_Admin (Level 4) — Seluruh platform
  └── Ketua_RT (Level 3) — Admin tenant
      └── Pengurus (Level 2) — Operasional
          ├── Warga (Level 1) — Akses dasar
          └── Security_Guard (Level 1) — Keamanan
```

### Matriks Akses

| Fitur | Super_Admin | Ketua_RT | Pengurus | Warga | Security_Guard |
|-------|:-----------:|:--------:|:--------:|:-----:|:--------------:|
| Manajemen Tenant | ✅ | — | — | — | — |
| Manajemen User | ✅ | ✅ | — | — | — |
| Data Warga | ✅ | ✅ | ✅ | Lihat | — |
| Keuangan | ✅ | ✅ | ✅ | Lihat | — |
| Voting (buat) | ✅ | ✅ | — | — | — |
| Voting (vote) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pengumuman | ✅ | ✅ | ✅ | Lihat | Lihat |
| Darurat (trigger) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Darurat (kelola) | ✅ | ✅ | ✅ | — | — |
| Ronda | ✅ | ✅ | ✅ | ✅ | ✅ |
| Surat (ajukan) | ✅ | ✅ | ✅ | ✅ | — |
| Surat (approve) | ✅ | ✅ | — | — | — |
| Tamu & Paket | ✅ | ✅ | ✅ | — | ✅ |
| Billing | ✅ | ✅ | — | — | — |
| Audit Log | ✅ | ✅ | — | — | — |
| Feature Flags | ✅ | — | — | — | — |
| Impersonation | ✅ | — | — | — | — |

---

## Panduan Pengguna per Role


### Super_Admin — Administrator Platform

Super_Admin mengelola seluruh platform SocieT-RT lintas tenant.

**Akses via:** `/admin`

#### Fitur:

1. **Dashboard Platform** (`/admin`) — Total tenant, MRR, total user, subscription aktif per plan
2. **Manajemen Tenant** (`/admin/tenants`) — CRUD tenant, suspend/reactivate
3. **Feature Flags** (`/admin/feature-flags`) — Override flag per tenant
4. **Impersonation** (`/admin/tenants/[id]/impersonate`) — Masuk ke tenant sebagai Ketua_RT (max 60 menit, semua aksi tercatat di audit)
5. **Tenant Health** (`/admin/tenants/[id]/health`) — User aktif, storage, API requests, aktivitas terakhir
6. **Semua fitur Ketua_RT** — Bisa mengakses semua fitur di dalam tenant manapun

---

### Ketua_RT — Administrator Tenant

Ketua_RT adalah admin utama untuk satu komunitas RT/RW.

**Akses via:** `/` (dashboard)

#### Fitur:

1. **Dashboard** (`/`) — Total warga, saldo kas, iuran belum bayar, voting aktif, alert darurat, pengumuman terbaru, kegiatan mendatang
2. **Manajemen User** (`/users`) — Daftar user, assign role (Pengurus/Warga/Security_Guard), buat invitation link. *Tidak bisa assign Super_Admin.*
3. **Branding** — Update logo, warna primer/sekunder tenant
4. **Data Warga** (`/residents`) — CRUD KK & individu, status (tetap/kontrak/kos/pindah), kategori (lansia/balita/disabilitas), kontak darurat, CSV import/export
5. **Keuangan** (`/finance`) — Catat pemasukan/pengeluaran, saldo otomatis, tracking iuran per KK per bulan, laporan keuangan per periode, export
6. **Voting** (`/voting`) — Buat voting (min 2 opsi, anonim/terverifikasi, deadline), lihat hasil real-time, ikut voting
7. **Pengumuman** (`/announcements`) — Buat pengumuman (5 kategori), lampiran (max 5 file, 10MB/file), notifikasi otomatis
8. **Darurat** (`/emergency`) — Trigger alert, kelola status (active/responding/resolved)
9. **Peta** (`/map`) — Peta interaktif, filter blok/status/kategori, popup detail rumah
10. **Ronda** (`/security/patrols`) — Jadwal ronda, lihat absensi, laporan kejadian
11. **Surat** (`/administration/letters`) — Lihat pengajuan, approve (generate PDF), reject (dengan alasan)
12. **Kegiatan** (`/events`) — Buat kegiatan, lihat RSVP
13. **Billing** (`/billing`) — Lihat plan, daftar invoice
14. **Audit Log** (`/audit`) — Log semua aksi, filter tipe/tanggal
15. **Notifikasi** (`/notifications`) — Inbox, tandai dibaca

---

### Pengurus — Staf Operasional

Pengurus membantu Ketua_RT dalam operasional harian.

#### Fitur:

1. **Data Warga** — Sama seperti Ketua_RT (CRUD, CSV, kategori)
2. **Keuangan** — Catat transaksi, iuran, lihat saldo/laporan
3. **Pengumuman** — Buat pengumuman dengan lampiran
4. **Darurat** — Trigger alert, kelola status
5. **Peta** — Lihat peta, update koordinat rumah
6. **Ronda** — Buat jadwal, lihat absensi/kejadian
7. **Surat** — Ajukan surat untuk diri sendiri
8. **Kegiatan** — Buat kegiatan, RSVP
9. **Tamu & Paket** (`/visitors`, `/packages`) — Catat tamu masuk/keluar, catat paket
10. **Invite User** — Buat invitation link
11. **Voting** — Ikut voting (tidak bisa membuat)
12. **Notifikasi** — Inbox
13. **Privasi** (`/privacy`) — Ekspor/hapus data pribadi

---

### Warga — Anggota Komunitas

Warga adalah pengguna dasar komunitas.

#### Fitur:

1. **Voting** (`/voting`) — Lihat voting aktif, cast vote (sekali per voting), lihat hasil
2. **Pengumuman** (`/announcements`) — Lihat pengumuman, filter kategori
3. **Darurat** (`/emergency`) — **Tekan tombol darurat** dengan GPS, notifikasi otomatis ke pengurus
4. **Kegiatan** (`/events`) — Lihat kegiatan, RSVP (hadir/tidak)
5. **Surat** (`/administration/letters`) — Ajukan surat pengantar/domisili/SKTM, lihat status, download PDF
6. **Ronda** (`/security/patrols`) — Lihat jadwal, check-in saat bertugas
7. **Peta** (`/map`) — Lihat peta (read-only)
8. **Data Warga** (`/residents`) — Lihat data (read-only, NIK dimasking)
9. **Keuangan** (`/finance`) — Lihat saldo & transaksi (read-only), status iuran sendiri
10. **Notifikasi** (`/notifications`) — Terima notifikasi (pengumuman, iuran, voting, kegiatan, paket, darurat)
11. **Privasi** (`/privacy`) — Ekspor data pribadi (JSON), ajukan penghapusan data, riwayat consent

---

### Security_Guard — Petugas Keamanan

Security_Guard fokus pada keamanan dan pencatatan tamu/paket.

#### Fitur:

1. **Tamu** (`/visitors`) — Catat tamu masuk (nama, tujuan, rumah tujuan), catat keluar, notifikasi otomatis ke rumah tujuan
2. **Paket** (`/packages`) — Catat paket masuk (penerima, kurir, deskripsi), notifikasi otomatis
3. **Ronda** (`/security/patrols`) — Lihat jadwal, **check-in** saat bertugas, reminder otomatis jika belum check-in 30 menit
4. **Laporan Kejadian** (`/security/incidents`) — Buat laporan (tanggal, waktu, deskripsi, lokasi, tingkat keparahan)
5. **Darurat** (`/emergency`) — Trigger alert, terima notifikasi dari warga
6. **Voting** — Ikut voting
7. **Kegiatan** — Lihat kegiatan, RSVP
8. **Pengumuman** — Lihat pengumuman (read-only)
9. **Notifikasi** — Inbox
10. **Privasi** — Ekspor/hapus data pribadi

---

## Subscription Plans

| Fitur | Free | Pro | Enterprise |
|-------|:----:|:---:|:----------:|
| Max User | 50 | 500 | Unlimited |
| Harga/bulan | Rp 0 | Rp 99.000 | Rp 299.000 |
| Pengumuman | ✅ | ✅ | ✅ |
| Data Warga & KK | ✅ | ✅ | ✅ |
| Keuangan & Iuran | — | ✅ | ✅ |
| Voting | — | ✅ | ✅ |
| Kegiatan & RSVP | — | ✅ | ✅ |
| Ronda & Keamanan | — | ✅ | ✅ |
| Tamu & Paket | — | ✅ | ✅ |
| Darurat + GPS | — | — | ✅ |
| Surat Online | — | — | ✅ |
| Peta Interaktif | — | — | ✅ |
| Audit Log | — | — | ✅ |
| Billing Management | — | — | ✅ |

---

## Environment Variables

| Variable | Required | Deskripsi |
|----------|:--------:|-----------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `JWT_SECRET` | ✅ | Secret untuk JWT (ganti di production!) |
| `S3_BUCKET` | — | Nama bucket S3 (default: `societ-rt-files`) |
| `S3_REGION` | — | Region S3 (default: `us-east-1`) |
| `S3_ENDPOINT` | — | Endpoint S3/MinIO |
| `S3_ACCESS_KEY_ID` | — | Access key S3 |
| `S3_SECRET_ACCESS_KEY` | — | Secret key S3 |
| `VAPID_PUBLIC_KEY` | — | VAPID public key (Web Push) |
| `VAPID_PRIVATE_KEY` | — | VAPID private key |

---

## Database

25+ Prisma models. Seed data: `npm run prisma:seed` (3 plans, 1 admin, feature flags).

Konvensi: camelCase di TypeScript, snake_case di database, UUID untuk semua ID, soft delete via `deleted_at`.

---

## Background Jobs (BullMQ)

| Worker | Fungsi |
|--------|--------|
| Notification | Kirim notifikasi (inbox/push/email) |
| Audit | Tulis audit log, masking data sensitif |
| Iuran Reminder | Reminder iuran belum bayar |
| Event Reminder | Reminder kegiatan H-24 jam |
| Patrol Reminder | Reminder ronda belum check-in |
| Daily Backup | `pg_dump` harian (02:00 UTC) |
| Retention | Hapus backup expired (30/90 hari) |

---

## Deployment

```bash
# Docker
docker build -t societ-rt .
docker run -p 3000:3000 -e DATABASE_URL="..." -e REDIS_URL="..." -e JWT_SECRET="..." societ-rt

# Docker Compose (dev)
docker-compose up -d
```

---

## Scripts

| Script | Deskripsi |
|--------|-----------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm test` | Run tests |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run prisma:seed` | Seed database |

---

## Lisensi

Private — Hak cipta dilindungi.
