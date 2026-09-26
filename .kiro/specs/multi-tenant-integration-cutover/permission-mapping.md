# Permission Mapping Reference

This document provides a comprehensive reference mapping each API route to its required permissions, grouped by domain. It serves as the authoritative source for understanding the route-to-permission mapping implemented during the Multi-Tenant Integration Cutover.

**Document Version:** 1.0.0  
**Last Updated:** 2024-XX-XX  
**Requirements:** 3.1, 3.2, 3.3, 3.4, 3.7, 17.6  
**Prerequisite:** Routes migrated from `resolveAuthContext()` to `withPermission` wrapper

---

## Classification Legend

| Classification | Description |
|----------------|-------------|
| `public` | No JWT required. Fully public endpoint. Uses `withPublicRoute` wrapper. |
| `auth-only` | Requires valid JWT but no specific permission. Uses `withAuthOnlyRoute` wrapper. |
| `protected` | Requires valid JWT and specific permission(s). Uses `withPermission` wrapper. |
| `protected+allowSuspended` | Safety-critical route. Allows SUSPENDED membership status. |

---

## Auth Domain (Excluded from withPermission)

Authentication routes are excluded from standard permission checks. They use dedicated wrappers for their specific security requirements.

| Method | Route | Permissions | Classification | Rationale |
|--------|-------|-------------|----------------|-----------|
| POST | `/api/auth/login` | N/A | `public` | User authentication - no JWT required |
| POST | `/api/auth/register` | N/A | `public` | User registration via invitation token |
| POST | `/api/auth/logout` | N/A | `auth-only` | Requires valid JWT to invalidate session |
| GET | `/api/auth/me` | N/A | `auth-only` | Returns authenticated user info |
| POST | `/api/auth/invitation` | `membership:delegate` | `protected` | Creates invitation tokens for new members |

**Notes:**
- Login and register use `withPublicRoute` with rate limiting (10 req/min for login, 5 req/min for register)
- Logout and me use `withAuthOnlyRoute` - requires valid JWT but no specific permission
- Invitation requires `membership:delegate` permission via `withMembershipDelegate`

---

## Emergency Domain (Safety-Critical)

Safety-critical routes allow SUSPENDED membership status to ensure residents can always access emergency functionality.

| Method | Route | Permissions | Classification | Rationale |
|--------|-------|-------------|----------------|-----------|
| POST | `/api/emergency` | `emergency:create` | `protected+allowSuspended` | Create emergency alert - SAFETY CRITICAL |
| GET | `/api/emergency` | `emergency:read` | `protected+allowSuspended` | List active emergencies - SAFETY CRITICAL |
| PATCH | `/api/emergency/[id]/status` | `emergency:manage` | `protected` | Update emergency status (admin action) |
| GET | `/api/emergency-contacts` | `emergency:read` | `protected+allowSuspended` | View emergency contacts - SAFETY CRITICAL |
| POST | `/api/emergency-contacts` | `emergency:write` | `protected` | Create emergency contact |
| PUT | `/api/emergency-contacts/[id]` | `emergency:write` | `protected` | Update emergency contact |
| DELETE | `/api/emergency-contacts/[id]` | `emergency:write` | `protected` | Delete emergency contact |

**Notes:**
- Routes with `allowSuspended: true` can be accessed by users with SUSPENDED membership status
- REVOKED membership cannot access any routes, including safety routes
- All safety route access attempts are logged with `membershipSuspended: true` in audit log

---

## Residents Domain

Core resident management functionality.

| Method | Route | Permissions | Classification | Rationale |
|--------|-------|-------------|----------------|-----------|
| GET | `/api/residents` | `resident:read` | `protected` | List residents with filters |
| POST | `/api/residents` | `resident:write` | `protected` | Add new resident |
| PUT | `/api/residents/[id]` | `resident:write` | `protected` | Edit resident data |
| PATCH | `/api/residents/[id]` | `resident:write` | `protected` | Update resident status |
| DELETE | `/api/residents/[id]` | `resident:write` | `protected` | Remove resident |
| POST | `/api/residents/import` | `resident:write` | `protected` | Bulk import residents |
| GET | `/api/residents/export` | `resident:read` | `protected` | Export resident data |
| GET | `/api/residents/households` | `household:read` | `protected` | List households |
| POST | `/api/residents/households` | `household:write` | `protected` | Create household |
| GET | `/api/residents/households/[id]` | `household:read` | `protected` | Get household details |
| PUT | `/api/residents/households/[id]` | `household:write` | `protected` | Update household |
| DELETE | `/api/residents/households/[id]` | `household:write` | `protected` | Delete household |

