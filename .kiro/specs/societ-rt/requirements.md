# Requirements Document — SocieT-RT

## Introduction

SocieT-RT adalah platform digital multi-tenant SaaS untuk pengelolaan RT/RW/perumahan/komunitas warga. Setiap tenant merepresentasikan satu RT, RW, cluster, atau komunitas. Sistem dibangun dengan arsitektur Clean Architecture + DDD menggunakan Next.js 15 App Router, TypeScript, PostgreSQL, Prisma ORM, Redis, dan BullMQ. Sistem harus scalable untuk mendukung ribuan tenant secara bersamaan.

## Glossary

- **Tenant**: Satu unit organisasi RT/RW/cluster/komunitas yang terisolasi dalam sistem. Setiap tenant memiliki data, konfigurasi, dan branding tersendiri.
- **Super_Admin**: Role pengguna dengan akses penuh ke seluruh tenant dan konfigurasi platform SaaS.
- **Ketua_RT**: Role pengguna sebagai administrator tenant, memiliki akses penuh dalam satu tenant.
- **Pengurus**: Role pengguna sebagai pengurus RT dalam satu tenant, memiliki akses operasional terbatas.
- **Warga**: Role pengguna sebagai anggota komunitas dalam satu tenant, memiliki akses dasar.
- **Security_Guard**: Role pengguna sebagai petugas keamanan dalam satu tenant, memiliki akses ke modul keamanan dan tamu/paket.
- **Platform**: Keseluruhan sistem SocieT-RT yang mencakup semua tenant.
- **Tenant_Guard**: Middleware yang memastikan setiap request API difilter berdasarkan tenant_id pengguna yang terautentikasi.
- **Auth_System**: Subsistem yang menangani autentikasi, otorisasi, dan manajemen sesi pengguna.
- **Resident_Registry**: Subsistem yang menangani pengelolaan data warga dan kartu keluarga.
- **Finance_System**: Subsistem yang menangani pengelolaan uang kas RT, iuran, dan laporan keuangan.
- **Voting_System**: Subsistem yang menangani pembuatan dan pelaksanaan voting warga.
- **Announcement_System**: Subsistem yang menangani pembuatan dan distribusi pengumuman.
- **Emergency_System**: Subsistem yang menangani tombol darurat dan notifikasi keadaan darurat.
- **Map_System**: Subsistem yang menangani peta warga dan titik lokasi rumah.
- **Security_System**: Subsistem yang menangani jadwal ronda, absensi, dan laporan kejadian keamanan.
- **Administration_System**: Subsistem yang menangani layanan administrasi surat-menyurat RT.
- **Event_System**: Subsistem yang menangani jadwal kegiatan dan RSVP.
- **Visitor_System**: Subsistem yang menangani pencatatan tamu dan paket.
- **Billing_System**: Subsistem yang menangani subscription plan, billing, dan limit fitur per tenant.
- **Notification_Engine**: Subsistem yang menangani pengiriman notifikasi push, email, dan inbox.
- **Audit_Logger**: Subsistem yang mencatat seluruh aksi penting dalam sistem untuk keperluan audit.
- **Feature_Flag_System**: Subsistem yang menangani pengaktifan dan penonaktifan fitur per tenant berdasarkan plan.
- **Dashboard_System**: Subsistem yang menampilkan ringkasan data dan metrik untuk Ketua_RT dan Super_Admin.
- **DomainResult**: Pola pengembalian hasil dari repository dan use case yang membungkus success dan error secara eksplisit.
- **Subscription_Plan**: Paket langganan tenant yang menentukan fitur dan limit yang tersedia (Free, Pro, Enterprise).
- **Household**: Unit kartu keluarga (KK) yang berisi satu atau lebih data individu warga.
- **Iuran**: Pembayaran rutin bulanan yang wajib dibayar oleh setiap warga atau rumah tangga.
- **File_Storage**: Subsistem yang menangani upload, penyimpanan, dan akses file menggunakan S3-compatible object storage.
- **Signed_URL**: URL sementara dengan waktu kedaluwarsa yang memberikan akses aman ke file di object storage tanpa mengekspos credential.
- **Impersonation**: Fitur yang memungkinkan Super_Admin mengakses tenant sebagai Ketua_RT secara aman dengan audit trail lengkap dan batas waktu.
- **Correlation_ID**: Identifier unik yang dihasilkan per request HTTP dan dipropagasi ke seluruh operasi downstream untuk keperluan tracing dan debugging.
- **Soft_Delete**: Pola penghapusan data di mana record ditandai sebagai dihapus tetapi tetap tersimpan di database untuk keperluan audit dan recovery.
- **Invoice**: Dokumen tagihan yang dihasilkan oleh Billing_System untuk setiap siklus pembayaran subscription tenant.
- **PWA**: Progressive Web App — aplikasi web yang dapat diinstal di perangkat mobile dengan kemampuan offline dan push notification.
- **Security_Center**: Subsistem dashboard keamanan realtime yang mengintegrasikan incident management, gate monitoring, CCTV monitoring, patrol management, dan security analytics dalam satu tampilan terpadu.
- **Incident_Manager**: Subsistem yang menangani lifecycle insiden keamanan dari pelaporan, eskalasi, penanganan, hingga resolusi.
- **Gate_Monitor**: Subsistem yang menangani monitoring status gerbang komunitas secara realtime melalui sensor IoT.
- **CCTV_System**: Subsistem yang menangani monitoring kamera CCTV termasuk live streaming (RTSP/WebRTC), snapshot capture, motion detection, dan storage management.
- **Patrol_Manager**: Subsistem yang menangani manajemen patroli keamanan termasuk route planning, GPS tracking, checkpoint verification, dan patrol analytics.
- **Alarm_System**: Subsistem yang menangani smart alarm termasuk siren activation, alarm zones, alarm scheduling, dan alarm event processing.
- **SocieT_Home**: Subsistem yang memungkinkan warga memasangkan dan mengontrol perangkat smart home (Tuya-based) dari dalam aplikasi SocieT-RT.
- **IoT_Gateway**: Subsistem yang menangani integrasi dengan Tuya IoT Cloud termasuk device pairing, synchronization, command execution, webhook processing, dan health monitoring.
- **Automation_Engine**: Subsistem rule engine yang memproses aturan IF/THEN untuk event keamanan dan IoT, mengeksekusi aksi otomatis berdasarkan kondisi yang terpenuhi.
- **Realtime_Bus**: Subsistem event bus realtime yang menangani WebSocket connections, Redis pub/sub, event routing, dan notification queue untuk seluruh event keamanan dan IoT.
- **IoT_Device**: Perangkat smart home yang terhubung ke platform melalui Tuya IoT Cloud, termasuk panic button, smart siren, smart lock, CCTV, motion sensor, smoke detector, door sensor, gate sensor, smart switch, dan smart lighting.
- **Device_Event**: Event yang dihasilkan oleh IoT_Device seperti panic_button_pressed, gate_open, gate_closed, motion_detected, smoke_detected, alarm_triggered, smart_lock_opened, cctv_motion_detected, device_online, device_offline, battery_low, dan emergency_alert.
- **Automation_Rule**: Aturan IF/THEN yang didefinisikan oleh Ketua_RT atau Pengurus untuk mengotomasi respons terhadap Device_Event tertentu.
- **Security_Event**: Event keamanan yang dihasilkan dari Device_Event, incident, atau alert yang memerlukan perhatian Security_Guard atau Ketua_RT.
- **Home_Owner**: Warga yang memiliki rumah dan berhak memasangkan serta mengontrol IoT_Device pada rumahnya sendiri.
- **Shared_Security_Event**: Subset dari Device_Event yang bersifat keamanan publik dan dapat diakses oleh Ketua_RT, Pengurus, dan Security_Guard (panic_button_pressed, smoke_detected, gate_open_too_long, alarm_triggered, emergency_alert, motion_detection_alert).
- **Private_Home_Event**: Device_Event yang bersifat privat dan hanya dapat diakses oleh Home_Owner dari rumah yang bersangkutan (smart_lock_opened, smart_switch_toggled, lighting_changed, device_online, device_offline).

## Requirements

### Requirement 1: Multi-Tenant Data Isolation

**User Story:** As a Super_Admin, I want every tenant's data to be completely isolated within a shared database schema, so that no tenant can access another tenant's data.

#### Acceptance Criteria

