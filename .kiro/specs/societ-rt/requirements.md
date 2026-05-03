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
