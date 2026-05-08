# Implementation Plan: SocieT-RT

## Overview

This implementation plan converts the SocieT-RT design into incremental coding tasks following Clean Architecture + DDD patterns. Each task builds on previous tasks, ensuring no orphaned code. The tech stack is Next.js 15 App Router, TypeScript, PostgreSQL, Prisma ORM, Redis, BullMQ, Zod, React Hook Form, TanStack Query, Zustand, Leaflet, and fast-check for PBT. All code follows the project's steering rules for architecture, DI, security, error handling, and testing.

## Tasks

- [x] 1. Project foundation and shared infrastructure
  - [x] 1.1 Initialize project structure and core shared types
    - Create the directory structure per Clean Architecture: `src/core/`, `src/infrastructure/`, `src/presentation/`, `src/app/`
    - Create `src/core/protocols/` with `HttpProtocol`, `CacheProtocol`, `QueueProtocol`, `FileStorageProtocol`, `AuthContext` interfaces
    - Create `src/core/utils/DomainResult.ts` with `DomainResult<T>` type and helper functions
    - Create `src/core/utils/AppError.ts` with `AppError` interface (7 error types, stable codes)
    - Configure path aliases (`@core/*`, `@infrastructure/*`, `@presentation/*`, etc.) in `tsconfig.json`
    - _Requirements: 22.1, 22.2, 22.3, 22.4_

  - [x] 1.2 Set up Prisma ORM with base schema and multi-tenant foundation
    - Initialize Prisma with PostgreSQL provider
    - Use consistent snake_case naming for all database columns with `@map` and `@@map` directives in Prisma models (e.g., `createdAt DateTime @map("created_at")`, `@@map("tenants")`)
    - All models MUST have `created_at`, `updated_at` timestamps; models supporting soft delete MUST have `deleted_at` nullable timestamp
    - Create base `Tenant` model with all fields from design (id, name, subdomain, rt_rw_number, region, address, contact_person, logo_url, primary_color, secondary_color, status, subscription_plan_id, created_at, updated_at)
    - Create `User` model with tenant relation, role enum (`Super_Admin`, `Ketua_RT`, `Pengurus`, `Warga`, `Security_Guard`), status, failed_login_attempts, locked_until, consent fields, deleted_at for soft delete
    - Create `SubscriptionPlan` model (name, max_users, features, price, created_at, updated_at)
    - Add composite indexes: `(tenant_id, id)`, `(tenant_id, created_at)`, `(tenant_id, status)`, `(tenant_id, email)` unique on users
    - Run initial migration
    - _Requirements: 1.1, 1.2, 2.1, 2.4, 3.1, 4.1, 16.1_

  - [x] 1.3 Set up Awilix DI container and protocol implementations
    - Create `src/infrastructure/di/container.ts` with Awilix root container
    - Create registry files: `moduleContainer.ts`, `repositoryContainer.ts`, `useCasesContainer.ts`, `viewModelContainer.ts`, `loggingContainer.ts`, `index.ts`
    - Implement `RedisAdapter` for `CacheProtocol` in `src/infrastructure/networking/`
    - Implement `BullMQAdapter` for `QueueProtocol` in `src/infrastructure/networking/`
    - Implement `S3Adapter` for `FileStorageProtocol` in `src/infrastructure/storage/`
    - Register all protocol implementations in `moduleContainer.ts` as singletons
    - _Requirements: 23.1, 26.1_

  - [x] 1.4 Implement error handling infrastructure
    - Create error mapping utility: `mapAppErrorToHttpResponse(error: AppError, correlationId: string)` in `src/infrastructure/utils/`
    - Create `formatZodErrors` helper for field-level validation error responses
    - Create `generateCorrelationId` utility
    - Create structured JSON logger with fields: timestamp, level, message, correlation_id, tenant_id, user_id, route, duration_ms
    - Register logger in DI container
    - _Requirements: 21.2, 21.5, 22.1, 22.2, 22.4, 22.5, 25.1, 25.2_

  - [x] 1.5 Create audit queue and notification queue placeholders
    - Create `src/core/protocols/AuditQueueProtocol.ts` interface with `enqueueAudit(entry: AuditEntryInput): Promise<void>` contract
    - Create `src/core/protocols/NotificationQueueProtocol.ts` interface with `enqueueNotification(notification: NotificationInput): Promise<void>` contract
    - Create stub implementations in `src/infrastructure/queue/` that use `QueueProtocol.enqueue()` under the hood with job types `audit_log` and `notification_dispatch`
    - Register stubs in DI container so use cases can enqueue audit and notification jobs from Task 2 onwards without orphan dependencies
    - _Requirements: 18.3, 17.3_

  - [x] 1.6 Create tenant-scoped repository base helper
    - Create `src/infrastructure/repositories/TenantScopedRepository.ts` base helper that enforces `tenant_id` filter on every Prisma query (findMany, findFirst, create, update, delete)
    - All repository implementations MUST extend or use this helper — direct Prisma queries without tenant_id filter are FORBIDDEN
    - Optionally document PostgreSQL Row-Level Security (RLS) policy setup for extra safety layer: `CREATE POLICY tenant_isolation ON <table> USING (tenant_id = current_setting('app.current_tenant_id')::uuid)`
    - _Requirements: 1.2, 1.3, 1.5_

  - [ ]* 1.7 Write property test for error response consistency
    - **Property 10: Error Response Consistency**
    - Generate random AppError instances across all 7 types, verify HTTP status mapping and response sanitization (no stack traces, no SQL, no internal URLs)
    - **Validates: Requirements 21.5, 22.1, 22.2, 22.4**

  - [ ]* 1.8 Write unit tests for DomainResult, AppError, error mapping, Zod error formatting, and tenant-scoped helper
    - Test DomainResult success/error creation and unwrapping
    - Test HTTP status mapping for all 7 error types
    - Test Zod error formatting produces field-level details
    - Test correlation ID generation uniqueness
    - Test TenantScopedRepository always appends tenant_id filter
    - _Requirements: 1.3, 22.1, 22.2, 22.4_