1. THE Platform SHALL store all tenant data in a single shared PostgreSQL database using a shared schema approach.
2. THE Platform SHALL include a `tenant_id` column on every data table except the tenant table itself and platform-level configuration tables.
3. WHEN a database query is executed, THE Tenant_Guard SHALL append a `tenant_id` filter matching the authenticated user's tenant to every query.
4. IF a request is received without a valid tenant context, THEN THE Tenant_Guard SHALL reject the request with an authorization error and return error code `TENANT_CONTEXT_MISSING`.
5. IF a user attempts to access a resource belonging to a different tenant, THEN THE Tenant_Guard SHALL reject the request with an authorization error and return error code `TENANT_ACCESS_DENIED`.
6. THE Platform SHALL support concurrent operation of at least 1000 tenants without degradation in query response time beyond 200ms for standard CRUD operations.

### Requirement 2: Tenant Registration and Configuration

**User Story:** As a Super_Admin, I want to register new tenants and configure their RT/RW details, so that each community can onboard onto the platform independently.

#### Acceptance Criteria

1. WHEN a new tenant registration request is submitted with valid data (name, RT/RW number, address, contact person), THE Platform SHALL create a new tenant record and assign a unique tenant_id.
2. WHEN a tenant is created, THE Platform SHALL generate a unique subdomain for the tenant based on the tenant name.
3. WHEN a Ketua_RT updates tenant branding (logo URL, primary color hex code, secondary color hex code), THE Platform SHALL persist the branding configuration for that tenant.
4. THE Platform SHALL associate each tenant with exactly one Subscription_Plan at any given time.
5. IF a tenant registration request contains a duplicate subdomain or a duplicate RT/RW number within the same region, THEN THE Platform SHALL reject the registration with error code `TENANT_DUPLICATE`.
6. WHEN a tenant is created, THE Audit_Logger SHALL record the creation event with the actor, timestamp, and tenant details.

### Requirement 3: Authentication

**User Story:** As a Warga, I want to securely log in and register to the platform, so that I can access my community's features.

#### Acceptance Criteria

1. WHEN a user submits valid login credentials (email and password), THE Auth_System SHALL authenticate the user and issue a JWT session token stored in an HTTP-only secure cookie.
2. WHEN a user submits a registration request with valid data (name, email, password, tenant invitation code), THE Auth_System SHALL create a new user account associated with the correct tenant.
3. WHEN a Ketua_RT or Pengurus generates an invitation link for a new user, THE Auth_System SHALL create a time-limited invitation token valid for 72 hours.
4. IF a login attempt uses invalid credentials, THEN THE Auth_System SHALL reject the attempt with error code `AUTH_INVALID_CREDENTIALS` and increment the failed attempt counter.
5. IF a user exceeds 5 failed login attempts within 15 minutes, THEN THE Auth_System SHALL temporarily lock the account for 30 minutes and return error code `AUTH_ACCOUNT_LOCKED`.
6. WHEN a user logs out, THE Auth_System SHALL invalidate the session cookie and clear all client-side session state.
7. IF a request contains an expired or invalid JWT token, THEN THE Auth_System SHALL reject the request with error code `AUTH_TOKEN_INVALID` and return HTTP status 401.
8. THE Auth_System SHALL set cookies with `HttpOnly: true`, `Secure: true` in production, and `SameSite: Lax`.

### Requirement 4: Role-Based Access Control

**User Story:** As a Ketua_RT, I want to assign roles to users within my tenant, so that each user has appropriate access to features.

#### Acceptance Criteria

1. THE Auth_System SHALL enforce five distinct roles: Super_Admin, Ketua_RT, Pengurus, Warga, and Security_Guard.
2. WHEN a user with Ketua_RT role assigns a role to another user within the same tenant, THE Auth_System SHALL update the user's role.
3. IF a user attempts to access a feature or endpoint that requires a higher role than the user possesses, THEN THE Auth_System SHALL reject the request with error code `AUTH_INSUFFICIENT_ROLE` and return HTTP status 403.
4. THE Auth_System SHALL validate authorization on the server side for every protected API endpoint, independent of client-side role checks.
5. IF a Ketua_RT attempts to assign the Super_Admin role, THEN THE Auth_System SHALL reject the operation with error code `AUTH_ROLE_ESCALATION_DENIED`.
6. WHEN a user's role is changed, THE Audit_Logger SHALL record the role change event with the actor, target user, previous role, new role, and timestamp.

### Requirement 5: Resident Data Management

**User Story:** As a Pengurus, I want to manage household and individual resident data, so that the RT has an accurate and up-to-date registry.

#### Acceptance Criteria

1. WHEN a Pengurus creates a new Household record with valid data (household number, address, block), THE Resident_Registry SHALL store the Household within the current tenant.
2. WHEN a Pengurus adds an individual resident to a Household with valid data (name, NIK, date of birth, gender, phone number), THE Resident_Registry SHALL associate the resident with the specified Household.
3. THE Resident_Registry SHALL support the following residency statuses for each resident: tetap (permanent), kontrak (contract), kos (boarding), and pindah (moved).
4. WHEN a Pengurus updates a resident's status, THE Resident_Registry SHALL persist the new status and record the change timestamp.
5. THE Resident_Registry SHALL support tagging residents with special categories: lansia (elderly, age 60 and above), balita (toddler, age 5 and below), and disabilitas (disability).
6. WHEN a Pengurus stores emergency contact information for a resident (contact name, phone number, relationship), THE Resident_Registry SHALL associate the emergency contact with the specified resident.
7. WHEN a Pengurus exports resident data, THE Resident_Registry SHALL generate a downloadable file in CSV format containing all resident records within the current tenant.
8. WHEN a Pengurus imports resident data from a valid CSV file, THE Resident_Registry SHALL parse and create resident records within the current tenant.
9. IF an imported CSV file contains invalid or incomplete rows, THEN THE Resident_Registry SHALL skip the invalid rows, create valid records, and return a summary report listing skipped rows with error descriptions.
10. WHEN resident data is created, updated, or deleted, THE Audit_Logger SHALL record the mutation event with the actor, timestamp, and changed fields.

### Requirement 6: Resident Data CSV Round-Trip

**User Story:** As a Pengurus, I want to export and re-import resident data without data loss, so that I can reliably back up and transfer data.

#### Acceptance Criteria

1. THE Resident_Registry SHALL format resident data into valid CSV following a defined column schema (household_number, name, NIK, date_of_birth, gender, phone, status, categories, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship).
2. THE Resident_Registry SHALL parse CSV files back into resident records following the same column schema.
3. FOR ALL valid resident datasets, exporting to CSV then importing the CSV back SHALL produce an equivalent dataset (round-trip property).

### Requirement 7: Financial Management (Uang Kas)

**User Story:** As a Ketua_RT, I want to manage the community treasury including income, expenses, and monthly dues, so that financial records are transparent and accurate.

#### Acceptance Criteria

1. THE Finance_System SHALL maintain a running balance (saldo kas) for each tenant, calculated as the sum of all income transactions minus the sum of all expense transactions.
2. WHEN a Pengurus records an income transaction with valid data (amount greater than zero, description, date, category), THE Finance_System SHALL add the transaction and update the tenant's running balance.
3. WHEN a Pengurus records an expense transaction with valid data (amount greater than zero, description, date, category), THE Finance_System SHALL subtract the transaction amount from the tenant's running balance.
4. THE Finance_System SHALL track monthly Iuran status for each Household, marking each month as paid or unpaid.
5. WHEN an Iuran payment is recorded for a Household, THE Finance_System SHALL update the Iuran status for the corresponding month to paid.
6. WHEN the Iuran due date passes and a Household has not paid, THE Notification_Engine SHALL send a payment reminder notification to the head of the Household.
7. WHEN a Ketua_RT requests a financial report for a date range, THE Finance_System SHALL generate a report containing all transactions, categorized totals, and the opening and closing balance for the specified period.
8. WHEN a Ketua_RT exports a financial report, THE Finance_System SHALL generate the report in PDF or Excel format.
9. IF a transaction amount is zero or negative for income, or zero or negative for expense, THEN THE Finance_System SHALL reject the transaction with error code `FINANCE_INVALID_AMOUNT`.
10. WHEN a financial transaction is created, updated, or deleted, THE Audit_Logger SHALL record the mutation event with the actor, timestamp, amount, and transaction type.

### Requirement 8: Voting

**User Story:** As a Ketua_RT, I want to create community votes with configurable options, so that residents can participate in democratic decision-making.

#### Acceptance Criteria

