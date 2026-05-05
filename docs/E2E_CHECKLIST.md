# Checklist End-to-End Testing — SocieT-RT

## Prasyarat

- [ ] `npm run dev` berjalan tanpa error
- [ ] Database Neon terkoneksi (cek `GET /api/health`)
- [ ] Redis Upstash terkoneksi
- [ ] Seed data sudah dijalankan (subscription plans + users)
- [ ] User dummy untuk semua role sudah ada di database

---

## 1. Health Check

- [ ] `GET /api/health` → `{"status":"ok","timestamp":"..."}`

---

## 2. Auth — Login

### Super_Admin
- [ ] Buka `/login` → isi `admin@societ-rt.com` / `Admin@123456`
- [ ] Klik Sign In → redirect ke `/admin`
- [ ] Cookie `societ_rt_auth_token` ter-set

### Ketua_RT
- [ ] Login `ketua@societ-rt.com` / `Test@12345` → redirect ke `/`

### Pengurus
- [ ] Login `pengurus@societ-rt.com` / `Test@12345` → redirect ke `/residents`

### Warga
- [ ] Login `warga@societ-rt.com` / `Test@12345` → redirect ke `/announcements`

### Security_Guard
- [ ] Login `security@societ-rt.com` / `Test@12345` → redirect ke `/visitors`

### Error Cases
- [ ] Password salah → error message
- [ ] Email tidak terdaftar → error
- [ ] 6x gagal → `AUTH_ACCOUNT_LOCKED`

---

## 3. Auth — Logout

- [ ] `POST /api/auth/logout` → cookie dihapus
- [ ] Akses protected endpoint → 401

---

## 4. Auth — Register

- [ ] Buat invitation token (SQL/API)
- [ ] Buka `/register` → isi semua field + token → submit → sukses
- [ ] Login dengan akun baru → berhasil
- [ ] Register tanpa token → error
- [ ] Register token expired → error
- [ ] Register email duplikat → error

---

## 5. Tenant Resolution

- [ ] `GET /api/tenants/resolve?subdomain=platform` → tenant data
- [ ] `GET /api/tenants/resolve?subdomain=xxx` → 404

---

## 6. Data Warga (Ketua_RT/Pengurus)

- [ ] `POST /api/residents/households` → buat KK
- [ ] `POST /api/residents` → tambah warga
- [ ] `GET /api/residents` → list paginated
- [ ] `GET /api/residents?search=nama` → search works
- [ ] `PATCH /api/residents/[id]` → update status
- [ ] `GET /api/residents/export` → CSV download
- [ ] `POST /api/residents/import` → CSV import → summary

---

## 7. Keuangan (Ketua_RT/Pengurus)

- [ ] `POST /api/finance/transactions` pemasukan → OK
- [ ] `POST /api/finance/transactions` pengeluaran → OK
- [ ] `POST /api/finance/transactions` amount=0 → `FINANCE_INVALID_AMOUNT`
- [ ] `GET /api/finance/balance` → saldo benar
- [ ] `POST /api/finance/iuran` → catat bayar
- [ ] `GET /api/finance/iuran?householdId=&month=` → status
- [ ] `GET /api/finance/report?startDate=&endDate=` → laporan

---

## 8. Voting (Ketua_RT buat, semua vote)

- [ ] `POST /api/voting` (2+ opsi) → OK
- [ ] `POST /api/voting` (1 opsi) → `VOTING_INSUFFICIENT_OPTIONS`
- [ ] `GET /api/voting` → list
- [ ] `POST /api/voting/[id]/vote` → OK
- [ ] `POST /api/voting/[id]/vote` lagi → `VOTING_ALREADY_VOTED`
- [ ] `GET /api/voting/[id]/tally` → hasil

---

## 9. Pengumuman (Ketua_RT/Pengurus)

- [ ] `POST /api/announcements` → buat
- [ ] `GET /api/announcements` → list
- [ ] `GET /api/announcements?category=umum` → filter

---

## 10. Darurat (semua role)

- [ ] `POST /api/emergency` + GPS → alert created
- [ ] `POST /api/emergency` tanpa GPS → locationUnavailable=true
- [ ] `GET /api/emergency` → active alerts
- [ ] `PATCH /api/emergency/[id]/status` → update status

