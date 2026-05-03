# SocieT-RT — API Documentation

## Base URL

```
http://localhost:3000/api
```

## Authentication

Semua endpoint (kecuali Public) memerlukan JWT token dalam HTTP-only cookie `societ_rt_auth_token`. Login untuk mendapatkan cookie.

### Login
```
POST /api/auth/login
Body: { "email": "string", "password": "string", "tenantId": "uuid" }
Response: { "data": { "userId", "name", "email", "role" } }
```

### Register (via invitation)
```
POST /api/auth/register
Body: { "name", "email", "password", "invitationToken", "consentVersion", "tenantId" }
```

### Logout
```
POST /api/auth/logout
```

### Create Invitation
```
POST /api/auth/invitation
Body: { "email": "string", "role": "UserRole" }
Requires: Ketua_RT atau Pengurus
```

---

## Error Format

```json
{
  "code": "ERROR_CODE",
  "message": "Safe user message",
  "correlationId": "uuid"
}
```

Validation errors include field details:
```json
{
  "code": "COMMON_VALIDATION_FAILED",
  "fields": { "email": "Invalid email", "amount": "Required" }
}
```

---

## Endpoints

### Tenants
- `POST /api/tenants` — Create (Super_Admin)
- `GET /api/tenants/[id]` — Detail
- `PATCH /api/tenants/[id]` — Update branding (Ketua_RT/Super_Admin)
- `POST /api/tenants/[id]/suspend` — Suspend (Super_Admin)
- `POST /api/tenants/[id]/reactivate` — Reactivate (Super_Admin)

### Residents
- `POST /api/residents/households` — Create household
- `POST /api/residents` — Add resident
- `GET /api/residents` — List (paginated, filterable)
- `PATCH /api/residents/[id]` — Update status
- `GET /api/residents/export` — CSV export
- `POST /api/residents/import` — CSV import

### Finance
- `POST /api/finance/transactions` — Record transaction
- `GET /api/finance/transactions` — List transactions
- `GET /api/finance/balance` — Current balance
- `POST /api/finance/iuran` — Record iuran payment
- `GET /api/finance/iuran?householdId=&month=` — Iuran status
- `GET /api/finance/report?startDate=&endDate=` — Financial report

### Voting
- `POST /api/voting` — Create vote
- `GET /api/voting` — List votes
- `POST /api/voting/[id]/vote` — Cast vote `{ "optionId": "uuid" }`
- `GET /api/voting/[id]/tally` — Vote tally (cached 5s)

### Announcements
- `POST /api/announcements` — Create `{ "title", "content", "category" }`
- `GET /api/announcements?category=&page=&pageSize=` — List

### Emergency
- `POST /api/emergency` — Trigger `{ "latitude?", "longitude?" }`
- `GET /api/emergency` — Active alerts
- `PATCH /api/emergency/[id]/status` — Update `{ "status": "active|responding|resolved" }`

### Map
- `GET /api/map?block=&status=&categories=` — Markers
- `PATCH /api/map/coordinates` — Update `{ "householdId", "latitude", "longitude" }`

### Security
- `POST /api/security/patrols` — Create schedule
- `GET /api/security/patrols` — List schedules
- `POST /api/security/attendance` — Check-in
- `POST /api/security/incidents` — Report incident
- `GET /api/security/incidents` — List incidents

### Administration
- `POST /api/administration/letters` — Submit `{ "letterType", "purpose" }`
- `GET /api/administration/letters` — List
- `POST /api/administration/letters/[id]/approve` — Approve `{ "documentUrl" }`
- `POST /api/administration/letters/[id]/reject` — Reject `{ "rejectionReason" }`

### Events
- `POST /api/events` — Create event
- `GET /api/events` — List events
- `POST /api/events/[id]/rsvp` — RSVP `{ "response": "attending|not_attending" }`

### Visitors & Packages
- `POST /api/visitors` — Log visitor
- `GET /api/visitors` — List visitors
- `PATCH /api/visitors/[id]/exit` — Record exit
- `POST /api/packages` — Log package
- `GET /api/packages` — List packages

### Billing
- `POST /api/billing/invoices` — Create invoice
- `GET /api/billing/invoices` — List invoices
- `POST /api/billing/webhook` — Payment webhook (signature validated)
- `GET /api/billing/plans` — List plans

### Notifications
- `GET /api/notifications?status=&page=&pageSize=` — Inbox
- `PATCH /api/notifications/[id]/read` — Mark as read

### Audit
- `GET /api/audit?actionType=&startDate=&endDate=&page=&pageSize=` — Audit logs

### Feature Flags
- `GET /api/feature-flags` — List flags for tenant
- `POST /api/feature-flags/override` — Override `{ "featureName", "enabled", "tenantId" }`

### Files
- `POST /api/files/upload` — Upload (multipart, max 10MB)
- `GET /api/files/[key]` — Signed URL redirect

### Privacy
- `POST /api/privacy/export` — Export personal data
- `POST /api/privacy/delete` — Request deletion
- `POST /api/privacy/consent` — Record consent

### Admin (Super_Admin)
- `POST /api/admin/impersonate` — Start impersonation (max 60 min)
- `POST /api/admin/impersonate/end` — End impersonation
- `GET /api/admin/tenants/[id]/health` — Tenant health metrics

### Dashboard
- `GET /api/dashboard` — Ketua_RT metrics (cached 5 min)
- `GET /api/dashboard/platform` — Platform metrics (cached 5 min)

### Health
- `GET /api/health` — Public, no auth `{ "status": "ok", "timestamp" }`