1. WHEN a Ketua_RT creates a new vote with valid data (title, description, options list with at least 2 options, deadline timestamp), THE Voting_System SHALL create the vote within the current tenant.
2. THE Voting_System SHALL support two voting modes: anonymous (voter identity is not recorded with the vote choice) and verified (voter identity is recorded with the vote choice).
3. WHEN a Warga casts a vote before the deadline, THE Voting_System SHALL record the vote and prevent the same user from voting again on the same vote.
4. IF a Warga attempts to cast a vote after the deadline has passed, THEN THE Voting_System SHALL reject the vote with error code `VOTING_DEADLINE_PASSED`.
5. IF a Warga attempts to vote on a vote they have already voted on, THEN THE Voting_System SHALL reject the vote with error code `VOTING_ALREADY_VOTED`.
6. WHILE a vote is active (before the deadline), THE Voting_System SHALL provide real-time vote tallies updated within 5 seconds of each new vote.
7. WHEN a vote is created or a vote is cast, THE Audit_Logger SHALL record the event with the actor and timestamp.

### Requirement 9: Announcements

**User Story:** As a Ketua_RT, I want to broadcast announcements to all residents with categories and attachments, so that important information reaches the community.

#### Acceptance Criteria

1. WHEN a Ketua_RT or Pengurus creates an announcement with valid data (title, content, category), THE Announcement_System SHALL store the announcement within the current tenant.
2. THE Announcement_System SHALL support categorizing announcements with the following categories: umum, keamanan, keuangan, kegiatan, and darurat.
3. WHEN an announcement is created with file attachments (maximum 5 files, each up to 10MB), THE Announcement_System SHALL store the attachments and associate them with the announcement.
4. WHEN an announcement is published, THE Notification_Engine SHALL send a notification to all Warga within the tenant.
5. IF an attachment exceeds 10MB or the total number of attachments exceeds 5, THEN THE Announcement_System SHALL reject the attachment with error code `ANNOUNCEMENT_ATTACHMENT_LIMIT_EXCEEDED`.

### Requirement 10: Emergency Alert

**User Story:** As a Warga, I want to trigger an emergency alert that sends my location to community administrators, so that I can get help quickly in dangerous situations.

#### Acceptance Criteria

1. WHEN a Warga presses the emergency button and grants location access, THE Emergency_System SHALL create an emergency alert record containing the user's GPS coordinates (latitude and longitude), timestamp, and alert status set to "active".
2. WHEN an emergency alert is created, THE Notification_Engine SHALL send a real-time notification to all users with Ketua_RT, Pengurus, and Security_Guard roles within the tenant within 3 seconds.
3. WHEN a Ketua_RT or Pengurus updates an emergency alert status (active, responding, resolved), THE Emergency_System SHALL persist the new status and record the status change timestamp.
4. IF the user's device does not provide GPS coordinates, THEN THE Emergency_System SHALL create the alert without coordinates and set a flag `location_unavailable` to true.
5. WHEN an emergency alert is created or its status changes, THE Audit_Logger SHALL record the event with the actor, timestamp, alert ID, and new status.

### Requirement 11: Resident Map

**User Story:** As a Ketua_RT, I want to view a map showing the location of each household, so that I can visualize the community layout and filter by criteria.

#### Acceptance Criteria

1. THE Map_System SHALL display an interactive map (using Leaflet or Google Maps) showing marker pins for each Household that has registered GPS coordinates within the current tenant.
2. WHEN a user clicks on a Household marker, THE Map_System SHALL display a popup containing the Household number, address, head of household name, and number of residents.
3. THE Map_System SHALL support filtering markers by block or cluster, residency status, and special categories (lansia, balita).
4. WHEN a Pengurus sets or updates GPS coordinates for a Household, THE Map_System SHALL persist the coordinates and update the map marker position.

### Requirement 12: Security Patrol (Ronda)

**User Story:** As a Ketua_RT, I want to manage patrol schedules and track attendance, so that community security is organized and accountable.

#### Acceptance Criteria

1. WHEN a Ketua_RT or Pengurus creates a patrol schedule with valid data (date, time slot, list of assigned Warga or Security_Guard), THE Security_System SHALL store the schedule within the current tenant.
2. WHEN a Security_Guard or assigned Warga records patrol attendance (check-in timestamp), THE Security_System SHALL mark the attendance for the corresponding schedule entry.
3. WHEN a Pengurus creates an incident report with valid data (date, time, description, location, severity level), THE Security_System SHALL store the incident report within the current tenant.
4. IF a scheduled patrol member does not check in within 30 minutes of the scheduled start time, THE Notification_Engine SHALL send a reminder notification to the patrol member.

### Requirement 13: RT Administration Services

**User Story:** As a Warga, I want to request administrative letters (surat pengantar, domisili, SKTM) online, so that I do not need to visit the RT office physically.

#### Acceptance Criteria

1. WHEN a Warga submits a letter request with valid data (letter type: surat_pengantar, domisili, or SKTM; purpose description), THE Administration_System SHALL create a letter request with status "pending" within the current tenant.
2. WHEN a Ketua_RT approves a letter request, THE Administration_System SHALL update the request status to "approved" and generate a downloadable PDF document containing the letter content, RT header, and approval signature placeholder.
3. WHEN a Ketua_RT rejects a letter request with a rejection reason, THE Administration_System SHALL update the request status to "rejected" and store the rejection reason.
4. WHEN a letter request status changes, THE Notification_Engine SHALL send a notification to the requesting Warga with the updated status.
5. WHEN a letter request is approved or rejected, THE Audit_Logger SHALL record the decision with the actor, timestamp, request ID, and decision.

### Requirement 14: Community Events

**User Story:** As a Ketua_RT, I want to create community events with RSVP tracking, so that residents can be informed and confirm their attendance.

#### Acceptance Criteria

1. WHEN a Ketua_RT or Pengurus creates an event with valid data (title, description, date, time, location), THE Event_System SHALL store the event within the current tenant.
2. WHEN a Warga submits an RSVP for an event (attending or not attending), THE Event_System SHALL record the RSVP response and prevent duplicate RSVPs from the same user for the same event.
3. WHEN an event date is within 24 hours, THE Notification_Engine SHALL send a reminder notification to all Warga who have RSVP'd as attending.
4. IF a Warga attempts to submit a duplicate RSVP for the same event, THEN THE Event_System SHALL reject the submission with error code `EVENT_DUPLICATE_RSVP`.

### Requirement 15: Visitor and Package Logging

**User Story:** As a Security_Guard, I want to log visitors and packages entering the community, so that residents are notified and a security record is maintained.

#### Acceptance Criteria

1. WHEN a Security_Guard logs a visitor entry with valid data (visitor name, purpose, destination Household, entry timestamp), THE Visitor_System SHALL store the visitor record within the current tenant.
2. WHEN a Security_Guard logs a package arrival with valid data (recipient Household, courier name, package description, arrival timestamp), THE Visitor_System SHALL store the package record within the current tenant.
3. WHEN a visitor or package is logged for a Household, THE Notification_Engine SHALL send a notification to the head of the destination Household.
4. WHEN a Security_Guard records a visitor exit (exit timestamp), THE Visitor_System SHALL update the visitor record with the exit timestamp.

### Requirement 16: SaaS Billing and Subscription

**User Story:** As a Super_Admin, I want to manage subscription plans and tenant billing, so that the platform can operate as a sustainable SaaS business.

#### Acceptance Criteria

1. THE Billing_System SHALL support three Subscription_Plans: Free, Pro, and Enterprise, each with defined feature limits and user count limits.
2. WHEN a tenant subscribes to a plan, THE Billing_System SHALL associate the tenant with the selected plan and enforce the plan's limits.
3. WHILE a tenant is on the Free plan, THE Billing_System SHALL enforce a maximum user limit of 50 users and restrict access to features not included in the Free plan.
4. WHILE a tenant is on the Pro plan, THE Billing_System SHALL enforce a maximum user limit of 500 users and enable all standard features.
5. WHILE a tenant is on the Enterprise plan, THE Billing_System SHALL enforce no user limit and enable all features including add-ons.
6. IF a tenant attempts to add a user beyond the plan's user limit, THEN THE Billing_System SHALL reject the operation with error code `BILLING_USER_LIMIT_EXCEEDED`.
7. WHEN a tenant's subscription plan changes, THE Audit_Logger SHALL record the change with the actor, timestamp, previous plan, and new plan.

### Requirement 17: Notification Engine

**User Story:** As a Warga, I want to receive notifications for important events (announcements, payments, votes, emergencies, events, packages), so that I stay informed about community activities.

#### Acceptance Criteria