---

## 11. Peta (Ketua_RT/Pengurus)

- [ ] `GET /api/map` → markers
- [ ] `GET /api/map?block=A` → filtered
- [ ] `PATCH /api/map/coordinates` → update

---

## 12. Ronda (Ketua_RT/Pengurus/Security_Guard)

- [ ] `POST /api/security/patrols` → buat jadwal
- [ ] `GET /api/security/patrols` → list
- [ ] `POST /api/security/attendance` → check-in
- [ ] `POST /api/security/incidents` → lapor kejadian
- [ ] `GET /api/security/incidents` → list

---

## 13. Surat (Warga ajukan, Ketua_RT approve/reject)

- [ ] `POST /api/administration/letters` → ajukan
- [ ] `GET /api/administration/letters` → list
- [ ] `POST /api/administration/letters/[id]/approve` → OK
- [ ] `POST /api/administration/letters/[id]/reject` → OK + alasan

---

## 14. Kegiatan (Ketua_RT buat, semua RSVP)

- [ ] `POST /api/events` → buat
- [ ] `GET /api/events` → list
- [ ] `POST /api/events/[id]/rsvp` → attending
- [ ] `POST /api/events/[id]/rsvp` lagi → `EVENT_DUPLICATE_RSVP`

---

## 15. Tamu & Paket (Security_Guard)

- [ ] `POST /api/visitors` → catat masuk
- [ ] `GET /api/visitors` → list
- [ ] `PATCH /api/visitors/[id]/exit` → catat keluar
- [ ] `POST /api/packages` → catat paket
- [ ] `GET /api/packages` → list

---

## 16. Billing (Super_Admin/Ketua_RT)

- [ ] `GET /api/billing/plans` → 3 plans
- [ ] `POST /api/billing/invoices` → buat invoice
- [ ] `GET /api/billing/invoices` → list

---

## 17. Feature Flags (Super_Admin)

- [ ] `GET /api/feature-flags` → flags
- [ ] `POST /api/feature-flags/override` → override

---

## 18. Notifikasi

- [ ] `GET /api/notifications` → inbox
- [ ] `PATCH /api/notifications/[id]/read` → mark read

---

## 19. Audit Log (Ketua_RT/Super_Admin)

- [ ] `GET /api/audit` → log entries
- [ ] `GET /api/audit?actionType=user_login` → filtered
- [ ] Data sensitif dimasking (NIK, phone)

---

## 20. Dashboard

- [ ] `GET /api/dashboard` (Ketua_RT) → metrik
- [ ] `GET /api/dashboard/platform` (Super_Admin) → metrik

---

## 21. File Upload

- [ ] `POST /api/files/upload` → upload OK
- [ ] `GET /api/files/[key]` → signed URL

---

## 22. Privasi

- [ ] `POST /api/privacy/consent` → OK
- [ ] `POST /api/privacy/export` → data
- [ ] `POST /api/privacy/delete` → OK

---

## 23. Impersonation (Super_Admin)

- [ ] `POST /api/admin/impersonate` → start
- [ ] `POST /api/admin/impersonate/end` → end
- [ ] `GET /api/admin/tenants/[id]/health` → metrics

---

## 24. Security

- [ ] Tanpa cookie → 401
- [ ] Response headers: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, X-Correlation-Id
- [ ] Rate limit login: 10 req/min → 429
- [ ] Cross-tenant access → ditolak

---

## 25. UI Pages

- [ ] `/login` — form + dev credentials
- [ ] `/register` — form lengkap
- [ ] `/` — dashboard Ketua_RT
- [ ] `/admin` — dashboard Super_Admin
- [ ] `/residents` — data warga
- [ ] `/finance` — keuangan
- [ ] `/voting` — voting
- [ ] `/announcements` — pengumuman
- [ ] `/emergency` — darurat
- [ ] `/map` — peta Leaflet
- [ ] `/security/patrols` — ronda
- [ ] `/administration/letters` — surat
- [ ] `/events` — kegiatan
- [ ] `/visitors` — tamu
- [ ] `/packages` — paket
- [ ] `/notifications` — inbox
- [ ] `/audit` — audit log
- [ ] `/billing` — billing
- [ ] `/privacy` — privasi