---

## Finance Domain

Financial transaction and billing management.

| Method | Route | Permissions | Classification | Rationale |
|--------|-------|-------------|----------------|-----------|
| GET | `/api/finance/transactions` | `finance:read` | `protected` | List financial transactions |
| POST | `/api/finance/transactions` | `finance:write` | `protected` | Record new transaction |
| GET | `/api/finance/balance` | `finance:read` | `protected` | Get current balance |
| GET | `/api/finance/summary` | `finance:read` | `protected` | Get financial summary |
| GET | `/api/finance/report` | `finance:read` | `protected` | Get financial report |
| POST | `/api/finance/opening-balance` | `finance:write` | `protected` | Set opening balance |
| GET | `/api/finance/iuran` | `finance:read` | `protected` | List iuran/dues |
| POST | `/api/finance/iuran` | `finance:write` | `protected` | Create iuran record |

---

## Billing Domain

Subscription and invoice management.

| Method | Route | Permissions | Classification | Rationale |
|--------|-------|-------------|----------------|-----------|
| GET | `/api/billing/plans` | `finance:read` | `protected` | List subscription plans |
| GET | `/api/billing/invoices` | `finance:read` | `protected` | List invoices |
| POST | `/api/billing/invoices` | `finance:write` | `protected` | Create invoice |

---

## Security Domain

Guard operations and security monitoring.

| Method | Route | Permissions | Classification | Rationale |
|--------|-------|-------------|----------------|-----------|
| GET | `/api/security/timeline` | `security:read` | `protected` | Security event timeline |
| POST | `/api/security/alarms/[id]/activate` | `security:manage` | `protected` | Activate siren alarm |
| POST | `/api/security/alarms/[id]/deactivate` | `security:manage` | `protected` | Deactivate siren alarm |
| GET | `/api/security/patrols/sessions` | `security:read` | `protected` | List patrol sessions |
| POST | `/api/security/patrols/sessions` | `security:write` | `protected` | Start patrol session |
| POST | `/api/security/patrols/sessions/[id]/complete` | `security:write` | `protected` | Complete patrol session |

---

## Visitors Domain

Visitor access control and logging.

| Method | Route | Permissions | Classification | Rationale |
|--------|-------|-------------|----------------|-----------|
| GET | `/api/visitors` | `security:read` | `protected` | List visitor logs |
| POST | `/api/visitors` | `security:manage` | `protected` | Log visitor entry |
| POST | `/api/visitors/[id]/checkout` | `security:manage` | `protected` | Checkout visitor |
| PATCH | `/api/visitors/[id]/exit` | `security:manage` | `protected` | Record visitor exit |

---

## Packages Domain

Package/delivery logging.

| Method | Route | Permissions | Classification | Rationale |
|--------|-------|-------------|----------------|-----------|
| GET | `/api/packages` | `security:read` | `protected` | List package logs |
| POST | `/api/packages` | `security:manage` | `protected` | Log new package delivery |

---

## Announcements Domain

Community announcements and notifications.

| Method | Route | Permissions | Classification | Rationale |
|--------|-------|-------------|----------------|-----------|
| GET | `/api/announcements` | `announcement:read` | `protected` | List announcements |
| POST | `/api/announcements` | `announcement:publish` | `protected` | Create announcement |
| GET | `/api/notifications` | `announcement:read` | `protected` | List user notifications |

---

## Events Domain

Community events management.

| Method | Route | Permissions | Classification | Rationale |
|--------|-------|-------------|----------------|-----------|
| GET | `/api/events` | `announcement:read` | `protected` | List community events |
| POST | `/api/events` | `announcement:publish` | `protected` | Create community event |
| GET | `/api/events/[id]` | `announcement:read` | `protected` | Get event details |
| POST | `/api/events/[id]/rsvp` | `vote:cast` | `protected` | RSVP to event |

---

## Voting Domain

Community voting and governance.

| Method | Route | Permissions | Classification | Rationale |
|--------|-------|-------------|----------------|-----------|
| GET | `/api/voting` | `vote:cast` | `protected` | List available votes |
| POST | `/api/voting` | `vote:manage` | `protected` | Create new vote |
| GET | `/api/voting/[id]` | `vote:cast` | `protected` | Get vote details |
| PATCH | `/api/voting/[id]` | `vote:manage` | `protected` | Update vote |
| DELETE | `/api/voting/[id]` | `vote:manage` | `protected` | Delete vote |
| POST | `/api/voting/[id]/vote` | `vote:cast` | `protected` | Cast a vote |
| GET | `/api/voting/[id]/tally` | `vote:cast` | `protected` | Get vote tally |