1. THE Notification_Engine SHALL support three notification channels: push notification, email (placeholder implementation), and in-app inbox.
2. WHEN a notification trigger event occurs (announcement published, Iuran reminder, vote created, emergency alert, event reminder, package arrival), THE Notification_Engine SHALL create a notification record and dispatch it through configured channels.
3. THE Notification_Engine SHALL process notification dispatch asynchronously using BullMQ background jobs to avoid blocking the triggering operation.
4. WHEN a Warga views the notification inbox, THE Notification_Engine SHALL return a paginated list of notifications for the authenticated user, ordered by creation timestamp descending.
5. WHEN a Warga marks a notification as read, THE Notification_Engine SHALL update the notification status to "read".
6. IF a notification dispatch fails (e.g., push service unavailable), THEN THE Notification_Engine SHALL retry the dispatch up to 3 times with exponential backoff and log the failure with error code `NOTIFICATION_DISPATCH_FAILED`.

### Requirement 18: Audit Logging

**User Story:** As a Super_Admin, I want all important actions to be recorded in an immutable audit log, so that the platform maintains accountability and traceability.

#### Acceptance Criteria

1. THE Audit_Logger SHALL record audit entries for the following action categories: financial transactions, voting actions, emergency alerts, resident data mutations, role changes, tenant configuration changes, and subscription changes.
2. THE Audit_Logger SHALL store each audit entry with the following fields: audit_id, tenant_id, actor_user_id, action_type, resource_type, resource_id, details (JSON), ip_address, and timestamp.
3. THE Audit_Logger SHALL process audit log writes asynchronously using BullMQ to avoid impacting the response time of the triggering operation.
4. WHEN a Ketua_RT or Super_Admin queries the audit log, THE Audit_Logger SHALL return a paginated, filterable list of audit entries for the specified tenant.
5. THE Audit_Logger SHALL store audit entries as append-only records that cannot be modified or deleted through the application API.
6. THE Audit_Logger SHALL exclude sensitive data (passwords, tokens, OTP) from audit entry details.

### Requirement 19: Feature Flags

**User Story:** As a Super_Admin, I want to enable or disable specific features per tenant based on their subscription plan, so that feature access is controlled and monetizable.

#### Acceptance Criteria

1. THE Feature_Flag_System SHALL maintain a mapping of features to Subscription_Plans, defining which features are available for each plan.
2. WHEN a request accesses a feature-flagged endpoint, THE Feature_Flag_System SHALL check whether the feature is enabled for the requesting tenant's current plan.
3. IF a tenant attempts to access a feature that is disabled for their current plan, THEN THE Feature_Flag_System SHALL reject the request with error code `FEATURE_DISABLED` and return HTTP status 403.
4. WHEN a Super_Admin manually overrides a feature flag for a specific tenant (enable or disable), THE Feature_Flag_System SHALL persist the override and apply it immediately.
5. WHEN a feature flag is overridden, THE Audit_Logger SHALL record the override with the actor, timestamp, tenant, feature name, and new state.

### Requirement 20: Dashboard

**User Story:** As a Ketua_RT, I want to see a dashboard summarizing key community metrics, so that I can monitor the community's status at a glance.

#### Acceptance Criteria

1. WHEN a Ketua_RT accesses the dashboard, THE Dashboard_System SHALL display the following metrics for the current tenant: total residents, current kas balance, count of unpaid Iuran for the current month, count of active votes, count of active emergency alerts, count of recent announcements (last 30 days), and count of upcoming events (next 30 days).
2. WHEN a Super_Admin accesses the platform dashboard, THE Dashboard_System SHALL display the following platform-wide metrics: total tenants, monthly recurring revenue (MRR), total user count across all tenants, and count of active subscriptions by plan.
3. THE Dashboard_System SHALL cache dashboard metrics in Redis with a time-to-live of 5 minutes to optimize query performance.
4. WHEN cached dashboard data expires, THE Dashboard_System SHALL recalculate metrics from the database on the next request.

### Requirement 21: API Security and Input Validation

**User Story:** As a Super_Admin, I want all API endpoints to be secured with proper authentication, authorization, tenant isolation, and input validation, so that the platform is protected against unauthorized access and malicious input.

#### Acceptance Criteria

