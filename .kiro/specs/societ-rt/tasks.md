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
