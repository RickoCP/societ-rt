# Cutover Flag Rollback Procedure

## Overview

This document provides step-by-step instructions for rolling back cutover flags to revert from new membership-based authorization to legacy authorization. The cutover flag system is implemented in `CutoverFlagResolver.ts` and supports hot-reload—changes take effect immediately on the next request without requiring a server restart.

**Target Rollback Time:** < 5 minutes

**Reference Implementation:**
- `src/infrastructure/cutover/CutoverFlagResolver.ts`
- Requirements 14.1, 14.3

---

## Flag Hierarchy

The cutover flag system follows a strict precedence hierarchy:

```
auth.cutover.enabled (global)
├── auth.cutover.domain.{domain}
│   └── auth.cutover.route.{routeId}
```

**Precedence Rule:** `route-specific > domain-specific > global`

This means:
1. If a route-specific flag is set, it overrides domain and global flags
2. If no route-specific flag exists, domain flag is used
3. If no domain flag exists, global flag is used

---

## Quick Rollback Commands

### Emergency Full Rollback (< 1 minute)

For immediate full rollback of all authorization cutover:

```typescript
// Via API endpoint (if exposed)
POST /api/admin/cutover/rollback
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "operatorId": "admin@societ-rt.com",
  "reason": "Production incident - reverting to legacy auth",
  "correlationId": "incident-2024-xxx"
}
```

```typescript
// Via direct service call
const flagResolver = DI.resolve<ICutoverFlagResolver>('cutoverFlagResolver');

await flagResolver.rollback({
  operatorId: 'admin@societ-rt.com',
  reason: 'Production incident - reverting to legacy auth',
  correlationId: 'incident-2024-xxx'
});
```

---

## Step-by-Step Rollback Procedures

### 1. Disable Global Cutover Flag

**Flag Name:** `auth.cutover.enabled`

**Effect:** Disables new authorization for ALL routes (unless overridden by domain or route-specific flags)

**Time to Effect:** Immediate (next request)

#### Method A: Via Rollback API

```typescript
await flagResolver.rollback({
  flagNames: ['auth.cutover.enabled'],
  operatorId: 'your-operator-id',
  reason: 'Rollback due to [describe issue]',
  correlationId: 'your-correlation-id'
});
```

#### Method B: Via Update Flag API

```typescript
await flagResolver.updateFlag({
  flagName: 'auth.cutover.enabled',
  newValue: false,
  operatorId: 'your-operator-id',
  reason: 'Rollback due to [describe issue]',
  correlationId: 'your-correlation-id',
  skipPrerequisiteCheck: true  // Required for disabling
});
```

#### Method C: Via Environment Variable (if configured)

```bash
# Set environment variable and restart (slower - only if hot-reload not available)
AUTH_CUTOVER_ENABLED=false
```

---

### 2. Disable Domain-Specific Flags

**Flag Pattern:** `auth.cutover.domain.{domain}`

**Examples:**
- `auth.cutover.domain.residents`
- `auth.cutover.domain.finance`
- `auth.cutover.domain.emergency`
- `auth.cutover.domain.billing`

**Effect:** Disables new authorization for all routes in the specified domain

**Time to Effect:** Immediate (next request)

#### Command

```typescript
// Disable single domain
await flagResolver.updateFlag({
  flagName: 'auth.cutover.domain.finance',
  newValue: false,
  operatorId: 'your-operator-id',
  reason: 'Rollback finance domain due to billing discrepancy',
  skipPrerequisiteCheck: true
});

// Disable multiple domains
const domainsToRollback = ['finance', 'billing', 'residents'];

for (const domain of domainsToRollback) {
  await flagResolver.updateFlag({
    flagName: `auth.cutover.domain.${domain}`,
    newValue: false,
    operatorId: 'your-operator-id',
    reason: 'Multi-domain rollback due to authorization issues',
    skipPrerequisiteCheck: true
  });
}
```

#### Available Domains

| Domain | Flag Name | Routes Affected |
|--------|-----------|-----------------|
| admin | `auth.cutover.domain.admin` | `/api/admin/*` |
| administration | `auth.cutover.domain.administration` | `/api/administration/*` |
| announcements | `auth.cutover.domain.announcements` | `/api/announcements/*` |
| audit | `auth.cutover.domain.audit` | `/api/audit/*` |
| automation | `auth.cutover.domain.automation` | `/api/automation/*` |
| billing | `auth.cutover.domain.billing` | `/api/billing/*` |
| dashboard | `auth.cutover.domain.dashboard` | `/api/dashboard/*` |
| door-monitoring | `auth.cutover.domain.door-monitoring` | `/api/door-monitoring/*` |
| door-sensors | `auth.cutover.domain.door-sensors` | `/api/door-sensors/*` |
| emergency | `auth.cutover.domain.emergency` | `/api/emergency/*` |
| emergency-contacts | `auth.cutover.domain.emergency-contacts` | `/api/emergency-contacts/*` |
| events | `auth.cutover.domain.events` | `/api/events/*` |
| feature-flags | `auth.cutover.domain.feature-flags` | `/api/feature-flags/*` |
| files | `auth.cutover.domain.files` | `/api/files/*` |
| finance | `auth.cutover.domain.finance` | `/api/finance/*` |
| home | `auth.cutover.domain.home` | `/api/home/*` |
| iot | `auth.cutover.domain.iot` | `/api/iot/*` |
| map | `auth.cutover.domain.map` | `/api/map/*` |
| notifications | `auth.cutover.domain.notifications` | `/api/notifications/*` |
| packages | `auth.cutover.domain.packages` | `/api/packages/*` |
| privacy | `auth.cutover.domain.privacy` | `/api/privacy/*` |
| residents | `auth.cutover.domain.residents` | `/api/residents/*` |
| security | `auth.cutover.domain.security` | `/api/security/*` |
| tenants | `auth.cutover.domain.tenants` | `/api/tenants/*` |
| visitors | `auth.cutover.domain.visitors` | `/api/visitors/*` |
| voting | `auth.cutover.domain.voting` | `/api/voting/*` |