1. THE Platform SHALL validate all API request inputs using Zod schemas before processing.
2. IF an API request contains invalid input, THEN THE Platform SHALL return HTTP status 400 with a structured error response containing error code `COMMON_VALIDATION_FAILED` and field-level error details.
3. THE Platform SHALL protect all API endpoints (except login, register, and public health check) with JWT authentication middleware.
4. THE Platform SHALL enforce rate limiting on the login endpoint, allowing a maximum of 10 requests per minute per IP address.
5. THE Platform SHALL return sanitized error responses that do not expose stack traces, internal class names, SQL queries, or internal endpoint URLs.
6. THE Platform SHALL set security headers on all responses: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: strict-origin-when-cross-origin`.

### Requirement 22: Error Handling Consistency

**User Story:** As a developer, I want all errors to follow a consistent structure with classified error types, so that debugging is efficient and user-facing messages are safe.

#### Acceptance Criteria

1. THE Platform SHALL classify all errors into one of seven types: validation, business, authentication, authorization, not_found, technical, and unexpected.
2. THE Platform SHALL include a stable error code (e.g., `AUTH_TOKEN_EXPIRED`, `FINANCE_INVALID_AMOUNT`) in every error response.
3. THE Platform SHALL use the DomainResult pattern for all repository and use case return values, making success and error paths explicit.
4. THE Platform SHALL map error types to appropriate HTTP status codes: validation to 400, authentication to 401, authorization to 403, not_found to 404, business conflicts to 409, and unexpected to 500.
5. IF an unexpected error occurs, THEN THE Platform SHALL log the error with correlation ID, error code, route, and severity, and return a generic safe error message to the client.

### Requirement 23: Background Job Processing

**User Story:** As a developer, I want asynchronous operations (notifications, audit logs, reminders) to be processed via background jobs, so that API response times remain fast.

#### Acceptance Criteria

1. THE Platform SHALL use BullMQ with Redis as the message broker for all background job processing.
2. WHEN a background job fails, THE Platform SHALL retry the job up to 3 times with exponential backoff before marking it as failed.
3. IF a background job fails after all retry attempts, THEN THE Platform SHALL log the failure with error code `JOB_PROCESSING_FAILED`, job type, job ID, and error details.
4. THE Platform SHALL process the following operations as background jobs: notification dispatch, audit log writes, Iuran payment reminders, and event reminders.

### Requirement 24: Backup, Recovery, and Data Retention

**User Story:** As a Super_Admin, I want automated database backups with clear retention and recovery procedures, so that the platform can recover from data loss incidents.

#### Acceptance Criteria

1. THE Platform SHALL perform automated daily database backups of the PostgreSQL database at a configurable time (default: 02:00 UTC).
2. THE Platform SHALL retain daily backups for a minimum of 30 days and weekly backups for a minimum of 90 days.
3. WHEN a Super_Admin initiates a database restore from a specific backup, THE Platform SHALL restore the database to the state captured in the selected backup.
4. THE Platform SHALL store backups in a separate storage location from the primary database to protect against single-point-of-failure.
5. WHEN a backup completes successfully or fails, THE Platform SHALL log the backup event with status, timestamp, backup size, and duration.
6. THE Audit_Logger SHALL retain audit log entries for a minimum of 365 days before eligible for archival.
7. THE Platform SHALL apply soft delete to the following record types: resident data (status pindah), financial transactions, and audit log entries. Soft-deleted records SHALL remain queryable by Ketua_RT and Super_Admin with an explicit filter.
8. THE Platform SHALL prevent hard deletion of financial transaction records through the application API.

### Requirement 25: Observability and Monitoring

**User Story:** As a developer, I want structured logging, distributed tracing, and monitoring for all platform operations, so that issues can be detected and diagnosed quickly.

#### Acceptance Criteria

1. THE Platform SHALL use structured JSON logging for all application logs, including fields: timestamp, level, message, correlation_id, tenant_id, user_id, route, and duration_ms.
2. THE Platform SHALL generate a unique correlation_id for each incoming HTTP request and propagate the correlation_id to all downstream operations including background jobs.
3. THE Platform SHALL record API latency metrics (p50, p95, p99) and error rate metrics for all API endpoints.
4. THE Platform SHALL record background job metrics: queue depth, processing time, success rate, and failure rate per job type.
5. IF an API endpoint response time exceeds 2000ms, THEN THE Platform SHALL log a warning with the endpoint path, duration, tenant_id, and correlation_id.
6. IF the background job queue depth exceeds 1000 pending jobs, THEN THE Platform SHALL log a warning with the queue name and current depth.
7. THE Platform SHALL expose a health check endpoint at `/api/health` that returns the status of database connectivity, Redis connectivity, and BullMQ worker status without requiring authentication.

### Requirement 26: File Storage

**User Story:** As a Pengurus, I want to upload and download files securely through a centralized storage service, so that attachments and documents are managed consistently.

#### Acceptance Criteria

1. THE Platform SHALL use an S3-compatible object storage provider (AWS S3 or MinIO) for all file uploads.
2. WHEN a user uploads a file, THE Platform SHALL validate the file size (maximum 10MB per file), MIME type (allowed: image/jpeg, image/png, application/pdf, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet), and reject files that do not match the allowed types with error code `FILE_INVALID_TYPE`.
3. THE Platform SHALL rename uploaded files using a UUID-based naming scheme to prevent filename collisions and path traversal attacks.
4. WHEN a user requests access to a stored file, THE Platform SHALL generate a time-limited signed URL valid for 15 minutes.
5. THE Platform SHALL organize stored files by tenant_id in the storage bucket path structure: `{tenant_id}/{domain}/{filename}`.
6. IF a file upload exceeds the maximum allowed size, THEN THE Platform SHALL reject the upload with error code `FILE_SIZE_EXCEEDED`.
7. THE Platform SHALL not serve files directly from the application server; all file access SHALL go through signed URLs from the storage provider.

### Requirement 27: Privacy and Data Protection

**User Story:** As a Warga, I want my personal data to be protected with proper masking, access controls, and consent management, so that my privacy is respected.

#### Acceptance Criteria

1. THE Platform SHALL mask NIK (Nomor Induk Kependudukan) in all API responses and UI displays, showing only the last 4 digits (e.g., `************1234`), except when accessed by the data owner or by a user with Ketua_RT role.
2. THE Platform SHALL mask phone numbers in list views, showing only the last 4 digits (e.g., `0812****1234`), except when accessed by the data owner, Ketua_RT, or Pengurus with explicit need.
3. WHEN a Warga registers, THE Platform SHALL record the Warga's consent for data processing with a timestamp and consent version.
4. WHEN a Warga requests export of their personal data, THE Resident_Registry SHALL generate a downloadable file containing all personal data associated with the requesting Warga within 48 hours.
5. WHEN a Warga requests deletion of their personal data, THE Platform SHALL soft-delete the Warga's personal records and anonymize the Warga's identity in audit log entries within 30 days, while retaining anonymized financial transaction records as required by law.
6. THE Platform SHALL restrict access to sensitive resident data (NIK, full phone number, emergency contacts) to users with Pengurus role or higher within the same tenant.
7. THE Audit_Logger SHALL mask all sensitive fields (NIK, phone numbers, email addresses) in audit log detail entries.

### Requirement 28: Mobile and PWA Support

**User Story:** As a Warga, I want to access the platform from my mobile device with an app-like experience, so that I can use community features on the go.

#### Acceptance Criteria

1. THE Platform SHALL be installable as a Progressive Web App (PWA) with a valid web app manifest including app name, icons (192x192 and 512x512), theme color, and start URL.
2. THE Platform SHALL register a service worker that caches static assets (HTML shell, CSS, JavaScript bundles, icons) for offline access to the app shell.
3. THE Platform SHALL implement a responsive mobile-first design where all screens are usable on viewports as small as 320px width.
4. WHEN the device is offline, THE Platform SHALL display cached content and show a clear offline indicator to the user.
5. WHEN the device regains connectivity, THE Platform SHALL synchronize any pending read requests and refresh cached data.
6. THE Platform SHALL support Web Push API for push notifications on supported browsers (Chrome, Firefox, Edge) and request notification permission from the user during onboarding.

### Requirement 29: Payment Gateway Integration

**User Story:** As a Super_Admin, I want tenants to pay their subscription through an integrated payment gateway, so that billing is automated and reconciled.

#### Acceptance Criteria

1. THE Billing_System SHALL generate an invoice for each tenant at the start of each billing cycle, containing the plan name, amount, billing period, and due date.
2. THE Billing_System SHALL integrate with a payment gateway (Midtrans or Xendit) to process subscription payments.
3. WHEN a payment is successfully processed by the payment gateway, THE Billing_System SHALL update the invoice status to "paid" and extend the tenant's subscription period.
4. WHEN the payment gateway sends a webhook notification, THE Billing_System SHALL validate the webhook signature, update the payment status, and log the event.
5. IF a payment fails, THEN THE Billing_System SHALL update the invoice status to "failed", notify the Ketua_RT via the Notification_Engine, and retry the payment up to 2 times over the next 48 hours.
6. IF a tenant's subscription payment remains unpaid for more than 14 days past the due date, THEN THE Billing_System SHALL downgrade the tenant to the Free plan and notify the Ketua_RT.
7. THE Billing_System SHALL maintain a reconciliation log that records all payment gateway transactions with gateway_transaction_id, internal_invoice_id, amount, status, and timestamp.
8. WHEN a payment event occurs (invoice created, payment success, payment failed, plan downgrade), THE Audit_Logger SHALL record the event with the actor, timestamp, tenant, and payment details.

### Requirement 30: Operational Administration

**User Story:** As a Super_Admin, I want to manage tenant lifecycle operations including suspension, health monitoring, and secure impersonation, so that the platform can be operated safely at scale.

#### Acceptance Criteria

1. WHEN a Super_Admin suspends a tenant, THE Platform SHALL set the tenant status to "suspended" and block all API access for users within that tenant, returning error code `TENANT_SUSPENDED` for any request.
2. WHEN a Super_Admin reactivates a suspended tenant, THE Platform SHALL set the tenant status to "active" and restore API access for users within that tenant.
3. THE Platform SHALL track tenant health metrics: active user count (last 30 days), storage usage, API request count (last 30 days), and last activity timestamp.
4. WHEN a Super_Admin initiates a secure impersonation session for a Ketua_RT account, THE Platform SHALL create a time-limited impersonation token (maximum 60 minutes) that grants the Super_Admin access to the tenant's data with full audit trail.
5. WHILE a Super_Admin is in an impersonation session, THE Audit_Logger SHALL tag all actions with the impersonator's Super_Admin user_id and the impersonated Ketua_RT user_id.
6. WHEN an impersonation session expires or is ended, THE Platform SHALL immediately revoke the impersonation token and log the session end event.
7. THE Platform SHALL display a visible impersonation indicator in the UI during an active impersonation session to prevent accidental actions.
8. WHEN a tenant is suspended, reactivated, or impersonated, THE Audit_Logger SHALL record the event with the Super_Admin actor, timestamp, tenant, and action details.

### Requirement 31: Security Center Dashboard

**User Story:** As a Ketua_RT, I want a unified realtime security dashboard that aggregates all security-related information (incidents, alerts, gate status, CCTV feeds, patrol status, device events), so that I can monitor and respond to security situations from a single interface.

#### Acceptance Criteria

1. THE Security_Center SHALL display a realtime dashboard showing: active incident count, active emergency alerts, gate status summary, CCTV camera status, patrol status, and recent security events within the current tenant.
2. THE Security_Center SHALL update dashboard data in realtime via WebSocket connection without requiring page refresh, with a maximum latency of 2 seconds from event occurrence to dashboard display.
3. THE Security_Center SHALL display an incident timeline showing all security events (incidents, alerts, device events, patrol check-ins) in chronological order within a configurable time range (default: last 24 hours).
4. THE Security_Center SHALL provide a neighborhood alert system that allows Ketua_RT or Security_Guard to broadcast a security alert to all residents within the tenant with severity level (low, medium, high, critical) and alert message.
5. WHEN a neighborhood alert is broadcast, THE Notification_Engine SHALL dispatch notifications to all Warga within the tenant via push notification and in-app inbox within 5 seconds.
6. THE Security_Center SHALL display security analytics including: incident count by severity over time, average response time, incidents by category, patrol coverage percentage, and device event frequency.
7. THE Security_Center SHALL support emergency escalation where unresolved critical incidents are automatically escalated to Ketua_RT after 5 minutes and to emergency contacts after 15 minutes.
8. IF a critical security event (panic_button_pressed, smoke_detected, emergency_alert) occurs, THEN THE Security_Center SHALL display a prominent visual and audio alert on the dashboard for all active Security_Guard and Ketua_RT sessions.
9. THE Security_Center SHALL restrict access to users with Ketua_RT, Pengurus, or Security_Guard roles only.
10. WHEN a security event occurs or an alert is broadcast, THE Audit_Logger SHALL record the event with actor, timestamp, event type, severity, and tenant context.

### Requirement 32: Incident Management

**User Story:** As a Security_Guard, I want to create, track, and resolve security incidents with full lifecycle management, so that all security events are properly documented and handled.

#### Acceptance Criteria

1. WHEN a Security_Guard or Ketua_RT creates an incident with valid data (title, description, location, severity level, category, GPS coordinates), THE Incident_Manager SHALL create an incident record with status "open" within the current tenant.
2. THE Incident_Manager SHALL support the following incident statuses: open, acknowledged, in_progress, escalated, resolved, and closed.
3. THE Incident_Manager SHALL support the following incident categories: theft, vandalism, trespassing, fire, flood, suspicious_activity, noise_complaint, device_alert, and other.
4. WHEN a Security_Guard updates an incident status, THE Incident_Manager SHALL record the status change with timestamp, actor, and optional notes in the incident log.
5. WHEN an incident is created or its status changes, THE Notification_Engine SHALL notify all Security_Guard and Ketua_RT users within the tenant.
6. THE Incident_Manager SHALL support attaching evidence files (photos, videos, up to 5 files, each up to 20MB) to an incident record.
7. THE Incident_Manager SHALL automatically create an incident when a critical Device_Event (panic_button_pressed, smoke_detected, emergency_alert) is received from the IoT_Gateway.
8. WHEN an incident with severity "critical" or "high" remains in "open" status for more than 5 minutes, THE Incident_Manager SHALL escalate the incident by changing status to "escalated" and notifying Ketua_RT and registered emergency contacts.
9. THE Incident_Manager SHALL display incidents on an interactive map showing incident locations with severity-based color coding.
10. WHEN an incident is created, updated, or resolved, THE Audit_Logger SHALL record the event with actor, timestamp, incident ID, status change, and severity.

### Requirement 33: Gate Monitoring

**User Story:** As a Security_Guard, I want to monitor all community gates in realtime with open/close status and duration tracking, so that I can detect unauthorized access or gates left open.

#### Acceptance Criteria

1. THE Gate_Monitor SHALL display realtime status (open or closed) of all registered gate sensors within the current tenant, updated via WebSocket within 1 second of state change.
2. WHEN a gate sensor reports a state change (open or closed), THE Gate_Monitor SHALL record the event with timestamp, gate identifier, new state, and duration of previous state.
3. THE Gate_Monitor SHALL track gate open duration and display a warning indicator when a gate has been open for more than a configurable threshold (default: 2 minutes).
4. IF a gate remains open beyond the configured threshold, THEN THE Gate_Monitor SHALL trigger a `gate_open_too_long` event and notify Security_Guard users via the Realtime_Bus.
5. THE Gate_Monitor SHALL display gate locations on an interactive map with color-coded status indicators (green for closed, red for open, yellow for warning).
6. THE Gate_Monitor SHALL maintain a gate event history log showing all open/close events with timestamps, filterable by gate and date range.
7. WHEN a Ketua_RT or Pengurus registers a new gate with valid data (gate name, location description, GPS coordinates, associated IoT_Device ID), THE Gate_Monitor SHALL store the gate configuration within the current tenant.
8. THE Gate_Monitor SHALL calculate and display gate analytics: average open duration, open frequency by time of day, and anomaly detection for unusual patterns.
9. IF a gate sensor goes offline (no heartbeat for more than 60 seconds), THEN THE Gate_Monitor SHALL mark the gate status as "offline" and notify Security_Guard users.
10. WHEN a gate event occurs, THE Audit_Logger SHALL record the event with gate ID, state change, duration, and timestamp.

### Requirement 34: CCTV Monitoring

**User Story:** As a Security_Guard, I want to view live CCTV feeds, capture snapshots, and receive motion detection alerts, so that I can visually monitor the community and gather evidence.

#### Acceptance Criteria

1. THE CCTV_System SHALL support registering CCTV cameras with valid data (camera name, RTSP stream URL, location description, GPS coordinates, resolution, associated tenant) and store the configuration securely with encrypted stream credentials.
2. THE CCTV_System SHALL provide live video streaming from registered cameras using WebRTC for low-latency browser-based viewing.
3. WHEN a Security_Guard requests a snapshot from a specific camera, THE CCTV_System SHALL capture a still image from the live stream and store it with timestamp and camera identifier.
4. THE CCTV_System SHALL support motion detection events from cameras and process `cctv_motion_detected` events received from the IoT_Gateway.
5. WHEN a motion detection event is received, THE CCTV_System SHALL automatically capture a snapshot, associate it with the event, and notify Security_Guard users if the event occurs during configured alert hours.
6. THE CCTV_System SHALL display all camera locations on an interactive map with status indicators (online: green, offline: red, motion detected: orange).
7. THE CCTV_System SHALL manage recording storage with configurable retention periods (default: 7 days for continuous recording, 30 days for event-triggered recordings).
8. IF a camera goes offline (no stream data for more than 30 seconds), THEN THE CCTV_System SHALL mark the camera status as "offline" and notify Security_Guard users with error code `CCTV_CAMERA_OFFLINE`.
9. THE CCTV_System SHALL restrict live stream access to users with Security_Guard, Pengurus, or Ketua_RT roles within the same tenant.
10. THE CCTV_System SHALL encrypt all stored RTSP credentials and stream URLs at rest using AES-256 encryption.
11. WHEN a CCTV event occurs (snapshot captured, motion detected, camera offline), THE Audit_Logger SHALL record the event with camera ID, event type, and timestamp.

### Requirement 35: Security Patrol Management (Enhanced)

**User Story:** As a Ketua_RT, I want to manage security patrols with route planning, GPS tracking, checkpoint verification, and analytics, so that patrol coverage is comprehensive and verifiable.

#### Acceptance Criteria

1. WHEN a Ketua_RT or Pengurus creates a patrol route with valid data (route name, ordered list of checkpoint GPS coordinates, estimated duration), THE Patrol_Manager SHALL store the route within the current tenant.
2. THE Patrol_Manager SHALL display patrol routes on an interactive map showing checkpoints, route paths, and current patrol positions.
3. WHEN a Security_Guard starts a patrol, THE Patrol_Manager SHALL track the guard's GPS position in realtime and display it on the Security_Center map, updating every 10 seconds.
4. WHEN a Security_Guard arrives at a checkpoint (within 50 meters of checkpoint GPS coordinates), THE Patrol_Manager SHALL automatically record the checkpoint visit with timestamp and GPS coordinates.
5. THE Patrol_Manager SHALL calculate patrol completion percentage based on checkpoints visited versus total checkpoints on the assigned route.
6. IF a Security_Guard deviates more than 200 meters from the assigned patrol route for more than 5 minutes, THEN THE Patrol_Manager SHALL send a deviation alert to Ketua_RT.
7. THE Patrol_Manager SHALL provide patrol analytics: average patrol duration, checkpoint coverage rate, patrol frequency by time slot, and guard performance metrics.
8. WHEN a patrol is completed, THE Patrol_Manager SHALL generate a patrol summary report containing: route covered, checkpoints visited, duration, distance traveled, and any incidents reported during the patrol.
9. THE Patrol_Manager SHALL support assigning multiple patrol routes to different time slots and guards within a weekly schedule.
10. WHEN a patrol event occurs (started, checkpoint visited, completed, deviation detected), THE Audit_Logger SHALL record the event with guard ID, route ID, timestamp, and GPS coordinates.

### Requirement 36: Smart Alarm System

**User Story:** As a Ketua_RT, I want to manage smart alarm/siren devices that can be triggered automatically by security events or manually by authorized users, so that the community has an audible alert system for emergencies.

#### Acceptance Criteria

1. WHEN a Ketua_RT or Pengurus registers a smart siren device with valid data (device name, location, associated IoT_Device ID, alarm zones), THE Alarm_System SHALL store the siren configuration within the current tenant.
2. WHEN an authorized user (Ketua_RT, Pengurus, or Security_Guard) manually triggers a siren, THE Alarm_System SHALL send an activation command to the specified siren device via the IoT_Gateway.
3. THE Alarm_System SHALL support automatic siren activation triggered by Automation_Rules (e.g., panic button pressed, gate open too long, smoke detected).
4. WHEN a siren is activated, THE Alarm_System SHALL record the activation event with trigger source (manual or automation rule ID), timestamp, duration, and actor.
5. THE Alarm_System SHALL support configurable alarm duration (default: 60 seconds, maximum: 300 seconds) and automatic deactivation after the configured duration.
6. THE Alarm_System SHALL support alarm zones where specific sirens are associated with specific areas of the community, allowing zone-targeted activation.
7. THE Alarm_System SHALL support alarm scheduling where sirens are automatically armed during configured hours (e.g., 22:00-06:00) and disarmed outside those hours.
8. WHEN a siren is activated or deactivated, THE Notification_Engine SHALL notify all Security_Guard and Ketua_RT users within the tenant.
9. IF a siren device fails to respond to an activation command within 5 seconds, THEN THE Alarm_System SHALL log the failure with error code `ALARM_DEVICE_UNRESPONSIVE` and notify Security_Guard users.
10. WHEN an alarm event occurs (activated, deactivated, failed, scheduled arm/disarm), THE Audit_Logger SHALL record the event with device ID, trigger source, actor, and timestamp.

### Requirement 37: SocieT-Home Module

**User Story:** As a Home_Owner, I want to pair, monitor, and control my smart home devices (Tuya-based) from within the SocieT-RT application, so that I can manage my home security and automation from a single platform.

#### Acceptance Criteria

1. WHEN a Home_Owner initiates device pairing, THE SocieT_Home SHALL guide the user through the Tuya device pairing flow and associate the paired device with the Home_Owner's Household.
2. THE SocieT_Home SHALL display a device dashboard showing all paired devices for the Home_Owner's Household with current status (online, offline, battery level, last activity).
3. THE SocieT_Home SHALL support the following device types: panic button, smart siren, smart lock, CCTV camera, motion sensor, smoke detector, door sensor, gate sensor, smart switch, and smart lighting.
4. WHEN a Home_Owner sends a command to a device (e.g., lock/unlock, turn on/off, activate siren), THE SocieT_Home SHALL execute the command via the IoT_Gateway and display the result within 3 seconds.
5. THE SocieT_Home SHALL display realtime device events (door opened, motion detected, smoke detected) for the Home_Owner's devices via WebSocket connection.
6. THE SocieT_Home SHALL enforce device ownership validation: only the Home_Owner of the Household where the device is registered can view device details and send commands to Private_Home_Event devices.
7. THE SocieT_Home SHALL allow Home_Owners to configure device alert preferences (which events trigger push notifications, quiet hours).
8. WHEN a device generates a Shared_Security_Event (panic_button_pressed, smoke_detected, alarm_triggered, emergency_alert), THE SocieT_Home SHALL forward the event to the Security_Center and Realtime_Bus for processing by Security_Guard and Ketua_RT.
9. WHEN a device generates a Private_Home_Event (smart_lock_opened, smart_switch_toggled, lighting_changed), THE SocieT_Home SHALL deliver the event ONLY to the Home_Owner of the associated Household and SHALL NOT expose the event to Ketua_RT, Pengurus, or Security_Guard.
10. IF a paired device goes offline (no heartbeat for more than 120 seconds), THEN THE SocieT_Home SHALL mark the device as offline and notify the Home_Owner.
11. WHEN a Home_Owner unpairs a device, THE SocieT_Home SHALL remove the device association from the Household and revoke all access tokens for that device.
12. WHEN a device is paired, unpaired, or a command is executed, THE Audit_Logger SHALL record the event with Home_Owner ID, device ID, action, and timestamp.

### Requirement 38: Tuya IoT Integration

**User Story:** As a developer, I want a robust integration layer with Tuya IoT Cloud that handles device lifecycle, event processing, and command execution with proper error handling and retry mechanisms, so that IoT devices communicate reliably with the platform.

#### Acceptance Criteria

1. THE IoT_Gateway SHALL authenticate with Tuya IoT Cloud using OAuth 2.0 client credentials flow and manage token lifecycle (acquisition, refresh, expiry handling).
2. THE IoT_Gateway SHALL support device pairing by generating Tuya pairing tokens and processing pairing completion callbacks.
3. THE IoT_Gateway SHALL synchronize device status from Tuya Cloud at configurable intervals (default: every 60 seconds) and on-demand when requested.
4. THE IoT_Gateway SHALL process incoming Tuya webhook events, validate webhook signatures using HMAC-SHA256, and route events to the appropriate tenant and device.
5. WHEN a webhook event is received, THE IoT_Gateway SHALL parse the event payload, map it to the corresponding Device_Event type, and publish it to the Realtime_Bus within 500ms.
6. WHEN a device command is requested, THE IoT_Gateway SHALL send the command to Tuya Cloud API, await confirmation, and return the result to the caller within 5 seconds.
7. IF a device command fails, THEN THE IoT_Gateway SHALL retry the command up to 3 times with exponential backoff (1s, 2s, 4s) before returning error code `IOT_COMMAND_FAILED`.
8. THE IoT_Gateway SHALL maintain a device registry storing: device_id, tuya_device_id, device_type, household_id, tenant_id, online_status, last_seen_timestamp, and device_metadata.
9. THE IoT_Gateway SHALL detect offline devices (no status update for more than 120 seconds) and emit a `device_offline` event to the Realtime_Bus.
10. THE IoT_Gateway SHALL validate device ownership on every command request, ensuring the requesting user is the Home_Owner of the Household where the device is registered.
11. IF a Tuya webhook signature validation fails, THEN THE IoT_Gateway SHALL reject the webhook with HTTP 401 and log the rejection with error code `IOT_WEBHOOK_SIGNATURE_INVALID`.
12. THE IoT_Gateway SHALL encrypt and store Tuya API credentials (client_id, client_secret, access_token) using AES-256 encryption at rest.
13. THE IoT_Gateway SHALL implement circuit breaker pattern for Tuya Cloud API calls: open circuit after 5 consecutive failures, half-open after 30 seconds, close after 3 successful calls.
14. WHEN a device event is processed, a command is executed, or a device goes offline, THE Audit_Logger SHALL record the event with device ID, event type, result, and timestamp.

### Requirement 39: Automation Rule Engine

**User Story:** As a Ketua_RT, I want to define IF/THEN automation rules that automatically trigger actions when specific security events occur, so that the community can respond to threats faster than manual intervention allows.

#### Acceptance Criteria

1. WHEN a Ketua_RT or Pengurus creates an automation rule with valid data (rule name, trigger event type, conditions, action list), THE Automation_Engine SHALL store the rule within the current tenant.
2. THE Automation_Engine SHALL support the following trigger event types: panic_button_pressed, gate_open, gate_closed, motion_detected, smoke_detected, alarm_triggered, smart_lock_opened, cctv_motion_detected, device_online, device_offline, battery_low, and emergency_alert.
3. THE Automation_Engine SHALL support the following condition operators: equals, not_equals, greater_than, less_than, time_between (for time-of-day conditions), and duration_exceeds (for duration-based conditions).
4. THE Automation_Engine SHALL support the following actions: create_incident, notify_security_guard, notify_ketua_rt, notify_emergency_contact, trigger_siren, capture_cctv_snapshot, broadcast_neighborhood_alert, and send_push_notification.
5. WHEN a Device_Event matches an active automation rule's trigger and conditions, THE Automation_Engine SHALL execute all configured actions for that rule within 3 seconds of event receipt.
6. THE Automation_Engine SHALL support rule chaining where the output of one rule can trigger another rule, with a maximum chain depth of 5 to prevent infinite loops.
7. THE Automation_Engine SHALL support enabling and disabling individual rules without deleting them.
8. THE Automation_Engine SHALL log every rule execution with: rule_id, trigger_event, conditions_evaluated, actions_executed, execution_duration_ms, and success/failure status.
9. IF an automation action fails (e.g., siren unresponsive, notification failed), THEN THE Automation_Engine SHALL log the failure, continue executing remaining actions in the rule, and notify Ketua_RT of the partial failure.
10. THE Automation_Engine SHALL support scheduling rules to be active only during specific time windows (e.g., motion detection rules active only between 22:00 and 06:00).
11. THE Automation_Engine SHALL enforce a maximum of 50 active automation rules per tenant to prevent performance degradation.
12. FOR ALL automation rules, THE Automation_Engine SHALL validate rule definitions at creation time to ensure trigger events, conditions, and actions reference valid types and parameters (rule validation property).
13. WHEN a rule is created, updated, enabled, disabled, or executed, THE Audit_Logger SHALL record the event with rule ID, actor, action, and timestamp.

### Requirement 40: Realtime Security Event System

**User Story:** As a developer, I want a robust realtime event system using WebSocket and Redis pub/sub that delivers security events to connected clients with minimal latency, so that the Security Center and SocieT-Home dashboards update in realtime.

#### Acceptance Criteria

1. THE Realtime_Bus SHALL establish WebSocket connections with authenticated clients using JWT token validation on connection handshake.
2. THE Realtime_Bus SHALL use Redis pub/sub as the message broker for distributing events across multiple application server instances.
3. THE Realtime_Bus SHALL support the following event channels per tenant: `security_events`, `device_events`, `incident_updates`, `gate_events`, `cctv_events`, `patrol_events`, and `alarm_events`.
4. THE Realtime_Bus SHALL enforce tenant isolation on WebSocket channels: clients can only subscribe to channels belonging to their authenticated tenant.
5. THE Realtime_Bus SHALL enforce privacy rules on device event channels: Private_Home_Events are delivered ONLY to WebSocket connections authenticated as the Home_Owner of the associated Household.
6. THE Realtime_Bus SHALL enforce that Shared_Security_Events (panic_button_pressed, smoke_detected, gate_open_too_long, alarm_triggered, emergency_alert, motion_detection_alert) are delivered to Security_Guard, Pengurus, and Ketua_RT WebSocket connections within the tenant.
7. THE Realtime_Bus SHALL maintain a notification queue using BullMQ for guaranteed delivery of critical events (emergency alerts, panic button, smoke detection) even if the target client is temporarily disconnected.
8. WHEN a client reconnects after disconnection, THE Realtime_Bus SHALL deliver any queued critical events that occurred during the disconnection period (up to 1 hour of event history).
9. THE Realtime_Bus SHALL support WebSocket heartbeat with 30-second ping/pong intervals and automatically disconnect clients that fail to respond to 3 consecutive pings.
10. THE Realtime_Bus SHALL handle connection scaling to support at least 500 concurrent WebSocket connections per tenant without message delivery latency exceeding 2 seconds.
11. IF the Redis pub/sub connection is lost, THEN THE Realtime_Bus SHALL attempt reconnection with exponential backoff and buffer events locally for up to 30 seconds before discarding.
12. THE Realtime_Bus SHALL expose connection metrics: active connections per tenant, message throughput, average delivery latency, and failed delivery count.

### Requirement 41: Security and Privacy for IoT Data

**User Story:** As a Home_Owner, I want my private smart home data to be protected from unauthorized access, so that only I can see my device controls and personal device events while security-relevant events are shared appropriately.

#### Acceptance Criteria

1. THE Platform SHALL classify all Device_Events into two categories: Shared_Security_Event (accessible by Ketua_RT, Pengurus, Security_Guard) and Private_Home_Event (accessible only by Home_Owner).
2. THE Platform SHALL classify the following as Shared_Security_Events: panic_button_pressed, smoke_detected, gate_open_too_long, alarm_triggered, emergency_alert, and motion_detection_alert (during armed hours only).
3. THE Platform SHALL classify the following as Private_Home_Events: smart_lock_opened, smart_switch_toggled, lighting_changed, device_online, device_offline (for non-security devices), and battery_low (for non-security devices).
4. THE Platform SHALL validate device ownership on every API request to `/api/iot/devices/{deviceId}` and `/api/iot/commands`, ensuring the requesting user is the Home_Owner of the Household where the device is registered.
5. IF a user who is not the Home_Owner attempts to access a Private_Home_Event or send a command to a private device, THEN THE Platform SHALL reject the request with error code `IOT_DEVICE_ACCESS_DENIED` and HTTP status 403.
6. THE Platform SHALL allow Ketua_RT and Security_Guard to view Shared_Security_Events from any device within the tenant WITHOUT exposing the device's private controls, configuration, or Private_Home_Events.
7. THE Platform SHALL encrypt all device credentials, stream URLs, and sensitive device metadata at rest using AES-256 encryption.
8. THE Platform SHALL enforce API rate limiting on IoT command endpoints: maximum 30 commands per minute per device to prevent abuse.
9. THE Platform SHALL maintain a separate access log for all IoT device access attempts (successful and denied) with user_id, device_id, action, result, and timestamp.
10. WHEN a device ownership transfer occurs (e.g., resident moves out), THE Platform SHALL revoke all previous owner's access to the device and its event history immediately.

### Requirement 42: Security Maps and GIS

**User Story:** As a Ketua_RT, I want interactive maps showing security-related information (incidents, CCTV locations, panic alerts, gates, patrol routes), so that I can visualize the security landscape of the community.

#### Acceptance Criteria

1. THE Map_System SHALL display an integrated security map layer showing: incident locations (color-coded by severity), CCTV camera positions (with online/offline status), panic alert locations, gate positions (with open/close status), and patrol routes with guard positions.
2. THE Map_System SHALL support toggling individual map layers (incidents, CCTV, panic alerts, gates, patrols) on and off independently.
3. THE Map_System SHALL use Leaflet or Mapbox for map rendering with support for custom markers, polylines (patrol routes), and real-time position updates.
4. WHEN a new security event occurs (incident created, panic alert triggered, gate opened), THE Map_System SHALL display the event on the map in realtime via WebSocket without page refresh.
5. THE Map_System SHALL support clicking on map markers to display detailed information: incident details, camera live preview thumbnail, gate status history, or patrol guard information.
6. THE Map_System SHALL support geofencing visualization where alarm zones and patrol areas are displayed as colored polygons on the map.
7. THE Map_System SHALL provide a heatmap view showing incident density over a configurable time period (last 7 days, 30 days, 90 days).
8. THE Map_System SHALL restrict security map access to users with Ketua_RT, Pengurus, or Security_Guard roles within the tenant.

### Requirement 43: Enhanced Notification System for Security

**User Story:** As a Ketua_RT, I want security notifications to be delivered through multiple channels (push, WhatsApp, SMS, email, siren, dashboard) with escalation support, so that critical alerts reach the right people through the most effective channel.

#### Acceptance Criteria

1. THE Notification_Engine SHALL support the following notification channels for security events: push notification, WhatsApp (via API integration), SMS (via API integration), email, realtime dashboard alert, and siren activation.
2. WHEN a critical security event occurs (panic_button_pressed, smoke_detected, emergency_alert), THE Notification_Engine SHALL dispatch notifications through ALL configured channels simultaneously to ensure delivery.
3. THE Notification_Engine SHALL support notification escalation tiers: Tier 1 (Security_Guard, immediate), Tier 2 (Ketua_RT, after 5 minutes if unacknowledged), Tier 3 (emergency contacts, after 15 minutes if unacknowledged).
4. WHEN a notification is acknowledged by any recipient, THE Notification_Engine SHALL stop further escalation for that specific event.
5. THE Notification_Engine SHALL support configurable notification preferences per user: which channels to use, quiet hours (during which only critical alerts are delivered), and event type filters.
6. THE Notification_Engine SHALL maintain delivery status tracking for each notification: sent, delivered, read, failed, with timestamps for each status transition.
7. IF a notification delivery fails on one channel, THEN THE Notification_Engine SHALL attempt delivery on the next configured channel as fallback and log the failure with error code `NOTIFICATION_CHANNEL_FAILED`.
8. THE Notification_Engine SHALL enforce rate limiting on non-critical notifications: maximum 10 notifications per user per hour for non-critical events to prevent notification fatigue.
9. THE Notification_Engine SHALL support WhatsApp message templates for security alerts with pre-approved template messages containing: alert type, location, timestamp, and action required.
10. WHEN a notification is dispatched, delivered, or fails, THE Audit_Logger SHALL record the event with notification ID, channel, recipient, status, and timestamp.

### Requirement 44: IoT Device Health and Observability

**User Story:** As a developer, I want comprehensive health monitoring and observability for all IoT devices and integrations, so that device failures are detected quickly and system reliability is maintained.

#### Acceptance Criteria

1. THE IoT_Gateway SHALL monitor device health by tracking: online/offline status, last heartbeat timestamp, battery level (for battery-powered devices), signal strength, and error count.
2. THE IoT_Gateway SHALL emit device health metrics to the observability stack (OpenTelemetry) including: device_online_count, device_offline_count, command_success_rate, command_latency_p95, webhook_processing_latency, and token_refresh_count.
3. WHEN a device's battery level drops below 20%, THE IoT_Gateway SHALL emit a `battery_low` event and notify the Home_Owner via the Notification_Engine.
4. THE IoT_Gateway SHALL maintain a device status dashboard showing: total devices per tenant, online/offline ratio, devices with low battery, devices with high error rates, and last synchronization timestamp.
5. THE IoT_Gateway SHALL implement health check endpoints at `/api/iot/health` returning: Tuya Cloud API connectivity status, Redis connectivity, WebSocket server status, and device synchronization lag.
6. IF the Tuya Cloud API becomes unreachable, THEN THE IoT_Gateway SHALL activate circuit breaker, queue pending commands for up to 5 minutes, and notify Ketua_RT with error code `IOT_CLOUD_UNAVAILABLE`.
7. THE IoT_Gateway SHALL log all Tuya API interactions with: request_id, endpoint, method, response_status, latency_ms, and correlation_id for distributed tracing.
8. THE IoT_Gateway SHALL expose Prometheus-compatible metrics for: tuya_api_requests_total, tuya_api_errors_total, tuya_api_latency_seconds, device_events_processed_total, and websocket_connections_active.