---

## IoT Domain

IoT device management and automation.

| Method | Route | Permissions | Classification | Rationale |
|--------|-------|-------------|----------------|-----------|
| GET | `/api/iot/devices` | `iot:read` | `protected` | List IoT devices |
| POST | `/api/iot/commands` | `iot:write` | `protected` | Send device command |
| GET | `/api/iot/metrics` | `iot:read` | `protected` | Get device metrics |
| POST | `/api/iot/webhook` | N/A | `public` | IoT webhook callback (service-to-service) |

---

## Automation Domain

IoT automation rules.

| Method | Route | Permissions | Classification | Rationale |
|--------|-------|-------------|----------------|-----------|
| GET | `/api/automation/rules` | `iot:read` | `protected` | List automation rules |
| POST | `/api/automation/rules` | `iot:manage` | `protected` | Create automation rule |
| GET | `/api/automation/rules/[id]` | `iot:read` | `protected` | Get rule details |
| PUT | `/api/automation/rules/[id]` | `iot:manage` | `protected` | Update rule |
| DELETE | `/api/automation/rules/[id]` | `iot:manage` | `protected` | Delete rule |
| POST | `/api/automation/rules/[id]/enable` | `iot:manage` | `protected` | Enable rule |
| POST | `/api/automation/rules/[id]/disable` | `iot:manage` | `protected` | Disable rule |
| GET | `/api/automation/executions` | `iot:read` | `protected` | List rule executions |

---

## Door Sensors Domain

Door/window sensor management.

| Method | Route | Permissions | Classification | Rationale |
|--------|-------|-------------|----------------|-----------|
| POST | `/api/door-sensors` | `device:manage` | `protected` | Register new sensor |
| GET | `/api/door-sensors/requests` | `device:read` | `protected` | List sensor requests |
| POST | `/api/door-sensors/requests` | `device:write` | `protected` | Create sensor request |
| GET | `/api/door-sensors/[householdId]/window` | `device:read` | `protected` | Get monitoring window config |
| PUT | `/api/door-sensors/[householdId]/window` | `device:write` | `protected` | Set monitoring window |

---

## Door Monitoring Domain

Security guard door monitoring dashboard.

| Method | Route | Permissions | Classification | Rationale |
|--------|-------|-------------|----------------|-----------|
| GET | `/api/door-monitoring/dashboard` | `security:read` | `protected` | Door monitoring dashboard |

---

## Home Domain

Home dashboard and device overview.

| Method | Route | Permissions | Classification | Rationale |
|--------|-------|-------------|----------------|-----------|
| GET | `/api/home/devices` | `device:read` | `protected` | Device dashboard for household |

---

## Dashboard Domain

Aggregated dashboards.

| Method | Route | Permissions | Classification | Rationale |
|--------|-------|-------------|----------------|-----------|
| GET | `/api/dashboard` | `resident:read` | `protected` | Main dashboard for residents |
| GET | `/api/dashboard/platform` | `platform:read` | `protected` | Platform admin dashboard |

---

## Map Domain

Map visualization.

| Method | Route | Permissions | Classification | Rationale |
|--------|-------|-------------|----------------|-----------|
| GET | `/api/map` | `household:read` | `protected` | Get household map markers |

---

## Files Domain

Document/file management.

| Method | Route | Permissions | Classification | Rationale |
|--------|-------|-------------|----------------|-----------|
| POST | `/api/files/upload` | `resident:write` | `protected` | Upload file |
| GET | `/api/files/[key]` | `resident:read` | `protected` | Download/get file URL |
| DELETE | `/api/files/[key]` | `resident:write` | `protected` | Delete file |

---

## Administration Domain

Administrative letter requests.

| Method | Route | Permissions | Classification | Rationale |
|--------|-------|-------------|----------------|-----------|
| GET | `/api/administration/letters` | `admin:read` | `protected` | List letter requests |
| POST | `/api/administration/letters` | `admin:write` | `protected` | Submit letter request |
| PATCH | `/api/administration/letters/[id]` | `admin:write` | `protected` | Update letter status |

---

## Privacy Domain