- [x] 2. Authentication and authorization
  - [x] 2.1 Implement auth domain entities and repository interface
    - Create `src/core/domains/auth/entities/` with User entity, Session types, InvitationToken type
    - Create `src/core/domains/auth/repositories/AuthRepository.ts` interface with: login, register, logout, validateToken, createInvitation, validateInvitation
    - Create `src/core/domains/auth/errors/` with auth-specific error codes: `AUTH_INVALID_CREDENTIALS`, `AUTH_ACCOUNT_LOCKED`, `AUTH_TOKEN_INVALID`, `AUTH_ROLE_ESCALATION_DENIED`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7_

  - [x] 2.2 Implement auth use cases
    - Create `LoginUseCase`: validate credentials, check account lock status, issue JWT, set HTTP-only cookie config, increment/reset failed attempts
    - Create `RegisterUseCase`: validate invitation token, create user with tenant association, record consent
    - Create `LogoutUseCase`: invalidate session, clear cookie
    - Create `CreateInvitationUseCase`: generate time-limited token (72h), require Ketua_RT or Pengurus role
    - All use cases return `DomainResult<T>` and enqueue audit logs via `AuditQueueProtocol`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.8, 4.6_

  - [x] 2.3 Implement auth repository (infrastructure) and JWT utilities
    - Create `src/infrastructure/repositories/auth/AuthRepositoryImpl.ts` using Prisma via TenantScopedRepository
    - Implement JWT sign/verify utilities with configurable expiry
    - Implement password hashing with bcrypt
    - Implement cookie configuration: `HttpOnly: true`, `Secure: true` (production), `SameSite: Lax`
    - Register in DI container
    - _Requirements: 3.1, 3.7, 3.8_

  - [x] 2.4 Implement RBAC domain and use cases
    - Create `src/core/domains/rbac/entities/` with Permission type, role hierarchy definition
    - Create `src/core/domains/rbac/repositories/RbacRepository.ts` interface
    - Create `AssignRoleUseCase`: validate Ketua_RT cannot assign Super_Admin, update role, enqueue audit via `AuditQueueProtocol`
    - Create `CheckPermissionUseCase`: validate user role against endpoint requirements
    - Implement `RbacRepositoryImpl` in infrastructure, register in DI
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 2.5 Implement Next.js middleware for auth and tenant resolution
    - Create `src/app/middleware.ts` with middleware chain: correlation ID → security headers → rate limiter → JWT validation → tenant context resolution → feature flag check
    - Implement `resolveAuthContext` helper to extract AuthContext from JWT cookie
    - Implement tenant guard: reject requests without valid tenant context (`TENANT_CONTEXT_MISSING`)
    - Implement rate limiting on login endpoint (10 req/min per IP) using Redis
    - Set security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`
    - _Requirements: 1.3, 1.4, 1.5, 21.3, 21.4, 21.6, 25.2_

  - [x] 2.6 Create auth route handlers (BFF)
    - Create `app/api/auth/login/route.ts`: Zod validation, call LoginUseCase, set cookie, return safe response
    - Create `app/api/auth/register/route.ts`: Zod validation, call RegisterUseCase
    - Create `app/api/auth/logout/route.ts`: call LogoutUseCase, clear cookie
    - Create `app/api/auth/invitation/route.ts`: call CreateInvitationUseCase
    - All handlers follow BFF pattern: validate → resolve auth → execute use case → map result
    - _Requirements: 3.1, 3.2, 3.3, 3.6_

  - [ ]* 2.7 Write property test for authentication token validity
    - **Property 3: Authentication Token Validity**
    - Generate random valid/invalid/expired JWT tokens, verify acceptance/rejection behavior
    - **Validates: Requirements 3.1, 3.6, 3.7**

  - [ ]* 2.8 Write property test for role-based access enforcement
    - **Property 4: Role-Based Access Enforcement**
    - Generate random user-role-endpoint combinations, verify access decisions match role hierarchy
    - **Validates: Requirements 4.2, 4.3**

  - [ ]* 2.9 Write unit tests for auth use cases and middleware
    - Test LoginUseCase: valid credentials, invalid credentials, locked account, failed attempt counting
    - Test RegisterUseCase: valid invitation, expired invitation, duplicate email
    - Test middleware: valid JWT, expired JWT, missing tenant context, rate limiting
    - Test RBAC: role assignment, escalation prevention, permission checks
    - _Requirements: 3.1, 3.4, 3.5, 3.7, 4.2, 4.3, 4.5_

- [x] 3. Checkpoint - Run all tests, fix failures, and document unresolved issues in CHECKPOINT_REPORT.md

- [x] 4. Tenant management and multi-tenancy
  - [x] 4.1 Implement tenant domain entities and repository interface
    - Create `src/core/domains/tenant/entities/` with Tenant entity matching design
    - Create `src/core/domains/tenant/repositories/TenantRepository.ts` interface: create, findById, findBySubdomain, update, suspend, reactivate
    - Create tenant-specific error codes: `TENANT_DUPLICATE`, `TENANT_SUSPENDED`, `TENANT_ACCESS_DENIED`
    - _Requirements: 1.3, 1.4, 1.5, 2.1, 2.5_

  - [x] 4.2 Implement tenant use cases
    - Create `RegisterTenantUseCase`: validate uniqueness (subdomain + RT/RW number per region), generate subdomain, associate with Free plan, enqueue audit via `AuditQueueProtocol`
    - Create `UpdateTenantBrandingUseCase`: update logo, colors for Ketua_RT
    - Create `SuspendTenantUseCase`: set status to suspended, block API access
    - Create `ReactivateTenantUseCase`: set status to active, restore access
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 30.1, 30.2, 30.8_

  - [x] 4.3 Implement tenant repository (infrastructure) and route handlers
    - Create `TenantRepositoryImpl` using Prisma via TenantScopedRepository
    - Create route handlers: `app/api/tenants/route.ts` (POST create), `app/api/tenants/[id]/route.ts` (GET, PATCH), `app/api/tenants/[id]/suspend/route.ts`, `app/api/tenants/[id]/reactivate/route.ts`
    - Register in DI container
    - _Requirements: 2.1, 2.2, 2.3, 30.1, 30.2_

  - [ ]* 4.4 Write property test for tenant data isolation
    - **Property 1: Tenant Data Isolation**
    - Generate random users and tenant combinations, verify query results only contain matching tenant_id records
    - **Validates: Requirements 1.3, 1.4, 1.5**

  - [ ]* 4.5 Write property test for tenant registration uniqueness
    - **Property 2: Tenant Registration Uniqueness**
    - Generate random tenant data, verify duplicate subdomain/RT-RW-region rejection
    - **Validates: Requirements 2.1, 2.2, 2.5**

  - [ ]* 4.6 Write property test for tenant suspension round-trip
    - **Property 13: Tenant Suspension Round-Trip**
    - Generate random tenants, verify suspend blocks access, reactivate restores access
    - **Validates: Requirements 30.1, 30.2**

  - [ ]* 4.7 Write unit tests for tenant use cases
    - Test RegisterTenantUseCase: valid data, duplicate subdomain, duplicate RT/RW
    - Test SuspendTenantUseCase: active tenant suspended, already suspended tenant
    - Test ReactivateTenantUseCase: suspended tenant reactivated
    - _Requirements: 2.1, 2.5, 30.1, 30.2_

- [x] 5. Resident data management and CSV
  - [x] 5.1 Implement resident domain entities and repository interface
    - Create `src/core/domains/resident/entities/` with Household, Resident entities matching design
    - Create `ResidentRepository` interface: createHousehold, addResident, updateResidentStatus, findByTenant (paginated), exportToCsv, importFromCsv
    - Define CSV column schema constant: household_number, name, NIK, date_of_birth, gender, phone, status, categories, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship
    - _Requirements: 5.1, 5.2, 5.3, 5.7, 6.1_

  - [x] 5.2 Add Prisma models for Household and Resident
    - Create Household model with tenant relation, household_number, address, block, latitude, longitude, created_at, updated_at (snake_case with @map)
    - Create Resident model with household relation, name, nik, date_of_birth, gender, phone, status enum, categories array, emergency contact fields, created_at, updated_at, deleted_at for soft delete (snake_case with @map)
    - Add indexes: `(tenant_id, household_number)` unique, `(tenant_id, nik)` unique
    - Run migration
    - _Requirements: 5.1, 5.2, 6.1_

  - [x] 5.3 Implement resident use cases
    - Create `CreateHouseholdUseCase`, `AddResidentUseCase`, `UpdateResidentStatusUseCase`
    - Create `ExportResidentCsvUseCase`: generate CSV with defined column schema
    - Create `ImportResidentCsvUseCase`: parse CSV, validate rows, create valid records, skip invalid rows, return summary (created count + skipped rows with errors)
    - All use cases enqueue audit logs via `AuditQueueProtocol` for mutations
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 6.1, 6.2, 6.3_

  - [x] 5.4 Implement resident repository (infrastructure) and route handlers
    - Create `ResidentRepositoryImpl` using Prisma via TenantScopedRepository
    - Create route handlers: `app/api/residents/households/route.ts`, `app/api/residents/route.ts`, `app/api/residents/[id]/route.ts`, `app/api/residents/export/route.ts`, `app/api/residents/import/route.ts`
    - Register in DI container
    - _Requirements: 5.1, 5.7, 5.8_

  - [ ]* 5.5 Write property test for CSV round-trip
    - **Property 5: Resident CSV Round-Trip**
    - Generate random valid resident datasets, export to CSV, import back, verify equivalence
    - **Validates: Requirements 5.7, 5.8, 6.1, 6.2, 6.3**

  - [ ]* 5.6 Write property test for CSV import error handling
    - **Property 6: CSV Import Error Handling**
    - Generate CSVs with mixed valid/invalid rows, verify created + skipped = total rows, verify error descriptions
    - **Validates: Requirements 5.9**

  - [ ]* 5.7 Write unit tests for resident use cases and CSV logic
    - Test CreateHouseholdUseCase, AddResidentUseCase with valid/invalid data
    - Test CSV export format correctness
    - Test CSV import with valid, invalid, and mixed rows
    - _Requirements: 5.1, 5.2, 5.7, 5.8, 5.9_

- [x] 6. Checkpoint - Run all tests, fix failures, and document unresolved issues in CHECKPOINT_REPORT.md

- [x] 7. Financial management (Uang Kas)
  - [x] 7.1 Implement finance domain entities and repository interface
    - Create `src/core/domains/finance/entities/` with FinancialTransaction, IuranStatus entities
    - Create `FinanceRepository` interface: recordTransaction, getBalance, getIuranStatus, recordIuranPayment, getReport
    - Define finance error codes: `FINANCE_INVALID_AMOUNT`
    - _Requirements: 7.1, 7.2, 7.3, 7.9_

  - [x] 7.2 Add Prisma models for FinancialTransaction and IuranStatus
    - Create FinancialTransaction model with tenant relation, type enum (income/expense), amount, description, category, date, created_by, created_at, updated_at, deleted_at (snake_case with @map)
    - Create IuranStatus model with tenant relation, household_id, month (YYYY-MM), status enum (paid/unpaid), paid_at, transaction_id, created_at, updated_at (snake_case with @map)
    - Add index: `(tenant_id, household_id, month)` unique on IuranStatus
    - Run migration
    - _Requirements: 7.1, 7.4_

  - [x] 7.3 Implement finance use cases
    - Create `RecordTransactionUseCase`: validate amount > 0, record transaction, update running balance, enqueue audit via `AuditQueueProtocol`
    - Create `GetBalanceUseCase`: calculate sum(income) - sum(expense)
    - Create `RecordIuranPaymentUseCase`: update iuran status to paid, link transaction
    - Create `GetFinancialReportUseCase`: generate report with transactions, categorized totals, opening/closing balance for date range
    - Create `ExportFinancialReportUseCase`: generate PDF/Excel format
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.7, 7.8, 7.9, 7.10_

  - [x] 7.4 Implement finance repository (infrastructure) and route handlers
    - Create `FinanceRepositoryImpl` using Prisma via TenantScopedRepository
    - Create route handlers: `app/api/finance/transactions/route.ts`, `app/api/finance/balance/route.ts`, `app/api/finance/iuran/route.ts`, `app/api/finance/report/route.ts`
    - Register in DI container
    - _Requirements: 7.1, 7.2, 7.3, 7.7_

  - [ ]* 7.5 Write property test for financial balance invariant
    - **Property 7: Financial Balance Invariant**
    - Generate random sequences of income/expense transactions, verify balance = sum(income) - sum(expense), verify zero/negative amounts rejected
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.9**

  - [ ]* 7.6 Write unit tests for finance use cases
    - Test RecordTransactionUseCase: valid income, valid expense, zero amount, negative amount
    - Test GetBalanceUseCase: empty transactions, mixed transactions
    - Test RecordIuranPaymentUseCase: valid payment, already paid
    - _Requirements: 7.1, 7.2, 7.3, 7.9_

- [x] 8. Voting system
  - [x] 8.1 Implement voting domain entities and repository interface
    - Create `src/core/domains/voting/entities/` with Vote, VoteOption, Ballot entities
    - Create `VotingRepository` interface: createVote, castVote, getVoteTally, findActiveVotes, findByTenant
    - Define voting error codes: `VOTING_INSUFFICIENT_OPTIONS`, `VOTING_DEADLINE_PASSED`, `VOTING_ALREADY_VOTED`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 8.2 Add Prisma models for Vote, VoteOption, Ballot
    - Create Vote model with tenant relation, title, description, mode enum (anonymous/verified), deadline, created_by, created_at, updated_at (snake_case with @map)
    - Create VoteOption model with vote relation, label, vote_count (snake_case with @map)
    - Create Ballot model with vote relation, user_id, option_id, created_at (snake_case with @map)
    - Add index: `(vote_id, user_id)` unique on Ballot
    - Run migration
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 8.3 Implement voting use cases
    - Create `CreateVoteUseCase`: validate min 2 options, check feature flag, enqueue audit via `AuditQueueProtocol`
    - Create `CastVoteUseCase`: check deadline, check duplicate vote, record ballot, increment vote count, enqueue audit
    - Create `GetVoteTallyUseCase`: return real-time tallies (cached in Redis with 5s TTL)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x] 8.4 Implement voting repository (infrastructure) and route handlers
    - Create `VotingRepositoryImpl` using Prisma via TenantScopedRepository
    - Create route handlers: `app/api/voting/route.ts` (POST create, GET list), `app/api/voting/[id]/vote/route.ts` (POST cast), `app/api/voting/[id]/tally/route.ts` (GET)
    - Register in DI container
    - _Requirements: 8.1, 8.3, 8.6_

  - [ ]* 8.5 Write property test for voting duplicate prevention
    - **Property 8: Voting Duplicate Prevention**
    - Generate random vote sequences per user, verify exactly-once semantics, verify deadline enforcement
    - **Validates: Requirements 8.3, 8.4, 8.5**

  - [ ]* 8.6 Write unit tests for voting use cases
    - Test CreateVoteUseCase: valid vote, insufficient options, feature disabled
    - Test CastVoteUseCase: valid vote, duplicate vote, expired deadline
    - _Requirements: 8.1, 8.3, 8.4, 8.5_

- [x] 9. Checkpoint - Run all tests, fix failures, and document unresolved issues in CHECKPOINT_REPORT.md

- [x] 10. Announcements and emergency alerts
  - [x] 10.1 Implement announcement domain and use cases
    - Create `src/core/domains/announcement/entities/` with Announcement, AnnouncementAttachment entities
    - Create `AnnouncementRepository` interface: create, findByTenant (paginated), addAttachment
    - Create `CreateAnnouncementUseCase`: validate category (umum/keamanan/keuangan/kegiatan/darurat), validate attachments (max 5, max 10MB each), enqueue notification dispatch via `NotificationQueueProtocol`, enqueue audit via `AuditQueueProtocol`
    - Define error code: `ANNOUNCEMENT_ATTACHMENT_LIMIT_EXCEEDED`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 10.2 Add Prisma models for Announcement and AnnouncementAttachment
    - Create Announcement model with tenant relation, title, content, category enum, created_by, published_at, created_at, updated_at (snake_case with @map)
    - Create AnnouncementAttachment model with announcement relation, file_url, file_name, file_size, mime_type, created_at (snake_case with @map)
    - Run migration
    - _Requirements: 9.1, 9.3_

  - [x] 10.3 Implement emergency domain and use cases
    - Create `src/core/domains/emergency/entities/` with EmergencyAlert entity
    - Create `EmergencyRepository` interface: createAlert, updateStatus, findActiveByTenant
    - Create `TriggerEmergencyAlertUseCase`: create alert with GPS (or flag location_unavailable), enqueue real-time notification to Ketua_RT/Pengurus/Security_Guard via `NotificationQueueProtocol`, enqueue audit via `AuditQueueProtocol`
    - Create `UpdateEmergencyStatusUseCase`: update status (active/responding/resolved), enqueue audit
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 10.4 Implement announcement and emergency repositories (infrastructure) and route handlers
    - Create `AnnouncementRepositoryImpl` and `EmergencyRepositoryImpl` using Prisma via TenantScopedRepository
    - Add Prisma models and run migration for EmergencyAlert (snake_case with @map)
    - Create route handlers: `app/api/announcements/route.ts`, `app/api/emergency/route.ts`, `app/api/emergency/[id]/status/route.ts`
    - Register in DI container
    - _Requirements: 9.1, 10.1, 10.3_

  - [ ]* 10.5 Write unit tests for announcement and emergency use cases
    - Test CreateAnnouncementUseCase: valid announcement, attachment limits exceeded
    - Test TriggerEmergencyAlertUseCase: with GPS, without GPS, notification dispatch
    - Test UpdateEmergencyStatusUseCase: valid transitions
    - _Requirements: 9.1, 9.5, 10.1, 10.4_

- [x] 11. Map, security patrol, and administration
  - [x] 11.1 Implement map domain
    - Create `src/core/domains/map/entities/` with HouseholdMapMarker type
    - Create `MapRepository` interface: getMarkersByTenant (with filters: block, status, categories), updateCoordinates
    - Create `GetMapMarkersUseCase` and `UpdateHouseholdCoordinatesUseCase`
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [x] 11.2 Implement security patrol domain
    - Create `src/core/domains/security/entities/` with PatrolSchedule, PatrolAttendance, IncidentReport entities
    - Create `SecurityRepository` interface: createSchedule, recordAttendance, createIncidentReport, findSchedulesByTenant
    - Add Prisma models for PatrolSchedule, PatrolAttendance, IncidentReport with tenant relations (snake_case with @map)
    - Create `CreatePatrolScheduleUseCase`, `RecordPatrolAttendanceUseCase`, `CreateIncidentReportUseCase`
    - Run migration
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 11.3 Implement administration domain (letter requests)
    - Create `src/core/domains/administration/entities/` with LetterRequest entity
    - Create `AdministrationRepository` interface: createRequest, approve, reject, findByTenant, findByUser
    - Add Prisma model for LetterRequest with tenant relation, status enum (pending/approved/rejected), document_url (snake_case with @map)
    - Create `SubmitLetterRequestUseCase`, `ApproveLetterRequestUseCase` (generate PDF), `RejectLetterRequestUseCase`
    - Enqueue notification on status change via `NotificationQueueProtocol`, enqueue audit on approval/rejection via `AuditQueueProtocol`
    - Run migration
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 11.4 Implement repositories (infrastructure) and route handlers for map, security, administration
    - Create `MapRepositoryImpl`, `SecurityRepositoryImpl`, `AdministrationRepositoryImpl` using Prisma via TenantScopedRepository
    - Create route handlers: `app/api/map/route.ts`, `app/api/map/coordinates/route.ts`, `app/api/security/patrols/route.ts`, `app/api/security/attendance/route.ts`, `app/api/security/incidents/route.ts`, `app/api/administration/letters/route.ts`, `app/api/administration/letters/[id]/approve/route.ts`, `app/api/administration/letters/[id]/reject/route.ts`
    - Register all in DI container
    - _Requirements: 11.1, 11.4, 12.1, 12.2, 12.3, 13.1, 13.2, 13.3_

  - [ ]* 11.5 Write unit tests for map, security, and administration use cases
    - Test GetMapMarkersUseCase: with filters, empty results
    - Test CreatePatrolScheduleUseCase: valid schedule, attendance recording
    - Test SubmitLetterRequestUseCase, ApproveLetterRequestUseCase, RejectLetterRequestUseCase
    - _Requirements: 11.1, 11.3, 12.1, 12.2, 13.1, 13.2, 13.3_

- [x] 12. Events and visitor/package logging
  - [x] 12.1 Implement event domain
    - Create `src/core/domains/event/entities/` with CommunityEvent, EventRsvp entities
    - Create `EventRepository` interface: createEvent, submitRsvp, findByTenant, findRsvpsByEvent
    - Add Prisma models for CommunityEvent and EventRsvp with `(event_id, user_id)` unique index (snake_case with @map)
    - Create `CreateEventUseCase`, `SubmitRsvpUseCase` (prevent duplicates with `EVENT_DUPLICATE_RSVP`)
    - Run migration
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [x] 12.2 Implement visitor/package logging domain
    - Create `src/core/domains/visitor/entities/` with VisitorLog, PackageLog entities
    - Create `VisitorRepository` interface: logVisitor, logPackage, recordVisitorExit, findByTenant
    - Add Prisma models for VisitorLog and PackageLog with tenant relations (snake_case with @map)
    - Create `LogVisitorUseCase`, `LogPackageUseCase`, `RecordVisitorExitUseCase`
    - Enqueue notification to destination household via `NotificationQueueProtocol`
    - Run migration
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

  - [x] 12.3 Implement repositories (infrastructure) and route handlers for events and visitors
    - Create `EventRepositoryImpl` and `VisitorRepositoryImpl` using Prisma via TenantScopedRepository
    - Create route handlers: `app/api/events/route.ts`, `app/api/events/[id]/rsvp/route.ts`, `app/api/visitors/route.ts`, `app/api/visitors/[id]/exit/route.ts`, `app/api/packages/route.ts`
    - Register all in DI container
    - _Requirements: 14.1, 14.2, 15.1, 15.2, 15.4_

  - [ ]* 12.4 Write unit tests for event and visitor use cases
    - Test CreateEventUseCase, SubmitRsvpUseCase (valid, duplicate RSVP)
    - Test LogVisitorUseCase, LogPackageUseCase, RecordVisitorExitUseCase
    - _Requirements: 14.1, 14.2, 14.4, 15.1, 15.2, 15.4_

- [x] 13. Checkpoint - Run all tests, fix failures, and document unresolved issues in CHECKPOINT_REPORT.md

- [x] 14. Billing, subscription, and feature flags
  - [x] 14.1 Implement billing domain entities and repository interface
    - Create `src/core/domains/billing/entities/` with SubscriptionPlan, Invoice entities
    - Create `BillingRepository` interface: createInvoice, updateInvoiceStatus, findInvoicesByTenant, getActivePlan, changePlan
    - Define billing error codes: `BILLING_USER_LIMIT_EXCEEDED`
    - _Requirements: 16.1, 16.2, 16.6, 29.1_

  - [x] 14.2 Add Prisma models for Invoice and PaymentReconciliation
    - Create Invoice model with tenant relation, plan_name, amount, billing_period_start, billing_period_end, due_date, status enum (pending/paid/failed), gateway_transaction_id, paid_at, retry_count, idempotency_key, created_at, updated_at (snake_case with @map)
    - Create PaymentReconciliation model: gateway_transaction_id, internal_invoice_id, amount, status, gateway_response (JSON), reconciled_at, created_at (snake_case with @map)
    - Add index: `(tenant_id, status, due_date)` on Invoice, unique index on `idempotency_key`
    - Run migration
    - _Requirements: 29.1, 29.7_

  - [x] 14.3 Implement billing use cases
    - Create `GenerateInvoiceUseCase`: create invoice at billing cycle start with idempotency key to prevent duplicate invoices
    - Create `ProcessPaymentUseCase`: integrate with payment gateway (Midtrans/Xendit), include idempotency key in gateway request, update invoice status, extend subscription
    - Create `HandlePaymentWebhookUseCase`: validate webhook signature (HMAC-SHA256 or RSA depending on gateway), update payment status, write to PaymentReconciliation log, enqueue audit via `AuditQueueProtocol`
    - Create `RetryFailedPaymentUseCase`: retry up to 2 times over 48 hours with idempotency key
    - Create `DowngradeTenantUseCase`: downgrade to Free plan if unpaid more than 14 days, notify Ketua_RT via `NotificationQueueProtocol`
    - Create `EnforceUserLimitUseCase`: check plan user limit (Free: 50, Pro: 500, Enterprise: unlimited), reject with `BILLING_USER_LIMIT_EXCEEDED`
    - _Requirements: 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 29.1, 29.2, 29.3, 29.4, 29.5, 29.6, 29.7, 29.8_

  - [x] 14.4 Implement feature flag domain
    - Create `src/core/domains/featureFlag/entities/` with FeatureFlag, FeatureFlagOverride entities
    - Create `FeatureFlagRepository` interface: isEnabled, getByTenant, createOverride
    - Create `CheckFeatureFlagUseCase`, `OverrideFeatureFlagUseCase`
    - Implement `FeatureFlagRepositoryImpl` with Redis caching (10 min TTL)
    - Define error code: `FEATURE_DISABLED`
    - Add Prisma models for FeatureFlag and FeatureFlagOverride (snake_case with @map)
    - Run migration
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

  - [x] 14.5 Implement billing and feature flag repositories (infrastructure) and route handlers
    - Create `BillingRepositoryImpl` and `FeatureFlagRepositoryImpl` using Prisma via TenantScopedRepository
    - Create route handlers: `app/api/billing/invoices/route.ts`, `app/api/billing/webhook/route.ts`, `app/api/billing/plans/route.ts`, `app/api/feature-flags/route.ts`, `app/api/feature-flags/override/route.ts`
    - Register all in DI container
    - _Requirements: 16.1, 19.1, 29.1, 29.4_

  - [ ]* 14.6 Write property test for subscription plan limit enforcement
    - **Property 9: Subscription Plan Limit Enforcement**
    - Generate random tenants with plans, verify user limit enforcement (Free: 50, Pro: 500, Enterprise: unlimited), verify feature flag access control
    - **Validates: Requirements 16.2, 16.3, 16.4, 16.5, 16.6, 19.2, 19.3**

  - [ ]* 14.7 Write unit tests for billing, payment webhook, and feature flag use cases
    - Test GenerateInvoiceUseCase: idempotency key prevents duplicate invoices
    - Test ProcessPaymentUseCase: successful payment, failed payment, idempotency
    - Test HandlePaymentWebhookUseCase: valid signature accepted, invalid signature rejected, reconciliation log written
    - Test EnforceUserLimitUseCase: within limit, at limit, over limit per plan
    - Test CheckFeatureFlagUseCase: enabled, disabled, override
    - _Requirements: 16.2, 16.6, 19.2, 19.3, 29.1, 29.3, 29.4, 29.7_

- [x] 15. Notification engine and audit logging
  - [x] 15.1 Implement notification domain (full implementation replacing stub)
    - Create `src/core/domains/notification/entities/` with Notification entity
    - Create `NotificationRepository` interface: create, findByUser (paginated), markAsRead
    - Add Prisma model for Notification with tenant relation, user_id, type, title, body, channel enum (push/email/inbox), status enum (unread/read), created_at (snake_case with @map)
    - Add index: `(tenant_id, user_id, status, created_at)` on Notification
    - Run migration
    - _Requirements: 17.1, 17.4, 17.5_

  - [x] 15.2 Implement notification use cases and BullMQ workers
    - Create `DispatchNotificationUseCase`: create notification record, dispatch via configured channels
    - Create BullMQ notification worker: process notification-queue jobs, handle push/email/inbox channels
    - Replace notification stub from Task 1.5 with full implementation, update DI registration
    - Implement retry logic: 3 retries with exponential backoff, log `NOTIFICATION_DISPATCH_FAILED` on exhaustion
    - _Requirements: 17.1, 17.2, 17.3, 17.6_

  - [x] 15.3 Implement audit logging domain and BullMQ worker (full implementation replacing stub)
    - Create `src/core/domains/audit/entities/` with AuditLog entity
    - Create `AuditRepository` interface: create (append-only), findByTenant (paginated, filterable)
    - Add Prisma model for AuditLog with all required fields: audit_id, tenant_id, actor_user_id, action_type, resource_type, resource_id, details (JSON), ip_address, impersonator_id, timestamp (snake_case with @map)
    - Add indexes: `(tenant_id, timestamp)`, `(tenant_id, action_type)` on AuditLog
    - Create BullMQ audit worker: process audit-queue jobs, write to database
    - Replace audit stub from Task 1.5 with full implementation, update DI registration
    - Implement sensitive data exclusion (passwords, tokens, OTP) and masking (NIK, phone, email) in audit details
    - Run migration
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6_

  - [x] 15.4 Implement notification and audit repositories (infrastructure) and route handlers
    - Create `NotificationRepositoryImpl` and `AuditRepositoryImpl` using Prisma via TenantScopedRepository
    - Create route handlers: `app/api/notifications/route.ts` (GET inbox), `app/api/notifications/[id]/read/route.ts` (PATCH), `app/api/audit/route.ts` (GET paginated, filterable)
    - Register all in DI container
    - _Requirements: 17.4, 17.5, 18.4_

  - [ ]* 15.5 Write property test for audit log immutability and completeness
    - **Property 14: Audit Log Immutability and Completeness**
    - Generate random audit entries, verify append-only behavior, verify all required fields present, verify sensitive data excluded
    - **Validates: Requirements 18.2, 18.5, 18.6**

  - [ ]* 15.6 Write unit tests for notification and audit use cases
    - Test DispatchNotificationUseCase: successful dispatch, failed dispatch with retry
    - Test audit worker: valid entry creation, sensitive data exclusion
    - Test notification inbox: pagination, mark as read
    - _Requirements: 17.2, 17.3, 17.5, 17.6, 18.2, 18.5, 18.6_

- [x] 16. Checkpoint - Run all tests, fix failures, and document unresolved issues in CHECKPOINT_REPORT.md

- [x] 17. Dashboard, file storage, and privacy
  - [x] 17.1 Implement dashboard domain
    - Create `src/core/domains/dashboard/entities/` with KetuaDashboardMetrics, PlatformDashboardMetrics types
    - Create `DashboardRepository` interface: getKetuaMetrics, getPlatformMetrics
    - Create `GetKetuaDashboardUseCase` and `GetPlatformDashboardUseCase` with Redis caching (5 min TTL)
    - _Requirements: 20.1, 20.2, 20.3, 20.4_

  - [x] 17.2 Implement file storage domain
    - Create `src/core/domains/fileStorage/entities/` with FileMetadata type
    - Create `FileStorageRepository` interface wrapping `FileStorageProtocol`: upload (validate size 10MB max, validate MIME type, UUID rename, tenant path), getSignedUrl (15 min expiry), delete
    - Create `UploadFileUseCase`: validate file size and MIME type, generate UUID filename, store at `{tenant_id}/{domain}/{filename}`
    - Define error codes: `FILE_INVALID_TYPE`, `FILE_SIZE_EXCEEDED`
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7_

  - [x] 17.3 Implement privacy domain
    - Create `src/core/domains/privacy/entities/` with consent types
    - Create `PrivacyRepository` interface: maskNik, maskPhone, recordConsent, exportPersonalData, requestDeletion
    - Create `MaskSensitiveDataUseCase`: mask NIK (show last 4 digits), mask phone (show last 4 digits), apply role-based exceptions
    - Create `ExportPersonalDataUseCase` and `RequestDataDeletionUseCase` (soft delete plus anonymize audit entries)
    - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 27.7_

  - [x] 17.4 Implement dashboard, file storage, and privacy repositories (infrastructure) and route handlers
    - Create `DashboardRepositoryImpl` (aggregation queries plus Redis cache), `FileStorageRepositoryImpl` (S3 adapter), `PrivacyRepositoryImpl` (Prisma via TenantScopedRepository)
    - Create route handlers: `app/api/dashboard/route.ts`, `app/api/dashboard/platform/route.ts`, `app/api/files/upload/route.ts`, `app/api/files/[key]/route.ts`, `app/api/privacy/export/route.ts`, `app/api/privacy/delete/route.ts`, `app/api/privacy/consent/route.ts`
    - Register all in DI container
    - _Requirements: 20.1, 20.2, 26.1, 26.4, 27.3, 27.4, 27.5_

  - [ ]* 17.5 Write property test for sensitive data masking
    - **Property 11: Sensitive Data Masking**
    - Generate random NIK and phone values, verify masking output shows only last 4 digits, verify role-based exceptions
    - **Validates: Requirements 27.1, 27.2, 27.7**

  - [ ]* 17.6 Write property test for file upload safety
    - **Property 12: File Upload Safety**
    - Generate random files with various sizes and MIME types, verify validation, UUID naming, and tenant path structure
    - **Validates: Requirements 26.2, 26.3, 26.5**

  - [ ]* 17.7 Write unit tests for dashboard, file storage, and privacy use cases
    - Test GetKetuaDashboardUseCase: metrics calculation, cache hit/miss
    - Test UploadFileUseCase: valid file, oversized file, invalid MIME type
    - Test MaskSensitiveDataUseCase: NIK masking, phone masking, role exceptions
    - _Requirements: 20.1, 20.3, 26.2, 26.3, 26.6, 27.1, 27.2_

- [x] 18. Operational administration (Super_Admin)
  - [x] 18.1 Implement operational domain
    - Create `src/core/domains/operational/entities/` with ImpersonationSession, TenantHealthMetrics types
    - Create `OperationalRepository` interface: createImpersonationSession, endImpersonationSession, getTenantHealth
    - Create `ImpersonateUseCase`: create time-limited token (max 60 min), tag audit with impersonator plus impersonated IDs via `AuditQueueProtocol`
    - Create `EndImpersonationUseCase`: revoke token, log session end
    - Create `GetTenantHealthUseCase`: active users (30d), storage usage, API requests (30d), last activity
    - _Requirements: 30.3, 30.4, 30.5, 30.6, 30.7, 30.8_

  - [x] 18.2 Implement operational repository (infrastructure) and route handlers
    - Create `OperationalRepositoryImpl` using Prisma via TenantScopedRepository
    - Create route handlers: `app/api/admin/impersonate/route.ts`, `app/api/admin/impersonate/end/route.ts`, `app/api/admin/tenants/[id]/health/route.ts`
    - Register in DI container
    - _Requirements: 30.3, 30.4, 30.6_

  - [ ]* 18.3 Write property test for impersonation safety
    - **Property 15: Impersonation Safety**
    - Generate random impersonation sessions, verify token time limit (60 min), verify audit tagging with both IDs, verify revocation on expiry/end
    - **Validates: Requirements 30.4, 30.5, 30.6**

  - [ ]* 18.4 Write unit tests for operational use cases
    - Test ImpersonateUseCase: valid session creation, token expiry, audit tagging
    - Test EndImpersonationUseCase: token revocation, session end logging
    - _Requirements: 30.4, 30.5, 30.6_

- [x] 19. Checkpoint - Run all tests, fix failures, and document unresolved issues in CHECKPOINT_REPORT.md

- [x] 20. Background job workers (reminders and scheduled tasks)
  - [x] 20.1 Implement BullMQ reminder workers
    - Create Iuran payment reminder worker: check unpaid iuran past due date, enqueue notification to household head via `NotificationQueueProtocol`
    - Create event reminder worker: check events within 24 hours, enqueue notification to attending RSVPs
    - Create patrol reminder worker: check patrol members not checked in within 30 minutes, enqueue notification
    - Register workers with BullMQ scheduler for periodic execution
    - _Requirements: 7.6, 12.4, 14.3, 23.1, 23.4_

  - [x] 20.2 Implement backup and data retention jobs
    - Create daily backup job using `pg_dump` command with configurable time (default 02:00 UTC)
    - Define backup storage path: `backups/{date}/societ-rt-{timestamp}.sql.gz` on separate storage volume
    - Implement retention policy check job: retain daily backups for 30 days, weekly backups for 90 days, auto-delete expired backups
    - Create restore procedure script: `pg_restore` from specified backup file with pre-restore validation
    - Create backup logging: status (success/failed), timestamp, backup size, duration, storage path
    - Implement soft delete enforcement: prevent hard deletion of financial transactions via application API
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.7, 24.8_

  - [ ]* 20.3 Write unit tests for reminder workers and backup jobs
    - Test Iuran reminder: identifies unpaid households, dispatches notifications
    - Test event reminder: identifies upcoming events, notifies attending users
    - Test patrol reminder: identifies missing check-ins, notifies patrol members
    - Test retention policy: correctly identifies expired backups
    - _Requirements: 7.6, 12.4, 14.3, 24.2_

- [x] 21. Presentation layer - shared components and layout
  - [x] 21.1 Create shared UI components (Atomic Design)
    - Create atoms: Button, Input, Label, Badge, Spinner, Avatar in `src/presentation/components/atoms/`
    - Create molecules: FormField (React Hook Form plus Zod), SearchBar, ErrorMessage, EmptyState, ConfirmDialog in `src/presentation/components/molecules/`
    - Create organisms: Sidebar, Header (with impersonation indicator), NotificationBell, DataTable (paginated), MapContainer (Leaflet wrapper) in `src/presentation/components/organisms/`
    - All components use Tailwind, support i18n via `t()`, handle loading/error/empty states
    - _Requirements: 28.3, 30.7_

  - [x] 21.2 Create app layout and providers
    - Create `src/app/layout.tsx` with root layout, metadata, PWA manifest link
    - Create `src/presentation/providers/` with QueryClientProvider (TanStack Query), DI provider
    - Create responsive sidebar layout with role-based navigation menu
    - Create `src/app/(auth)/layout.tsx` for auth pages (login, register)
    - Create `src/app/(dashboard)/layout.tsx` for authenticated pages with sidebar
    - _Requirements: 28.1, 28.3_

  - [x] 21.3 Set up PWA configuration
    - Create web app manifest with app name, icons (192x192, 512x512), theme color, start URL
    - Create service worker with cache strategy: Cache-First for static assets (HTML shell, CSS, JS bundles, icons), Network-First for API calls, Stale-While-Revalidate for images
    - Document offline limitations: API calls will fail offline, only cached static shell and previously viewed pages available, no offline form submission
    - Create PushSubscription Prisma model: user_id, tenant_id, endpoint, p256dh_key, auth_key, created_at (snake_case with @map) for storing Web Push subscriptions
    - Implement offline indicator component
    - Implement Web Push API integration for push notification permission and subscription storage
    - Run migration for PushSubscription model
    - _Requirements: 28.1, 28.2, 28.4, 28.5, 28.6_

  - [x] 21.4 Create health check endpoint
    - Create `app/api/health/route.ts`: check database connectivity, Redis connectivity, BullMQ worker status
    - No authentication required
    - _Requirements: 25.7_

- [x] 22. Presentation layer - auth and tenant features
  - [x] 22.1 Implement auth feature screens and ViewModels
    - Create `src/presentation/features/auth/viewModel/useLoginViewModel.ts` using TanStack Query mutation
    - Create `src/presentation/features/auth/viewModel/useRegisterViewModel.ts`
    - Create `src/presentation/features/auth/screens/LoginScreen.tsx` with React Hook Form plus Zod validation
    - Create `src/presentation/features/auth/screens/RegisterScreen.tsx`
    - Create `src/presentation/features/auth/validation/` with Zod schemas for login and register forms
    - Wire to app routes: `app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`
    - _Requirements: 3.1, 3.2_

  - [x] 22.2 Implement tenant management screens (Super_Admin)
    - Create `src/presentation/features/tenant/viewModel/useTenantListViewModel.ts`, `useTenantFormViewModel.ts`
    - Create tenant list screen, tenant creation form, tenant detail/branding screen
    - Create tenant suspension/reactivation controls
    - Wire to app routes: `app/(dashboard)/admin/tenants/page.tsx`, `app/(dashboard)/admin/tenants/[id]/page.tsx`
    - _Requirements: 2.1, 2.3, 30.1, 30.2_

  - [x] 22.3 Implement user management and role assignment screens (Ketua_RT)
    - Create ViewModels for user list, role assignment, invitation generation
    - Create user management screen with role assignment dropdown
    - Create invitation link generation UI
    - Wire to app routes: `app/(dashboard)/users/page.tsx`
    - _Requirements: 4.2, 4.5, 3.3_

- [x] 23. Presentation layer - resident, finance, and voting features
  - [x] 23.1 Implement resident management screens
    - Create ViewModels: `useHouseholdListViewModel`, `useResidentFormViewModel`, `useCsvImportViewModel`, `useCsvExportViewModel`
    - Create household list screen with search and filter
    - Create resident detail screen with status management and category tagging
    - Create CSV import screen with upload, validation summary, and error report display
    - Create CSV export button component
    - Wire to app routes: `app/(dashboard)/residents/page.tsx`, `app/(dashboard)/residents/[id]/page.tsx`, `app/(dashboard)/residents/import/page.tsx`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_

  - [x] 23.2 Implement finance management screens
    - Create ViewModels: `useTransactionListViewModel`, `useTransactionFormViewModel`, `useIuranStatusViewModel`, `useFinancialReportViewModel`
    - Create transaction list screen with income/expense tabs
    - Create transaction form with Zod validation (amount greater than 0)
    - Create iuran status dashboard per household per month
    - Create financial report screen with date range picker and export button
    - Wire to app routes: `app/(dashboard)/finance/page.tsx`, `app/(dashboard)/finance/report/page.tsx`, `app/(dashboard)/finance/iuran/page.tsx`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.7, 7.8_

  - [x] 23.3 Implement voting screens
    - Create ViewModels: `useVoteListViewModel`, `useCreateVoteViewModel`, `useCastVoteViewModel`, `useVoteTallyViewModel`
    - Create vote list screen showing active/completed votes
    - Create vote creation form with options management (min 2), mode selection (anonymous/verified), deadline picker
    - Create vote casting screen with real-time tally display (auto-refresh via TanStack Query)
    - Wire to app routes: `app/(dashboard)/voting/page.tsx`, `app/(dashboard)/voting/create/page.tsx`, `app/(dashboard)/voting/[id]/page.tsx`
    - _Requirements: 8.1, 8.2, 8.3, 8.6_

- [x] 24. Presentation layer - announcements, emergency, map, and security
  - [x] 24.1 Implement announcement screens
    - Create ViewModels: `useAnnouncementListViewModel`, `useCreateAnnouncementViewModel`
    - Create announcement list screen with category filter
    - Create announcement form with file attachment upload (max 5 files, max 10MB each)
    - Wire to app routes: `app/(dashboard)/announcements/page.tsx`, `app/(dashboard)/announcements/create/page.tsx`
    - _Requirements: 9.1, 9.2, 9.3, 9.5_

  - [x] 24.2 Implement emergency alert screens
    - Create ViewModels: `useEmergencyAlertViewModel`, `useEmergencyListViewModel`
    - Create emergency button component with GPS permission request
    - Create emergency alert list screen for Ketua_RT/Pengurus with status management (active/responding/resolved)
    - Wire to app routes: `app/(dashboard)/emergency/page.tsx`
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 24.3 Implement resident map screen
    - Create `useMapViewModel` with marker data, filter state
    - Create interactive map screen using Leaflet with household markers
    - Implement marker popup: household number, address, head of household, resident count
    - Implement filter controls: block/cluster, residency status, special categories (lansia, balita)
    - Create coordinate editing UI for Pengurus
    - Wire to app route: `app/(dashboard)/map/page.tsx`
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [x] 24.4 Implement security patrol screens
    - Create ViewModels for patrol schedule, attendance, incident reports
    - Create patrol schedule management screen
    - Create attendance check-in screen for Security_Guard
    - Create incident report form and list
    - Wire to app routes: `app/(dashboard)/security/patrols/page.tsx`, `app/(dashboard)/security/incidents/page.tsx`
    - _Requirements: 12.1, 12.2, 12.3_

- [x] 25. Checkpoint - Run all tests, fix failures, and document unresolved issues in CHECKPOINT_REPORT.md

- [x] 26. Presentation layer - remaining features
  - [x] 26.1 Implement administration (letter request) screens
    - Create ViewModels for letter request submission, approval/rejection
    - Create letter request form (type selection, purpose)
    - Create letter request list with status filter for Ketua_RT
    - Create approval/rejection UI with reason input
    - Wire to app routes: `app/(dashboard)/administration/letters/page.tsx`, `app/(dashboard)/administration/letters/[id]/page.tsx`
    - _Requirements: 13.1, 13.2, 13.3_

  - [x] 26.2 Implement event and RSVP screens
    - Create ViewModels for event list, event creation, RSVP
    - Create event list screen with upcoming/past tabs
    - Create event creation form
    - Create RSVP component (attending/not attending)
    - Wire to app routes: `app/(dashboard)/events/page.tsx`, `app/(dashboard)/events/create/page.tsx`, `app/(dashboard)/events/[id]/page.tsx`
    - _Requirements: 14.1, 14.2_

  - [x] 26.3 Implement visitor and package logging screens
    - Create ViewModels for visitor log, package log
    - Create visitor entry form (name, purpose, destination household)
    - Create package log form (recipient household, courier, description)
    - Create visitor/package list with exit recording
    - Wire to app routes: `app/(dashboard)/visitors/page.tsx`, `app/(dashboard)/packages/page.tsx`
    - _Requirements: 15.1, 15.2, 15.4_

  - [x] 26.4 Implement dashboard screens
    - Create `useKetuaDashboardViewModel` with all metrics from design
    - Create `usePlatformDashboardViewModel` for Super_Admin
    - Create Ketua_RT dashboard screen: total residents, kas balance, unpaid iuran, active votes, active emergencies, recent announcements, upcoming events
    - Create Super_Admin platform dashboard: total tenants, MRR, total users, active subscriptions by plan
    - Wire to app routes: `app/(dashboard)/page.tsx` (role-based), `app/(dashboard)/admin/page.tsx`
    - _Requirements: 20.1, 20.2_

  - [x] 26.5 Implement notification inbox screen
    - Create `useNotificationInboxViewModel` with paginated list, mark as read
    - Create notification inbox screen with unread/read tabs
    - Wire to app route: `app/(dashboard)/notifications/page.tsx`
    - _Requirements: 17.4, 17.5_

  - [x] 26.6 Implement billing and subscription screens
    - Create ViewModels for plan selection, invoice list, payment
    - Create subscription plan comparison screen
    - Create invoice list with payment status
    - Create payment flow integration with gateway
    - Wire to app routes: `app/(dashboard)/billing/page.tsx`, `app/(dashboard)/billing/invoices/page.tsx`
    - _Requirements: 16.1, 29.1, 29.2, 29.3_

  - [x] 26.7 Implement audit log viewer screen (Ketua_RT and Super_Admin)
    - Create `useAuditLogViewModel` with pagination, filtering by action_type, date range
    - Create audit log list screen with detail expansion
    - Wire to app route: `app/(dashboard)/audit/page.tsx`
    - _Requirements: 18.4_

  - [x] 26.8 Implement feature flag management screen (Super_Admin)
    - Create ViewModel for feature flag list and override management
    - Create feature flag list with per-tenant override toggle
    - Wire to app route: `app/(dashboard)/admin/feature-flags/page.tsx`
    - _Requirements: 19.1, 19.4_

  - [x] 26.9 Implement privacy and data management screens
    - Create personal data export request screen for Warga
    - Create data deletion request screen for Warga
    - Create consent recording during registration flow
    - Wire to app routes: `app/(dashboard)/privacy/page.tsx`
    - _Requirements: 27.3, 27.4, 27.5_

  - [x] 26.10 Implement Super_Admin operational screens
    - Create impersonation session UI with visible indicator banner
    - Create tenant health metrics screen
    - Wire to app routes: `app/(dashboard)/admin/tenants/[id]/impersonate/page.tsx`, `app/(dashboard)/admin/tenants/[id]/health/page.tsx`
    - _Requirements: 30.3, 30.4, 30.7_

- [x] 27. Observability and monitoring integration
  - [x] 27.1 Implement observability infrastructure
    - Create structured JSON logger middleware that captures: timestamp, level, message, correlation_id, tenant_id, user_id, route, duration_ms
    - Implement API latency tracking (p50, p95, p99) and error rate metrics
    - Implement slow request warning: log warning if response time exceeds 2000ms
    - Implement BullMQ queue depth monitoring: log warning if pending jobs exceed 1000
    - Create background job metrics: queue depth, processing time, success rate, failure rate per job type
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6_

- [x] 28. Final integration and wiring
  - [x] 28.1 Wire all DI registrations
    - Verify all repositories registered in `repositoryContainer.ts`
    - Verify all use cases registered in `useCasesContainer.ts`
    - Verify all ViewModels registered in `viewModelContainer.ts`
    - Verify all protocol implementations registered in `moduleContainer.ts`
    - Verify registration order: modules, repositories, use cases, ViewModels, logging
    - _Requirements: All_

  - [x] 28.2 Implement Zustand stores for shared UI state
    - Create sidebar toggle store
    - Create global loading state store
    - Create impersonation indicator state store
    - Place in `src/infrastructure/stateManagement/`
    - _Requirements: 30.7_

  - [x] 28.3 Create i18n setup and translation files
    - Set up i18n infrastructure in `src/presentation/locales/`
    - Create translation files for all error codes and user-facing messages
    - Create translation files for all UI labels and form fields
    - _Requirements: All UI requirements_

  - [ ]* 28.4 Write integration tests for critical route handlers
    - Test auth route handlers with mocked DI: login, register, logout
    - Test tenant CRUD route handlers with auth context
    - Test finance transaction route handlers with validation
    - Test voting route handlers with deadline and duplicate checks
    - Test payment webhook handler: valid signature, invalid signature, reconciliation log
    - Test error response sanitization across all handlers
    - _Requirements: 3.1, 7.1, 8.3, 21.5, 22.4, 29.4_

  - [ ]* 28.5 Write integration tests for middleware chain
    - Test JWT validation middleware: valid token, expired token, missing token
    - Test tenant context resolution: valid tenant, missing tenant, cross-tenant access
    - Test rate limiting on login endpoint
    - Test security headers presence
    - _Requirements: 1.3, 1.4, 1.5, 21.3, 21.4, 21.6_

- [x] 29. Final checkpoint - Run all tests, fix failures, and document unresolved issues in CHECKPOINT_REPORT.md

- [x] 30. Realtime infrastructure (WebSocket server, Redis pub/sub, Realtime Bus)
  - [x] 30.1 Implement realtime bus domain protocols and entities
    - Create `src/core/protocols/WebSocketProtocol.ts` interface with: broadcast, sendToUser, sendToRole, getActiveConnections, disconnectUser
    - Create `src/core/protocols/RealtimeBusProtocol.ts` interface with: publish, subscribe, unsubscribe, getChannelSubscriberCount
    - Create `src/core/domains/realtimeBus/entities/` with RealtimeEvent type (id, tenantId, channel, eventType, payload, privacy, targetHouseholdId, timestamp)
    - Define event channel constants: `security_events`, `device_events`, `incident_updates`, `gate_events`, `cctv_events`, `patrol_events`, `alarm_events`
    - Define shared security event types and private home event types as const arrays
    - Create event routing function: classify events as shared or private based on eventType
    - Define error codes: `WS_AUTH_FAILED`, `WS_TENANT_MISMATCH`
    - _Requirements: 40.1, 40.2, 40.3, 40.4, 40.5, 40.6, 41.1, 41.2, 41.3_

  - [x] 30.2 Implement WebSocket server and Redis pub/sub adapter
    - Create `src/infrastructure/realtime/WebSocketServer.ts` using `ws` library on a separate port
    - Implement JWT authentication on WebSocket handshake (validate token, extract tenantId and userId)
    - Implement channel subscription with tenant isolation (clients can only subscribe to their tenant's channels)
    - Implement privacy filter: shared events broadcast to Security_Guard/Pengurus/Ketua_RT, private events only to Home_Owner
    - Create `src/infrastructure/realtime/RedisPubSubAdapter.ts` implementing `RealtimeBusProtocol`
    - Implement heartbeat with 30-second ping/pong, disconnect after 3 missed pongs
    - Implement reconnection with exponential backoff for Redis pub/sub connection loss
    - Implement event replay buffer using BullMQ for critical events (1-hour TTL)
    - Register `WebSocketProtocol` and `RealtimeBusProtocol` implementations in DI container
    - _Requirements: 40.1, 40.2, 40.4, 40.5, 40.6, 40.7, 40.8, 40.9, 40.10, 40.11, 40.12_

  - [ ]* 30.3 Write property test for WebSocket tenant isolation
    - **Property 22: WebSocket Tenant Isolation**
    - Generate random multi-tenant event scenarios, verify clients only receive events from their own tenant
    - **Validates: Requirements 40.4**

  - [ ]* 30.4 Write property test for event classification correctness
    - **Property 17: Event Classification Correctness**
    - Generate random DeviceEvents with all event types, verify shared/private classification is deterministic and total
    - **Validates: Requirements 41.1, 41.2, 41.3**

  - [ ]* 30.5 Write property test for private event privacy
    - **Property 30: Private Event Privacy**
    - Generate random private events + connected clients, verify delivery only to Home_Owner
    - **Validates: Requirements 37.9, 40.5**

  - [ ]* 30.6 Write unit tests for realtime bus
    - Test event routing logic: shared events to correct roles, private events only to owner
    - Test WebSocket handshake JWT validation: valid token, expired token, missing token
    - Test tenant isolation: cross-tenant subscription rejected
    - Test heartbeat: disconnect after 3 missed pongs
    - Test reconnection: Redis pub/sub reconnect with backoff
    - _Requirements: 40.1, 40.4, 40.5, 40.9, 40.11_


- [x] 31. Checkpoint - Run all tests, fix failures, and document unresolved issues in CHECKPOINT_REPORT.md

- [x] 32. IoT domain and Tuya integration
  - [x] 32.1 Implement IoT domain entities and repository interface
    - Create `src/core/domains/iot/entities/` with IoTDevice, DeviceEvent entities matching design
    - Create `src/core/protocols/IoTGatewayProtocol.ts` interface with: pairDevice, sendCommand, syncDeviceStatus, getDeviceList, unpairDevice, validateWebhookSignature, refreshToken
    - Create `src/core/protocols/CircuitBreakerProtocol.ts` interface with: execute, getState, reset
    - Create `src/core/domains/iot/repositories/IoTRepository.ts` interface: registerDevice, findByHousehold, findByTuyaId, updateStatus, removeDevice, createDeviceEvent, findEventsByDevice
    - Define IoT error codes: `IOT_COMMAND_FAILED`, `IOT_DEVICE_ACCESS_DENIED`, `IOT_WEBHOOK_SIGNATURE_INVALID`, `IOT_CLOUD_UNAVAILABLE`, `IOT_DEVICE_OFFLINE`, `IOT_PAIRING_FAILED`, `IOT_RATE_LIMIT_EXCEEDED`
    - _Requirements: 38.1, 38.2, 38.4, 38.6, 38.7, 38.8, 38.10, 38.11, 38.13_

  - [x] 32.2 Add Prisma models for IoTDevice and DeviceEvent
    - Create IoTDevice model with tenant relation, household_id, tuya_device_id, device_type enum, name, online_status, battery_level, last_seen, metadata (JSON), created_at, updated_at (snake_case with @map)
    - Create DeviceEvent model with device relation, tenant_id, event_type enum, payload (JSON), is_shared_security, processed_at, created_at (snake_case with @map)
    - Add indexes: `(tenant_id, household_id)` on IoTDevice, `(tuya_device_id)` unique, `(device_id, created_at)` on DeviceEvent, `(tenant_id, event_type, created_at)`, `(tenant_id, is_shared_security, created_at)`
    - Run migration
    - _Requirements: 38.8, 37.3_

  - [x] 32.3 Implement Tuya IoT Gateway adapter (infrastructure)
    - Create `src/infrastructure/iot/TuyaGatewayAdapter.ts` implementing `IoTGatewayProtocol`
    - Implement OAuth 2.0 client credentials flow with token caching in Redis (TTL = expires_in - 60s)
    - Implement device pairing token generation and completion callback processing
    - Implement device command execution with retry (exponential backoff: 1s, 2s, 4s, max 3 attempts)
    - Implement webhook signature validation using HMAC-SHA256
    - Implement device status synchronization (configurable interval, default 60s)
    - Encrypt and store Tuya API credentials using AES-256
    - _Requirements: 38.1, 38.2, 38.3, 38.4, 38.6, 38.7, 38.12_

  - [x] 32.4 Implement circuit breaker for Tuya Cloud API
    - Create `src/infrastructure/iot/CircuitBreakerImpl.ts` implementing `CircuitBreakerProtocol`
    - Implement state machine: Closed to Open (5 consecutive failures), Open to Half-Open (30s elapsed), Half-Open to Closed (3 successes), Half-Open to Open (any failure)
    - When circuit is open: immediately fail with `IOT_CLOUD_UNAVAILABLE`, queue commands for up to 5 minutes
    - Register in DI container
    - _Requirements: 38.13, 44.6_

  - [x] 32.5 Implement IoT use cases
    - Create `PairDeviceUseCase`: validate Home_Owner role, generate pairing token, associate device with household, enqueue audit via `AuditQueueProtocol`
    - Create `SendDeviceCommandUseCase`: validate device ownership, check device online status, execute command via circuit breaker, enqueue audit
    - Create `ProcessWebhookEventUseCase`: validate signature, parse event, resolve tenant + device, classify event (shared/private), publish to Realtime Bus, trigger automation engine
    - Create `SyncDeviceStatusUseCase`: sync status from Tuya Cloud, detect offline devices (120s threshold), emit `device_offline` event
    - Create `UnpairDeviceUseCase`: remove device association, revoke access tokens, enqueue audit
    - Implement rate limiting: max 30 commands per minute per device
    - _Requirements: 37.1, 37.4, 37.6, 37.10, 37.11, 38.1, 38.2, 38.4, 38.5, 38.6, 38.7, 38.9, 38.10, 38.14, 41.4, 41.5, 41.8_

  - [x] 32.6 Implement IoT repository (infrastructure) and route handlers
    - Create `IoTRepositoryImpl` using Prisma via TenantScopedRepository
    - Create route handlers: `app/api/iot/devices/route.ts` (GET list), `app/api/iot/devices/pair/route.ts` (POST), `app/api/iot/devices/[id]/route.ts` (GET, DELETE), `app/api/iot/commands/route.ts` (POST), `app/api/iot/webhook/route.ts` (POST - no auth, signature validation only), `app/api/iot/health/route.ts` (GET)
    - All endpoints (except webhook and health) validate device ownership
    - Register all in DI container
    - _Requirements: 37.1, 37.4, 38.4, 38.6, 41.4, 44.5_

  - [ ]* 32.7 Write property test for device ownership isolation
    - **Property 16: Device Ownership Isolation**
    - Generate random users + devices + households, verify only Home_Owner can access private devices
    - **Validates: Requirements 37.6, 38.10, 41.4, 41.5**

  - [ ]* 32.8 Write property test for webhook signature validation
    - **Property 23: Webhook Signature Validation**
    - Generate random payloads + valid/invalid HMAC-SHA256 signatures, verify accept/reject
    - **Validates: Requirements 38.4, 38.11**

  - [ ]* 32.9 Write property test for IoT command retry correctness
    - **Property 24: IoT Command Retry Correctness**
    - Generate random failure sequences, verify retry count (3) + backoff timing (1s, 2s, 4s) + early success exit
    - **Validates: Requirements 38.7**

  - [ ]* 32.10 Write property test for circuit breaker state machine
    - **Property 29: Circuit Breaker State Machine**
    - Generate random success/failure sequences, verify state transitions match defined rules
    - **Validates: Requirements 38.13**

  - [ ]* 32.11 Write unit tests for IoT use cases and Tuya adapter
    - Test PairDeviceUseCase: valid pairing, non-owner rejected, pairing failure
    - Test SendDeviceCommandUseCase: valid command, device offline, ownership denied, rate limit exceeded
    - Test ProcessWebhookEventUseCase: valid signature, invalid signature, event routing
    - Test CircuitBreaker: state transitions, command queuing when open
    - _Requirements: 37.1, 37.4, 37.6, 38.4, 38.7, 38.10, 38.13_

- [x] 33. Checkpoint - Run all tests, fix failures, and document unresolved issues in CHECKPOINT_REPORT.md


- [x] 34. Incident management domain
  - [x] 34.1 Implement incident domain entities and repository interface
    - Create `src/core/domains/incident/entities/` with Incident, IncidentLog entities matching design
    - Create `IncidentRepository` interface: createIncident, updateStatus, addLog, findByTenant (paginated, filterable by status/severity/category), findById, attachEvidence
    - Define valid status transitions map: open->acknowledged/in_progress/escalated, acknowledged->in_progress/escalated, in_progress->escalated/resolved, escalated->in_progress/resolved, resolved->closed
    - Define error codes: `INCIDENT_INVALID_TRANSITION`, `INCIDENT_ALREADY_RESOLVED`
    - _Requirements: 32.1, 32.2, 32.3, 32.4, 32.6_

  - [x] 34.2 Add Prisma models for Incident and IncidentLog
    - Create Incident model with tenant relation, title, description, location, latitude, longitude, severity enum, category enum, status enum, reported_by, assigned_to, escalated_at, resolved_at, created_at, updated_at (snake_case with @map)
    - Create IncidentLog model with incident relation, status, notes, actor_id, timestamp (snake_case with @map)
    - Add indexes: `(tenant_id, status)`, `(tenant_id, severity)`, `(tenant_id, created_at)` on Incident, `(incident_id, timestamp)` on IncidentLog
    - Run migration
    - _Requirements: 32.1, 32.2, 32.4_

  - [x] 34.3 Implement incident use cases
    - Create `CreateIncidentUseCase`: create incident with status open, enqueue notification to Security_Guard and Ketua_RT via `NotificationQueueProtocol`, publish to Realtime Bus, enqueue audit via `AuditQueueProtocol`
    - Create `UpdateIncidentStatusUseCase`: validate status transition against allowed transitions map, record log entry, enqueue notification, publish update to Realtime Bus
    - Create `AutoCreateIncidentUseCase`: triggered by critical Device_Events (panic_button_pressed, smoke_detected, emergency_alert), auto-create incident with device context
    - Create `EscalateIncidentUseCase`: auto-escalate critical/high incidents after 5 minutes unresolved, notify Ketua_RT and emergency contacts after 15 minutes
    - Create `AttachEvidenceUseCase`: validate file limits (max 5 files, 20MB each), store via FileStorageProtocol
    - _Requirements: 32.1, 32.2, 32.4, 32.5, 32.6, 32.7, 32.8, 32.10_

  - [x] 34.4 Implement incident repository (infrastructure) and route handlers
    - Create `IncidentRepositoryImpl` using Prisma via TenantScopedRepository
    - Create route handlers: `app/api/security/incidents/route.ts` (GET list, POST create), `app/api/security/incidents/[id]/route.ts` (GET detail), `app/api/security/incidents/[id]/status/route.ts` (PATCH), `app/api/security/incidents/[id]/evidence/route.ts` (POST)
    - Implement BullMQ scheduled job for incident escalation timer (check every minute for unresolved critical incidents)
    - Register all in DI container
    - _Requirements: 32.1, 32.4, 32.5, 32.8, 32.9, 32.10_

  - [ ]* 34.5 Write property test for incident lifecycle validity
    - **Property 21: Incident Lifecycle Validity**
    - Generate random status transition sequences, verify only valid transitions succeed and invalid ones are rejected
    - **Validates: Requirements 32.2, 32.4**

  - [ ]* 34.6 Write unit tests for incident use cases
    - Test CreateIncidentUseCase: valid incident, notification dispatch
    - Test UpdateIncidentStatusUseCase: valid transitions, invalid transitions rejected
    - Test AutoCreateIncidentUseCase: triggered by critical events
    - Test EscalateIncidentUseCase: escalation timing logic
    - _Requirements: 32.1, 32.2, 32.4, 32.7, 32.8_

- [x] 35. Gate monitoring domain
  - [x] 35.1 Implement gate domain entities and repository interface
    - Create `src/core/domains/gate/entities/` with Gate, GateEvent entities matching design
    - Create `GateRepository` interface: registerGate, findByTenant, updateStatus, createEvent, findEventsByGate (paginated), getGateAnalytics
    - Define error codes: `GATE_SENSOR_OFFLINE`
    - _Requirements: 33.1, 33.2, 33.6, 33.7, 33.8_

  - [x] 35.2 Add Prisma models for Gate and GateEvent
    - Create Gate model with tenant relation, name, location, latitude, longitude, device_id, status enum (open/closed/offline), last_state_change, created_at (snake_case with @map)
    - Create GateEvent model with gate relation, tenant_id, state enum (open/closed), duration (seconds of previous state), timestamp (snake_case with @map)
    - Add indexes: `(tenant_id, status)` on Gate, `(gate_id, timestamp)` on GateEvent, `(tenant_id, timestamp)` on GateEvent
    - Run migration
    - _Requirements: 33.1, 33.2, 33.7_

  - [x] 35.3 Implement gate use cases
    - Create `RegisterGateUseCase`: register gate with IoT device association, validate Ketua_RT/Pengurus role
    - Create `ProcessGateEventUseCase`: record state change, calculate duration of previous state, publish to Realtime Bus, check open duration threshold
    - Create `CheckGateOpenDurationUseCase`: if gate open exceeds configurable threshold (default 2 min), trigger `gate_open_too_long` event, notify Security_Guard
    - Create `GetGateAnalyticsUseCase`: calculate average open duration, open frequency by time of day
    - Detect gate sensor offline (no heartbeat for 60s), mark as offline, notify Security_Guard
    - _Requirements: 33.1, 33.2, 33.3, 33.4, 33.5, 33.6, 33.7, 33.8, 33.9, 33.10_

  - [x] 35.4 Implement gate repository (infrastructure) and route handlers
    - Create `GateRepositoryImpl` using Prisma via TenantScopedRepository
    - Create route handlers: `app/api/security/gates/route.ts` (GET list, POST register), `app/api/security/gates/[id]/route.ts` (GET detail), `app/api/security/gates/[id]/events/route.ts` (GET history), `app/api/security/gates/analytics/route.ts` (GET)
    - Register all in DI container
    - _Requirements: 33.1, 33.6, 33.7, 33.8_

  - [ ]* 35.5 Write property test for gate duration alert correctness
    - **Property 20: Gate Duration Alert Correctness**
    - Generate random gate open durations + thresholds, verify alert triggers exactly when duration exceeds threshold
    - **Validates: Requirements 33.3, 33.4**

  - [ ]* 35.6 Write unit tests for gate use cases
    - Test ProcessGateEventUseCase: state change recording, duration calculation
    - Test CheckGateOpenDurationUseCase: threshold exceeded triggers alert, below threshold no alert
    - Test gate sensor offline detection
    - _Requirements: 33.1, 33.2, 33.3, 33.4, 33.9_


- [x] 36. CCTV monitoring and enhanced patrol management
  - [x] 36.1 Implement CCTV domain entities and repository interface
    - Create `src/core/domains/cctv/entities/` with CctvCamera, CctvSnapshot entities matching design
    - Create `CctvRepository` interface: registerCamera, findByTenant, updateStatus, captureSnapshot, findSnapshotsByCamera, getStorageUsage
    - Define error codes: `CCTV_CAMERA_OFFLINE`, `CCTV_STREAM_UNAVAILABLE`
    - _Requirements: 34.1, 34.3, 34.4, 34.6, 34.8_

  - [x] 36.2 Add Prisma models for CctvCamera and CctvSnapshot
    - Create CctvCamera model with tenant relation, name, rtsp_url (encrypted), location, latitude, longitude, resolution, status enum (online/offline/motion_detected), last_online, created_at (snake_case with @map)
    - Create CctvSnapshot model with camera relation, tenant_id, file_url, trigger_type enum (manual/motion/scheduled), timestamp (snake_case with @map)
    - Add indexes: `(tenant_id, status)` on CctvCamera, `(camera_id, timestamp)` on CctvSnapshot, `(tenant_id, timestamp)` on CctvSnapshot
    - Run migration
    - _Requirements: 34.1, 34.3_

  - [x] 36.3 Implement CCTV use cases
    - Create `RegisterCameraUseCase`: register camera with encrypted RTSP URL (AES-256), validate Ketua_RT/Pengurus/Security_Guard role
    - Create `CaptureSnapshotUseCase`: capture still image from stream, store via FileStorageProtocol, associate with camera
    - Create `ProcessMotionEventUseCase`: on `cctv_motion_detected` event, auto-capture snapshot, notify Security_Guard during alert hours
    - Create `GetCameraStreamUseCase`: decrypt RTSP URL, validate role access (Security_Guard/Pengurus/Ketua_RT only)
    - Detect camera offline (no stream data for 30s), mark as offline, notify Security_Guard
    - _Requirements: 34.1, 34.2, 34.3, 34.4, 34.5, 34.6, 34.8, 34.9, 34.10, 34.11_

  - [x] 36.4 Implement enhanced patrol domain entities and repository interface
    - Create `src/core/domains/patrol/entities/` with PatrolRoute, PatrolSession, PatrolCheckpointVisit entities matching design
    - Create `PatrolRepository` interface: createRoute, findRoutesByTenant, startSession, recordCheckpointVisit, completeSession, getPatrolAnalytics, findActiveSessions
    - Define error codes: `PATROL_ROUTE_NOT_FOUND`, `PATROL_ALREADY_ACTIVE`
    - _Requirements: 35.1, 35.2, 35.3, 35.4, 35.5, 35.7_

  - [x] 36.5 Add Prisma models for PatrolRoute, PatrolSession, PatrolCheckpointVisit
    - Create PatrolRoute model with tenant relation, name, checkpoints (JSON array of lat/lng/label), estimated_duration, created_by, created_at (snake_case with @map)
    - Create PatrolSession model with tenant relation, route_id, guard_id, status enum (active/completed/abandoned), started_at, completed_at, checkpoints_visited, distance_traveled, created_at (snake_case with @map)
    - Create PatrolCheckpointVisit model with session relation, checkpoint_index, latitude, longitude, visited_at (snake_case with @map)
    - Add indexes: `(tenant_id)` on PatrolRoute, `(tenant_id, status)` on PatrolSession, `(guard_id, started_at)` on PatrolSession, `(session_id)` on PatrolCheckpointVisit
    - Run migration
    - _Requirements: 35.1, 35.3, 35.4_

  - [x] 36.6 Implement enhanced patrol use cases
    - Create `CreatePatrolRouteUseCase`: store route with ordered checkpoints, validate Ketua_RT/Pengurus role
    - Create `StartPatrolUseCase`: validate no active session for guard (`PATROL_ALREADY_ACTIVE`), create session, publish to Realtime Bus
    - Create `RecordCheckpointVisitUseCase`: validate GPS proximity (Haversine distance <= 50 meters), record visit, update completion percentage
    - Create `CompletePatrolUseCase`: generate patrol summary (route covered, checkpoints visited, duration, distance), enqueue audit
    - Create `DetectPatrolDeviationUseCase`: if guard > 200m from route for > 5 minutes, send deviation alert to Ketua_RT
    - Create `GetPatrolAnalyticsUseCase`: average duration, checkpoint coverage rate, patrol frequency by time slot
    - _Requirements: 35.1, 35.2, 35.3, 35.4, 35.5, 35.6, 35.7, 35.8, 35.9, 35.10_

  - [x] 36.7 Implement CCTV and patrol repositories (infrastructure) and route handlers
    - Create `CctvRepositoryImpl` and `PatrolRepositoryImpl` using Prisma via TenantScopedRepository
    - Create route handlers for CCTV: `app/api/security/cctv/route.ts` (GET list, POST register), `app/api/security/cctv/[id]/snapshot/route.ts` (POST), `app/api/security/cctv/[id]/stream/route.ts` (GET)
    - Create route handlers for patrol: `app/api/security/patrols/routes/route.ts` (GET list, POST create), `app/api/security/patrols/sessions/route.ts` (GET active, POST start), `app/api/security/patrols/sessions/[id]/checkpoint/route.ts` (POST), `app/api/security/patrols/sessions/[id]/complete/route.ts` (POST), `app/api/security/patrols/analytics/route.ts` (GET)
    - Register all in DI container
    - _Requirements: 34.1, 34.3, 34.9, 35.1, 35.3, 35.4, 35.7, 35.8_

  - [ ]* 36.8 Write property test for patrol checkpoint verification
    - **Property 26: Patrol Checkpoint Verification**
    - Generate random GPS coordinates + checkpoints, verify Haversine distance <= 50m triggers visit, > 50m does not
    - **Validates: Requirements 35.4**

  - [ ]* 36.9 Write property test for CCTV credential encryption
    - **Property 28: CCTV Credential Encryption**
    - Generate random RTSP URLs, verify stored value != plaintext and decrypt roundtrip produces original
    - **Validates: Requirements 34.10, 41.7**

  - [ ]* 36.10 Write unit tests for CCTV and patrol use cases
    - Test RegisterCameraUseCase: valid registration, RTSP URL encrypted
    - Test CaptureSnapshotUseCase: camera online, camera offline rejected
    - Test StartPatrolUseCase: valid start, already active rejected
    - Test RecordCheckpointVisitUseCase: within 50m accepted, beyond 50m rejected
    - Test DetectPatrolDeviationUseCase: deviation alert timing
    - _Requirements: 34.1, 34.3, 34.8, 34.10, 35.1, 35.3, 35.4, 35.6_


- [x] 37. Smart alarm system and automation rule engine
  - [x] 37.1 Implement alarm domain entities and repository interface
    - Create `src/core/domains/alarm/entities/` with AlarmDevice, AlarmEvent entities matching design
    - Create `AlarmRepository` interface: registerDevice, findByTenant, findByZone, activateSiren, deactivateSiren, createEvent, getSchedule
    - Define error codes: `ALARM_DEVICE_UNRESPONSIVE`, `ALARM_ZONE_NOT_FOUND`
    - _Requirements: 36.1, 36.2, 36.4, 36.5, 36.6, 36.9_

  - [x] 37.2 Add Prisma models for AlarmDevice and AlarmEvent
    - Create AlarmDevice model with tenant relation, name, location, device_id, zones (String array), schedule_arm, schedule_disarm, status enum (armed/disarmed/triggered/offline), created_at (snake_case with @map)
    - Create AlarmEvent model with alarm_device relation, tenant_id, trigger_source enum (manual/automation/schedule), trigger_type, duration, activated_at, deactivated_at (snake_case with @map)
    - Add indexes: `(tenant_id, status)` on AlarmDevice, `(alarm_device_id, activated_at)` on AlarmEvent, `(tenant_id, activated_at)` on AlarmEvent
    - Run migration
    - _Requirements: 36.1, 36.4_

  - [x] 37.3 Implement alarm use cases
    - Create `RegisterAlarmDeviceUseCase`: register siren with zones and schedule, validate Ketua_RT/Pengurus role
    - Create `ActivateSirenUseCase`: send activation command via IoTGatewayProtocol, record event, notify Security_Guard and Ketua_RT, auto-deactivate after configured duration (default 60s, max 300s)
    - Create `ActivateZoneSirenUseCase`: activate only sirens in specified zone, validate zone exists
    - Create `DeactivateSirenUseCase`: send deactivation command, record event
    - Create `ProcessAlarmScheduleUseCase`: BullMQ cron job to arm/disarm sirens based on schedule
    - Handle siren unresponsive: if no response within 5s, log `ALARM_DEVICE_UNRESPONSIVE`, notify Security_Guard
    - _Requirements: 36.1, 36.2, 36.3, 36.4, 36.5, 36.6, 36.7, 36.8, 36.9, 36.10_

  - [x] 37.4 Implement automation rule engine domain and protocol
    - Create `src/core/domains/automation/entities/` with AutomationRule, AutomationCondition, AutomationAction, AutomationExecution entities matching design
    - Create `src/core/protocols/AutomationEngineProtocol.ts` interface with: evaluateRule, executeActions, validateRuleDefinition, getActiveRulesForEvent
    - Create `AutomationRepository` interface: createRule, findByTenant, findActiveByEventType, updateRule, enableRule, disableRule, logExecution
    - Define error codes: `AUTOMATION_RULE_INVALID`, `AUTOMATION_RULE_LIMIT_EXCEEDED`, `AUTOMATION_CHAIN_DEPTH_EXCEEDED`
    - _Requirements: 39.1, 39.2, 39.3, 39.4, 39.5, 39.6, 39.11, 39.12_

  - [x] 37.5 Add Prisma models for AutomationRule and AutomationExecution
    - Create AutomationRule model with tenant relation, name, trigger_event_type, conditions (JSON), actions (JSON), enabled, schedule_start, schedule_end, max_chain_depth, execution_count, last_executed_at, created_by, created_at, updated_at (snake_case with @map)
    - Create AutomationExecution model with rule relation, tenant_id, trigger_event (JSON), conditions_evaluated, actions_executed (String array), duration_ms, status enum (success/partial_failure/failure), error, executed_at (snake_case with @map)
    - Add indexes: `(tenant_id, enabled)` on AutomationRule, `(tenant_id, trigger_event_type, enabled)`, `(rule_id, executed_at)` on AutomationExecution, `(tenant_id, executed_at)` on AutomationExecution
    - Run migration
    - _Requirements: 39.1, 39.8_

  - [x] 37.6 Implement automation engine use cases
    - Create `CreateAutomationRuleUseCase`: validate rule definition (valid trigger, conditions, actions), enforce 50 active rules limit per tenant, enqueue audit
    - Create `EvaluateRuleUseCase`: find active rules for event type, filter by schedule window, evaluate conditions, execute actions if all conditions met
    - Create `ExecuteAutomationActionsUseCase`: execute all actions sequentially, continue on individual failure (partial failure), log execution with duration_ms
    - Create `HandleRuleChainingUseCase`: check chain depth counter, halt at depth 5 with `AUTOMATION_CHAIN_DEPTH_EXCEEDED`, pass depth counter through pipeline
    - Create `EnableDisableRuleUseCase`: toggle rule enabled state without deletion
    - Implement condition evaluators: equals, not_equals, greater_than, less_than, time_between, duration_exceeds
    - _Requirements: 39.1, 39.2, 39.3, 39.4, 39.5, 39.6, 39.7, 39.8, 39.9, 39.10, 39.11, 39.12, 39.13_

  - [x] 37.7 Implement alarm and automation repositories (infrastructure) and route handlers
    - Create `AlarmRepositoryImpl` and `AutomationRepositoryImpl` using Prisma via TenantScopedRepository
    - Create `AutomationEngineImpl` implementing `AutomationEngineProtocol`
    - Create route handlers for alarm: `app/api/security/alarms/route.ts` (GET list, POST register), `app/api/security/alarms/[id]/activate/route.ts` (POST), `app/api/security/alarms/[id]/deactivate/route.ts` (POST), `app/api/security/alarms/zones/[zone]/activate/route.ts` (POST)
    - Create route handlers for automation: `app/api/automation/rules/route.ts` (GET list, POST create), `app/api/automation/rules/[id]/route.ts` (GET, PATCH, DELETE), `app/api/automation/rules/[id]/enable/route.ts` (POST), `app/api/automation/rules/[id]/disable/route.ts` (POST), `app/api/automation/executions/route.ts` (GET history)
    - Register all in DI container
    - _Requirements: 36.1, 36.2, 36.6, 39.1, 39.7, 39.8_

  - [ ]* 37.8 Write property test for automation rule validation and chain safety
    - **Property 18: Automation Rule Validation and Chain Safety**
    - Generate random rule definitions (valid/invalid), verify acceptance/rejection + chain depth halt at 5
    - **Validates: Requirements 39.6, 39.12**

  - [ ]* 37.9 Write property test for automation execution completeness
    - **Property 19: Automation Execution Completeness**
    - Generate random action lists with injected failures, verify all N actions attempted regardless of individual failures
    - **Validates: Requirements 39.5, 39.9**

  - [ ]* 37.10 Write property test for alarm zone targeting
    - **Property 25: Alarm Zone Targeting**
    - Generate random zone configs + activation requests, verify correct siren set activated (only sirens in target zone)
    - **Validates: Requirements 36.6**

  - [ ]* 37.11 Write unit tests for alarm and automation use cases
    - Test ActivateSirenUseCase: valid activation, device unresponsive, auto-deactivation
    - Test ActivateZoneSirenUseCase: valid zone, zone not found
    - Test CreateAutomationRuleUseCase: valid rule, invalid rule, limit exceeded
    - Test EvaluateRuleUseCase: conditions met, conditions not met, schedule window check
    - Test HandleRuleChainingUseCase: chain depth limit enforcement
    - _Requirements: 36.2, 36.5, 36.6, 36.9, 39.1, 39.5, 39.6, 39.9, 39.11, 39.12_

- [x] 38. Checkpoint - Run all tests, fix failures, and document unresolved issues in CHECKPOINT_REPORT.md


- [x] 39. SocieT-Home module, Security Center dashboard, and enhanced notifications
  - [x] 39.1 Implement SocieT-Home domain entities and use cases
    - Create `src/core/domains/societHome/entities/` with Home entity matching design
    - Create `HomeRepository` interface: createHome, findByHousehold, findByOwner, getDeviceDashboard
    - Add Prisma model for Home with tenant relation, household_id, owner_id, created_at (snake_case with @map)
    - Add indexes: `(tenant_id, household_id)` on Home, `(owner_id)` on Home
    - Create `GetDeviceDashboardUseCase`: return all paired devices for Home_Owner household with status, battery, last activity
    - Create `ConfigureDeviceAlertsUseCase`: set notification preferences per device (event filters, quiet hours)
    - Create `TransferDeviceOwnershipUseCase`: revoke previous owner access, transfer to new owner
    - Run migration
    - _Requirements: 37.1, 37.2, 37.5, 37.7, 37.8, 37.9, 37.11, 37.12, 41.10_

  - [x] 39.2 Implement Security Center dashboard domain and use cases
    - Create `src/core/domains/securityCenter/entities/` with SecurityDashboardMetrics, NeighborhoodAlert types
    - Create `SecurityCenterRepository` interface: getDashboardMetrics, getIncidentTimeline, getSecurityAnalytics, broadcastAlert
    - Create `GetSecurityDashboardUseCase`: aggregate active incidents, emergency alerts, gate status, CCTV status, patrol status, recent security events (cached 10s in Redis)
    - Create `GetIncidentTimelineUseCase`: return chronological security events within configurable time range (default 24h)
    - Create `BroadcastNeighborhoodAlertUseCase`: validate Ketua_RT/Security_Guard role, create alert with severity, dispatch to all Warga via NotificationQueueProtocol within 5 seconds, publish to Realtime Bus
    - Create `GetSecurityAnalyticsUseCase`: incident count by severity over time, average response time, incidents by category, patrol coverage percentage, device event frequency
    - Restrict access to Ketua_RT, Pengurus, Security_Guard roles
    - _Requirements: 31.1, 31.2, 31.3, 31.4, 31.5, 31.6, 31.7, 31.8, 31.9, 31.10_

  - [x] 39.3 Implement enhanced notification system for security
    - Extend `NotificationQueueProtocol` to support multi-channel dispatch: push, WhatsApp (placeholder), SMS (placeholder), email, dashboard alert, siren activation
    - Create `DispatchMultiChannelNotificationUseCase`: for critical events, dispatch through ALL configured channels simultaneously
    - Create `ProcessNotificationEscalationUseCase`: Tier 1 (Security_Guard, immediate), Tier 2 (Ketua_RT, after 5 min if unacknowledged), Tier 3 (emergency contacts, after 15 min if unacknowledged)
    - Create `AcknowledgeNotificationUseCase`: stop further escalation for the event when any recipient acknowledges
    - Implement notification rate limiting: max 10 non-critical notifications per user per hour
    - Implement delivery status tracking: sent, delivered, read, failed with timestamps
    - Implement channel fallback: if one channel fails, attempt next configured channel
    - Define error code: `NOTIFICATION_CHANNEL_FAILED`
    - _Requirements: 43.1, 43.2, 43.3, 43.4, 43.5, 43.6, 43.7, 43.8, 43.9, 43.10_

  - [x] 39.4 Implement repositories and route handlers for Home, Security Center, and notifications
    - Create `HomeRepositoryImpl`, `SecurityCenterRepositoryImpl` using Prisma via TenantScopedRepository
    - Create route handlers for SocieT-Home: `app/api/home/devices/route.ts` (GET dashboard), `app/api/home/devices/[id]/alerts/route.ts` (PATCH preferences)
    - Create route handlers for Security Center: `app/api/security/dashboard/route.ts` (GET), `app/api/security/timeline/route.ts` (GET), `app/api/security/alerts/broadcast/route.ts` (POST), `app/api/security/analytics/route.ts` (GET)
    - Create route handlers for notifications: `app/api/notifications/[id]/acknowledge/route.ts` (POST)
    - Implement BullMQ scheduled job for escalation timer processing
    - Register all in DI container
    - _Requirements: 31.1, 31.4, 37.2, 37.7, 43.3, 43.4_

  - [ ]* 39.5 Write property test for notification escalation correctness
    - **Property 27: Notification Escalation Correctness**
    - Generate random acknowledgment timings, verify escalation stops on ack and proceeds to next tier on timeout
    - **Validates: Requirements 43.3, 43.4**

  - [ ]* 39.6 Write unit tests for SocieT-Home, Security Center, and notification use cases
    - Test GetDeviceDashboardUseCase: returns devices for owner household only
    - Test GetSecurityDashboardUseCase: aggregates all security metrics
    - Test BroadcastNeighborhoodAlertUseCase: dispatches to all Warga, role validation
    - Test ProcessNotificationEscalationUseCase: tier progression, stop on acknowledgment
    - Test DispatchMultiChannelNotificationUseCase: all channels dispatched, fallback on failure
    - _Requirements: 31.1, 31.4, 31.5, 37.2, 43.2, 43.3, 43.4, 43.7_

- [x] 40. Security maps and GIS
  - [x] 40.1 Implement security map domain and use cases
    - Extend existing `src/core/domains/map/` with security map layer types: IncidentMarker, CctvMarker, PanicAlertMarker, GateMarker, PatrolRouteLayer, GuardPositionMarker
    - Create `GetSecurityMapDataUseCase`: aggregate all security-related map data (incidents, CCTV positions, panic alerts, gates, patrol routes, guard positions) with layer toggle support
    - Create `GetIncidentHeatmapUseCase`: calculate incident density over configurable time period (7/30/90 days)
    - Create `GetGeofenceVisualizationUseCase`: return alarm zones and patrol areas as polygon coordinates
    - Restrict access to Ketua_RT, Pengurus, Security_Guard roles
    - _Requirements: 42.1, 42.2, 42.3, 42.4, 42.5, 42.6, 42.7, 42.8_

  - [x] 40.2 Implement security map route handlers
    - Create route handlers: `app/api/security/map/route.ts` (GET all layers), `app/api/security/map/heatmap/route.ts` (GET), `app/api/security/map/geofences/route.ts` (GET)
    - Integrate with Realtime Bus for live map updates (new incidents, gate status changes, guard positions)
    - Register in DI container
    - _Requirements: 42.1, 42.4, 42.6, 42.7_

  - [ ]* 40.3 Write unit tests for security map use cases
    - Test GetSecurityMapDataUseCase: layer filtering, role access validation
    - Test GetIncidentHeatmapUseCase: density calculation for different time periods
    - _Requirements: 42.1, 42.2, 42.7, 42.8_

- [x] 41. IoT device health and observability
  - [x] 41.1 Implement IoT health monitoring use cases
    - Create `MonitorDeviceHealthUseCase`: track online/offline status, last heartbeat, battery level, signal strength, error count per device
    - Create `EmitBatteryLowEventUseCase`: when battery drops below 20%, emit `battery_low` event, notify Home_Owner
    - Create `GetDeviceHealthDashboardUseCase`: total devices per tenant, online/offline ratio, low battery devices, high error rate devices, last sync timestamp
    - Create `CheckIoTHealthUseCase`: return Tuya Cloud API connectivity, Redis connectivity, WebSocket server status, device synchronization lag
    - _Requirements: 44.1, 44.2, 44.3, 44.4, 44.5_

  - [x] 41.2 Implement IoT observability infrastructure
    - Create OpenTelemetry metrics emitter for: device_online_count, device_offline_count, command_success_rate, command_latency_p95, webhook_processing_latency, token_refresh_count
    - Create Prometheus-compatible metrics endpoint for: tuya_api_requests_total, tuya_api_errors_total, tuya_api_latency_seconds, device_events_processed_total, websocket_connections_active
    - Log all Tuya API interactions with: request_id, endpoint, method, response_status, latency_ms, correlation_id
    - Create route handlers: `app/api/iot/health/route.ts` (GET - no auth required), `app/api/iot/metrics/route.ts` (GET), `app/api/iot/devices/health/route.ts` (GET dashboard)
    - Register all in DI container
    - _Requirements: 44.1, 44.2, 44.5, 44.6, 44.7, 44.8_

  - [ ]* 41.3 Write unit tests for IoT health monitoring
    - Test MonitorDeviceHealthUseCase: online/offline detection, battery threshold
    - Test EmitBatteryLowEventUseCase: below 20% triggers event, above 20% does not
    - Test CheckIoTHealthUseCase: all services healthy, partial failure
    - _Requirements: 44.1, 44.3, 44.5_

- [x] 42. Checkpoint - Run all tests, fix failures, and document unresolved issues in CHECKPOINT_REPORT.md


- [ ] 43. Presentation layer for security and IoT features
  - [x] 43.1 Implement Security Center dashboard UI
    - Create `src/presentation/features/securityCenter/` with screens, components, viewModel
    - Create SecurityCenterScreen with realtime dashboard: active incidents, alerts, gate status, CCTV status, patrol status, recent events
    - Implement WebSocket client hook for realtime updates (subscribe to security_events, incident_updates, gate_events, patrol_events, alarm_events channels)
    - Implement incident timeline component with chronological event display and time range filter
    - Implement neighborhood alert broadcast form (severity selector, message input)
    - Implement security analytics charts (incident trends, response time, category breakdown)
    - Implement prominent visual and audio alert for critical events (panic, smoke, emergency)
    - _Requirements: 31.1, 31.2, 31.3, 31.4, 31.6, 31.8_

  - [x] 43.2 Implement incident management UI
    - Create incident list view with filters (status, severity, category) and map view
    - Create incident detail view with status timeline, evidence attachments, and action buttons
    - Create incident creation form with location picker (map click or GPS)
    - Implement incident status update workflow with notes input
    - _Requirements: 32.1, 32.4, 32.6, 32.9_

  - [x] 43.3 Implement gate, CCTV, and patrol monitoring UI
    - Create gate monitoring panel: realtime status indicators, open duration warnings, event history
    - Create CCTV monitoring panel: camera grid view with status, snapshot capture button, live stream viewer (WebRTC)
    - Create patrol management panel: route map display, active patrol tracking, checkpoint progress, patrol analytics
    - Implement map integration for all security features using Leaflet with layer toggles
    - _Requirements: 33.1, 33.3, 33.5, 34.2, 34.6, 35.2, 35.3, 35.5, 42.1, 42.2_

  - [x] 43.4 Implement SocieT-Home device dashboard UI
    - Create `src/presentation/features/societHome/` with screens, components, viewModel
    - Create device dashboard showing all paired devices with status, battery, last activity
    - Create device pairing flow UI (step-by-step wizard)
    - Create device control panel (send commands, view events)
    - Implement WebSocket client for realtime device events (subscribe to device_events channel, filtered by privacy)
    - Create device alert preferences configuration UI
    - _Requirements: 37.1, 37.2, 37.4, 37.5, 37.7_

  - [x] 43.5 Implement alarm and automation management UI
    - Create alarm device list with status indicators and manual activation buttons
    - Create automation rule builder UI: trigger event selector, condition builder, action selector
    - Create automation execution history view with success/failure status
    - Create alarm zone visualization on map
    - _Requirements: 36.1, 36.2, 36.6, 39.1, 39.7, 39.8_

  - [x] 43.6 Implement security map UI with all layers
    - Extend existing map page with security layers: incidents (color-coded), CCTV positions, panic alerts, gates, patrol routes, guard positions
    - Implement layer toggle controls
    - Implement heatmap view for incident density
    - Implement geofence polygon visualization for alarm zones and patrol areas
    - Implement realtime position updates for patrol guards via WebSocket
    - Implement marker click popups with detailed information
    - _Requirements: 42.1, 42.2, 42.3, 42.4, 42.5, 42.6, 42.7_

  - [ ]* 43.7 Write unit tests for security and IoT ViewModels
    - Test SecurityCenterViewModel: dashboard data loading, realtime event handling
    - Test IncidentViewModel: CRUD operations, status transitions
    - Test DeviceDashboardViewModel: device list, command execution, event subscription
    - Test AutomationRuleViewModel: rule creation, validation, enable/disable
    - _Requirements: 31.1, 32.1, 37.2, 39.1_

- [x] 44. Integration wiring and final validation
  - [x] 44.1 Wire automation engine to realtime event pipeline
    - Connect ProcessWebhookEventUseCase output to AutomationEngine evaluation
    - Connect AutomationEngine actions to: CreateIncidentUseCase, NotificationQueueProtocol, ActivateSirenUseCase, CaptureSnapshotUseCase, BroadcastNeighborhoodAlertUseCase
    - Ensure chain depth counter is properly passed through all automation triggers
    - Verify end-to-end flow: Tuya webhook -> event classification -> automation evaluation -> action execution -> realtime delivery
    - _Requirements: 32.7, 36.3, 39.5, 39.6_

  - [x] 44.2 Wire Security Center realtime updates
    - Connect all security domain events to Security Center WebSocket channels
    - Verify incident creation/update publishes to `incident_updates` channel
    - Verify gate events publish to `gate_events` channel
    - Verify patrol events publish to `patrol_events` channel
    - Verify alarm events publish to `alarm_events` channel
    - Verify CCTV events publish to `cctv_events` channel
    - Verify critical events trigger prominent dashboard alerts
    - _Requirements: 31.2, 31.8, 40.3, 40.4, 40.5, 40.6_

  - [x] 44.3 Register all new dependencies in DI container
    - Update `src/infrastructure/di/registry/repositoryContainer.ts` with all new repository implementations
    - Update `src/infrastructure/di/registry/useCasesContainer.ts` with all new use cases
    - Update `src/infrastructure/di/registry/moduleContainer.ts` with WebSocketProtocol, RealtimeBusProtocol, IoTGatewayProtocol, AutomationEngineProtocol, CircuitBreakerProtocol
    - Verify no circular dependencies in DI graph
    - _Requirements: 31.1, 32.1, 33.1, 34.1, 35.1, 36.1, 37.1, 38.1, 39.1, 40.1, 41.1, 42.1, 43.1, 44.1_

  - [ ]* 44.4 Write integration tests for end-to-end security flows
    - Test: Tuya webhook received -> device event created -> automation rule triggered -> incident created -> notification dispatched -> WebSocket event delivered
    - Test: Gate open too long -> automation triggers siren -> notification escalation -> acknowledgment stops escalation
    - Test: Panic button pressed -> incident auto-created -> Security Center dashboard updated -> multi-channel notification sent
    - _Requirements: 32.7, 33.4, 36.3, 39.5, 40.5, 43.2_

- [x] 45. Final checkpoint - Run all tests, fix failures, and document unresolved issues in CHECKPOINT_REPORT.md


## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints run all tests, fix failures, and document unresolved issues in CHECKPOINT_REPORT.md
- Property tests validate universal correctness properties from the design document using fast-check
- Unit tests validate specific examples and edge cases
- All code follows Clean Architecture: entities and use cases in core, implementations in infrastructure, UI in presentation, thin routing in app
- All dependencies resolved via Awilix DI container following the factory function pattern
- All Prisma models use snake_case for database columns via `@map` and `@@map` directives, with consistent `created_at`, `updated_at`, `deleted_at` timestamps
- All repository implementations MUST use TenantScopedRepository helper to enforce tenant_id filtering
- All API inputs validated with Zod schemas
- All error responses follow the 7-type classification with stable error codes
- All sensitive data (NIK, phone, email) masked per privacy requirements
- All use cases enqueue audit and notification jobs via `AuditQueueProtocol` and `NotificationQueueProtocol` (stubs from Task 1.5, full implementations from Task 15)
- Background jobs (notifications, audit, reminders) processed via BullMQ to keep API responses fast
- Payment gateway integration includes idempotency keys, webhook signature validation, and PaymentReconciliation log
- Backup jobs use `pg_dump`/`pg_restore` with defined storage paths and retention policies
- PWA service worker uses Cache-First for static assets, Network-First for API calls, with documented offline limitations
- Push notification subscriptions stored in PushSubscription table
- WebSocket server runs as separate process for realtime event delivery with Redis pub/sub for horizontal scaling
- IoT integration uses Tuya Cloud API with OAuth 2.0, circuit breaker pattern, and HMAC-SHA256 webhook validation
- Automation engine supports rule chaining with max depth of 5 to prevent infinite loops
- All CCTV credentials and IoT API secrets encrypted at rest using AES-256
- Notification escalation uses tiered approach: Security_Guard (immediate), Ketua_RT (5 min), emergency contacts (15 min)
- Device events classified as Shared_Security_Event or Private_Home_Event for privacy enforcement
