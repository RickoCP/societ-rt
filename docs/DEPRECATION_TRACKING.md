# Deprecation Tracking

This document tracks all deprecated symbols in the SocieT-RT codebase as part of the Multi-Tenant Integration Cutover.

**Document Purpose:**
- Track deprecated code with clear removal timelines
- Provide migration guidance for developers
- Document how to suppress warnings during the migration period

**Related Requirements:**
- [Requirement 18: Legacy Code Deprecation Path](../.kiro/specs/multi-tenant-integration-cutover/requirements.md)

---

## Deprecated Symbols

### 1. `resolveAuthContext` Function

| Property | Value |
|----------|-------|
| **Location** | `src/infrastructure/utils/resolveAuthContext.ts` |
| **Type** | Function |
| **Deprecated Since** | Multi-Tenant Integration Cutover Phase |
| **Removal Date** | 30 days after migration completion validation |
| **Replacement** | `withPermission` wrapper with `AuthorizationContext` |

**Description:**
Legacy function that extracts `AuthContext` from request headers. Replaced by the new authorization middleware that resolves full `AuthorizationContext`.

**Migration Path:**
```typescript
// ❌ DEPRECATED - Do not use
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';

export async function GET(request: NextRequest) {
  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ... business logic
}

// ✅ NEW PATTERN - Use this instead
import { withPermission } from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@infrastructure/middleware/authorization';

const handleGet: AuthorizedRouteHandler<ResponseType> = async (
  request,
  authContext,
) => {
  // authContext is guaranteed to be valid with required permissions
  // ... business logic
};

export const GET = withPermission(
  { permissions: ['resource:read'] },
  handleGet,
);
```

---

### 2. `AuthContext` Interface

| Property | Value |
|----------|-------|
| **Location** | `src/core/protocols/AuthContext.ts` |
| **Type** | Interface |
| **Deprecated Since** | Multi-Tenant Integration Cutover Phase |
| **Removal Date** | 30 days after migration completion validation |
| **Replacement** | `AuthorizationContext` from `@infrastructure/middleware/authorization` |

**Description:**
Legacy authorization context interface with limited fields (`userId`, `tenantId`, `role`). Replaced by comprehensive `AuthorizationContext` with full membership and permission support.

**Migration Path:**
```typescript
// ❌ DEPRECATED - Do not use
import { AuthContext } from '@core/protocols';

function myUseCase(authContext: AuthContext) {
  const { userId, tenantId, role } = authContext;
  // Limited context
}

// ✅ NEW PATTERN - Use this instead
import type { AuthorizationContext } from '@infrastructure/middleware/authorization';

function myUseCase(authContext: AuthorizationContext) {
  const { 
    userId, 
    tenantId, 
    membershipId,      // NEW: Direct membership reference
    orgUnitId,         // NEW: Organization unit scoping
    role,              // Now MembershipRole
    permissions,       // NEW: Permission set for checks
    tokenVersion,      // NEW: Token invalidation support
    membership,        // NEW: Full membership entity
  } = authContext;
}
```

---

### 3. `UserRole` Enum

| Property | Value |
|----------|-------|
| **Location** | `src/core/protocols/AuthContext.ts` |
| **Type** | Enum |
| **Deprecated Since** | Multi-Tenant Integration Cutover Phase |
| **Removal Date** | 30 days after migration completion validation |
| **Replacement** | `MembershipRole` from `@infrastructure/middleware/authorization` |

**Description:**
Legacy role enum used in the old authorization system. The new system uses `MembershipRole` with permission-based access control.

**Migration Path:**
```typescript
// ❌ DEPRECATED - Do not use
import { UserRole } from '@core/protocols';

if (authContext.role === UserRole.Ketua_RT) {
  // Role-based check
}

// ✅ NEW PATTERN - Use permission-based checks
import type { AuthorizationContext } from '@infrastructure/middleware/authorization';

// Check permissions instead of roles
if (authContext.permissions.has('resident:write')) {
  // Permission-based check - more flexible and maintainable
}
```

---

## Removal Timeline

| Phase | Date | Action |
|-------|------|--------|
| **Deprecation Markers Added** | Current | All deprecated symbols marked with `@deprecated` JSDoc |
| **Migration Complete** | TBD | All 28+ route directories migrated to `withPermission` |
| **Validation Period** | +7 days | 7-day observation window with 0% mismatch rate |
| **Sign-off** | After validation | Engineering, Security, and QA Lead sign-offs |
| **Removal Eligible** | +30 days after sign-off | Deprecated code flagged for review |
| **Manual Removal** | Manual-gated | Authorized developer approval required |

**Important:** Code removal is **manual-gated** per Requirement 18.7. Automatic removal is NOT permitted.

---

## Suppressing Deprecation Warnings

During the migration period, you may need to temporarily suppress deprecation warnings for files that are in the process of being migrated.

### Option 1: File-Level Suppression (ESLint)

Add at the top of the file:
```typescript
/* eslint-disable @typescript-eslint/no-deprecated */
```

### Option 2: Line-Level Suppression (ESLint)

Suppress for a single line:
```typescript
// eslint-disable-next-line @typescript-eslint/no-deprecated
const authContext = resolveAuthContext(request);
```

### Option 3: Block-Level Suppression (ESLint)

Suppress for a block of code:
```typescript
/* eslint-disable @typescript-eslint/no-deprecated */
const authContext = resolveAuthContext(request);
const role = authContext?.role;
/* eslint-enable @typescript-eslint/no-deprecated */
```

### When to Use Suppression

- ✅ **Allowed:** During active migration of a route handler
- ✅ **Allowed:** In test files that specifically test deprecated behavior
- ✅ **Allowed:** In shadow mode comparison code (intentionally uses both patterns)
- ❌ **Not Allowed:** In new code that should use the new patterns
- ❌ **Not Allowed:** After migration is complete for a route

---

## ESLint Configuration

Deprecation warnings are configured in `eslint.config.mjs`:

```javascript
{
  rules: {
    // Warn when using deprecated APIs, functions, or types
    // This enables IDE and build-time warnings for @deprecated JSDoc markers
    "@typescript-eslint/no-deprecated": "warn",
  },
}
```

This configuration:
- Emits **warnings** (not errors) for deprecated code usage
- Works in both IDE (VS Code) and CI/CD pipeline
- Respects the `@deprecated` JSDoc tag in TypeScript

---

## Verification

### Check for Deprecated Usage

Run ESLint to see all deprecation warnings:
```bash
npm run lint
```

### Check Specific Files

```bash
npx eslint --rule '@typescript-eslint/no-deprecated: warn' src/path/to/file.ts
```

### IDE Integration

VS Code with ESLint extension will show deprecation warnings:
- Deprecated symbols appear with ~~strikethrough~~ decoration
- Hover tooltips show the deprecation message and migration guide

---

## References

- [Multi-Tenant Integration Cutover Requirements](../.kiro/specs/multi-tenant-integration-cutover/requirements.md)
- [Multi-Tenant Integration Cutover Design](../.kiro/specs/multi-tenant-integration-cutover/design.md)
- [Permission Mapping Reference](../.kiro/specs/multi-tenant-integration-cutover/permission-mapping.md)
- [Rollback Procedure](../.kiro/specs/multi-tenant-integration-cutover/rollback-procedure.md)

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| TBD | Initial deprecation markers added | Migration Team |
| TBD | ESLint deprecation rule configured | Migration Team |
| TBD | Deprecation tracking document created | Migration Team |