GDPR/privacy compliance.

| Method | Route | Permissions | Classification | Rationale |
|--------|-------|-------------|----------------|-----------|
| GET | `/api/privacy/export` | `privacy:read` | `protected` | Export personal data |
| POST | `/api/privacy/consent` | `privacy:manage` | `protected` | Record consent |
| POST | `/api/privacy/delete` | `privacy:manage` | `protected` | Request data deletion |

---

## Audit Domain

Audit log access.

| Method | Route | Permissions | Classification | Rationale |
|--------|-------|-------------|----------------|-----------|
| GET | `/api/audit` | `audit:read` | `protected` | List audit logs |

---

## Feature Flags Domain

Configuration management.

| Method | Route | Permissions | Classification | Rationale |
|--------|-------|-------------|----------------|-----------|
| GET | `/api/feature-flags` | `tenant:manage` | `protected` | List feature flags |
| POST | `/api/feature-flags/override` | `tenant:manage` | `protected` | Override feature flag |

---

## Tenants Domain

Multi-tenant management.

| Method | Route | Permissions | Classification | Rationale |
|--------|-------|-------------|----------------|-----------|
| GET | `/api/tenants` | `platform:provision` | `protected` | List all tenants (platform admin) |
| POST | `/api/tenants` | `platform:provision` | `protected` | Create new tenant |
| GET | `/api/tenants/[id]` | `tenant:manage` | `protected` | Get tenant details |
| PATCH | `/api/tenants/[id]` | `tenant:manage` | `protected` | Update tenant branding |
| POST | `/api/tenants/[id]/suspend` | `platform:suspend` | `protected` | Suspend tenant |
| POST | `/api/tenants/[id]/reactivate` | `platform:suspend` | `protected` | Reactivate tenant |
| PATCH | `/api/tenants/[id]/siren` | `tenant:manage` | `protected` | Update siren config |
| GET | `/api/tenants/siren/export` | `platform:provision` | `protected` | Export siren CSV |
| POST | `/api/tenants/siren/import` | `platform:provision` | `protected` | Import siren CSV |

---

## Admin Domain

Platform administration.

| Method | Route | Permissions | Classification | Rationale |
|--------|-------|-------------|----------------|-----------|
| POST | `/api/admin/impersonate` | `platform:manage` | `protected` | Start impersonation session |

---

## Health Domain (Public)

System health check.

| Method | Route | Permissions | Classification | Rationale |
|--------|-------|-------------|----------------|-----------|
| GET | `/api/health` | N/A | `public` | Health check - no auth required |

---

## Permission Summary by Role

This section summarizes which roles have access to which permission sets. Permissions are derived from `PermissionRegistry.getPermissionsForRole()`.

### PLATFORM_ADMIN
- `platform:*` (provision, suspend, manage, read)
- Full access to all platform-level operations

### TENANT_OWNER
- `tenant:manage`
- `admin:*`, `resident:*`, `household:*`, `finance:*`, `announcement:*`, `vote:*`
- `security:*`, `emergency:*`, `iot:*`, `device:*`, `audit:*`, `privacy:*`
- Full access within tenant scope

### RT_ADMIN / ORG_ADMIN
- `admin:*`, `resident:*`, `household:*`, `finance:*`, `announcement:*`, `vote:*`
- `security:*`, `emergency:*`, `iot:*`, `device:*`
- Administrative access within org unit scope

### SECURITY
- `security:*`, `emergency:*`
- `announcement:read`, `resident:read`, `household:read`
- Security guard operations

### RESIDENT
- `resident:read`, `household:read`
- `announcement:read`, `vote:cast`
- `emergency:create`, `emergency:read`
- `device:read`, `iot:read`
- Basic resident access

---

## Validation Rules

1. **All permissions in this mapping MUST exist in `PermissionRegistry`**
2. **All routes in codebase MUST appear in this mapping**
3. **New route PRs MUST update this document as part of review checklist**
4. **Safety routes MUST have `allowSuspended: true` documented**

---

## Related Documents

- **Requirements:** `.kiro/specs/multi-tenant-integration-cutover/requirements.md`
- **Design:** `.kiro/specs/multi-tenant-integration-cutover/design.md`
- **Tasks:** `.kiro/specs/multi-tenant-integration-cutover/tasks.md`
- **PermissionRegistry:** `src/core/domains/authorization/PermissionRegistry.ts`
- **withPermission:** `src/infrastructure/middleware/authorization/requirePermission.ts`