---

### 3. Disable Route-Specific Flags

**Flag Pattern:** `auth.cutover.route.{routeId}`

**Examples:**
- `auth.cutover.route.residents.list`
- `auth.cutover.route.residents.create`
- `auth.cutover.route.finance.transactions`
- `auth.cutover.route.emergency.panic`

**Effect:** Disables new authorization for the specific route only

**Time to Effect:** Immediate (next request)

#### Command

```typescript
// Disable single route
await flagResolver.updateFlag({
  flagName: 'auth.cutover.route.residents.create',
  newValue: false,
  operatorId: 'your-operator-id',
  reason: 'Rollback residents.create route due to permission mapping error',
  skipPrerequisiteCheck: true
});

// Disable multiple routes
const routesToRollback = [
  'residents.list',
  'residents.create',
  'residents.update',
  'residents.delete'
];

for (const routeId of routesToRollback) {
  await flagResolver.updateFlag({
    flagName: `auth.cutover.route.${routeId}`,
    newValue: false,
    operatorId: 'your-operator-id',
    reason: 'Route-level rollback due to authorization issues',
    skipPrerequisiteCheck: true
  });
}
```

---

## Rollback Verification

After performing rollback, verify the changes have taken effect:

### 1. Check Current Flag State

```typescript
const flagResolver = DI.resolve<ICutoverFlagResolver>('cutoverFlagResolver');
const state = flagResolver.getFlagState();

console.log('Global Enabled:', state.globalEnabled);
console.log('Domain Flags:', Object.fromEntries(state.domainFlags));
console.log('Route Flags:', Object.fromEntries(state.routeFlags));
console.log('Last Updated:', state.lastUpdated);
console.log('Updated By:', state.updatedBy);
```

### 2. Verify Specific Route Behavior

```typescript
// Check if specific route uses new auth
const usesNewAuth = flagResolver.shouldUseNewAuth('residents.list', 'residents');
console.log('residents.list uses new auth:', usesNewAuth); // Should be false after rollback
```

### 3. Check Audit Log

```typescript
// View recent flag changes
const auditLog = flagResolver.getAuditLog(10);

auditLog.forEach(entry => {
  console.log(`[${entry.timestamp.toISOString()}] ${entry.operator}: ${entry.flagName} ${entry.oldValue} -> ${entry.newValue}`);
  console.log(`  Reason: ${entry.reason}`);
});
```

### 4. Health Check via API

```bash
# If health check endpoint includes flag status
curl -X GET https://api.societ-rt.com/api/health/cutover-status \
  -H "Authorization: Bearer <admin_token>"
```

Expected response after rollback:
```json
{
  "globalEnabled": false,
  "status": "legacy_auth_active",
  "lastUpdated": "2024-01-15T10:30:00.000Z"
}
```

---

## Rollback Scenarios

### Scenario A: Full System Rollback

**When to use:** Production-wide authorization failures affecting all users

**Steps:**
1. Execute global rollback command (see Quick Rollback Commands)
2. Verify flag state shows `globalEnabled: false`
3. Test critical endpoints (emergency, login)
4. Monitor error rates for 5 minutes
5. Document incident

**Estimated Time:** < 2 minutes

---

### Scenario B: Domain-Level Rollback

**When to use:** Authorization failures isolated to specific domain (e.g., finance routes failing but others working)

**Steps:**
1. Identify affected domain from error logs
2. Disable domain-specific flag
3. Verify routes in affected domain use legacy auth
4. Verify other domains unaffected
5. Document issue for investigation

**Estimated Time:** < 3 minutes

---

### Scenario C: Single Route Rollback

**When to use:** Single endpoint with permission mapping error

**Steps:**
1. Identify exact route from error correlation ID
2. Disable route-specific flag
3. Verify specific route uses legacy auth
4. Verify related routes unaffected
5. Fix permission mapping
6. Re-enable after fix validation

**Estimated Time:** < 2 minutes

---

## Important Notes

### Hot-Reload Behavior

- **Flag changes take effect immediately** on the next request
- No server restart required
- No deployment needed
- Connection pools are not affected

### Audit Trail

All flag changes are automatically logged with:
- Timestamp
- Operator ID
- Flag name
- Old value → New value
- Reason
- Shadow mode metrics snapshot (if available)
- Correlation ID (if provided)

### Prerequisites Check Skip

When disabling flags (rollback), always include `skipPrerequisiteCheck: true` to bypass the cutover prerequisites validation. Prerequisites are only checked when **enabling** cutover.

### Safety-Critical Routes

Even after rollback, safety-critical routes (`/api/emergency/*`, panic button) will continue to function as they have special handling that works with both legacy and new authorization.

---

## Escalation

If rollback fails or issues persist after rollback:

1. **Contact On-Call Engineering Lead**
2. **Escalate to Security Team** if authorization bypass suspected
3. **Consider application restart** as last resort

---

## Related Documentation

- [RLS Rollback Procedure](./rls-rollback.md) - Database-level RLS policy rollback
- [Rollback Procedure Overview](../rollback-procedure.md) - Complete rollback procedures
- [CutoverFlagResolver Implementation](../../../../src/infrastructure/cutover/CutoverFlagResolver.ts)
