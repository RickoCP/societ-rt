/**
 * Permission — Core permission types and constants for the authorization system.
 *
 * Permissions follow the pattern `{domain}:{action}` and are immutable typed
 * constants. All permissions must be explicitly defined here — no dynamic
 * permission creation at runtime.
 *
 * DESIGN PRINCIPLES:
 * - Permission format: `{domain}:{action}`
 * - All permissions are typed constants (not strings)
 * - No dynamic permission creation
 * - Unknown permissions fail closed
 *
 * @see Requirements 2.1, 2.6, 2.7
 * @see Design Components and Interfaces > 8. Permission Registry
 */

// ---------------------------------------------------------------------------
// Permission Domains — categorize permissions by resource type
// ---------------------------------------------------------------------------

/**
 * Permission domains represent the resource types in the system.
 * Each domain groups related permissions together.
 */
export type PermissionDomain =
  // Platform-level domains (PLATFORM_ADMIN only)
  | 'platform'
  // Tenant-level domains
  | 'tenant'
  | 'membership'
  | 'orgunit'
  // Resource domains
  | 'resident'
  | 'household'
  | 'finance'
  | 'announcement'
  | 'vote'
  // Operations domains
  | 'emergency'
  | 'iot'
  | 'patrol'
  | 'incident'
  // Administration domain (tenant administrative tasks, e.g. letter requests)
  | 'admin'
  // Security domains
  | 'audit'
  | 'security'
  // Privacy/GDPR domains
  | 'privacy';

// ---------------------------------------------------------------------------
// Permission Actions — standard CRUD + domain-specific actions
// ---------------------------------------------------------------------------

/**
 * Permission actions define what can be done with a resource.
 * Standard actions (read, write, delete) plus domain-specific ones.
 */
export type PermissionAction =
  // Standard CRUD
  | 'read'
  | 'write'
  | 'delete'
  // Domain-specific actions
  | 'create'
  | 'manage'
  | 'publish'
  | 'cast'
  | 'command'
  | 'trigger'
  | 'delegate'
  | 'provision'
  | 'suspend'
  | 'terminate'
  | 'review'
  | 'remediate'
  | 'report';

// ---------------------------------------------------------------------------
// Permission Interface
// ---------------------------------------------------------------------------

/**
 * Permission definition with domain and action.
 * All permissions are readonly and immutable.
 */
export interface Permission {
  /** Permission domain (resource type) */
  readonly domain: PermissionDomain;
  /** Permission action (what can be done) */
  readonly action: PermissionAction;
  /** Full permission code in format `{domain}:{action}` */
  readonly code: string;
  /** Human-readable description (for documentation/audit) */
  readonly description: string;
}

// ---------------------------------------------------------------------------
// Permission Factory Helper
// ---------------------------------------------------------------------------

/**
 * Creates a Permission object with validation.
 * This is only used during module initialization.
 */
export function createPermission(
  domain: PermissionDomain,
  action: PermissionAction,
  description: string,
): Permission {
  const code = `${domain}:${action}`;
  return Object.freeze({
    domain,
    action,
    code,
    description,
  });
}

// ---------------------------------------------------------------------------
// All Permissions — Explicitly defined, no inheritance
// ---------------------------------------------------------------------------

/**
 * All permissions in the system, defined as explicit typed constants.
 *
 * CRITICAL: This is the single source of truth for all permissions.
 * If a permission is not defined here, it does not exist.
 *
 * Organized by domain for maintainability.
 */
export const PERMISSIONS = Object.freeze({
  // =========================================================================
  // PLATFORM PERMISSIONS — PLATFORM_ADMIN only
  // =========================================================================

  /** Read platform configuration */
  PLATFORM_CONFIG_READ: createPermission(
    'platform',
    'read',
    'Read platform configuration',
  ),

  /** Modify platform configuration */
  PLATFORM_CONFIG_WRITE: createPermission(
    'platform',
    'write',
    'Modify platform configuration',
  ),

  /** Read platform-wide audit logs */
  PLATFORM_AUDIT_READ: createPermission(
    'audit',
    'read',
    'Read platform-wide audit logs',
  ),

  /** Create new tenants */
  PLATFORM_TENANT_PROVISION: createPermission(
    'platform',
    'provision',
    'Create new tenants',
  ),

  /** Suspend tenant operations */
  PLATFORM_TENANT_SUSPEND: createPermission(
    'platform',
    'suspend',
    'Suspend tenant operations',
  ),

  /** Initiate tenant termination */
  PLATFORM_TENANT_TERMINATE: createPermission(
    'platform',
    'terminate',
    'Initiate tenant termination',
  ),

  /** Manage subscription plans */
  PLATFORM_SUBSCRIPTION_MANAGE: createPermission(
    'platform',
    'manage',
    'Manage subscription plans',
  ),

  /** Review quarantined anomalies */
  PLATFORM_ANOMALY_REVIEW: createPermission(
    'platform',
    'review',
    'Review quarantined anomalies',
  ),

  /** Remediate anomalies (with approval workflow) */
  PLATFORM_ANOMALY_REMEDIATE: createPermission(
    'platform',
    'remediate',
    'Remediate anomalies with approval workflow',
  ),

  // =========================================================================
  // TENANT PERMISSIONS — Tenant management
  // =========================================================================

  /** Manage tenant settings and configuration */
  TENANT_MANAGE: createPermission(
    'tenant',
    'manage',
    'Manage tenant settings and configuration',
  ),

  // =========================================================================
  // MEMBERSHIP PERMISSIONS — User and role management
  // =========================================================================

  /** Delegate (assign) roles to other users within scope */
  MEMBERSHIP_DELEGATE: createPermission(
    'membership',
    'delegate',
    'Delegate roles to other users within scope',
  ),

  /** Read membership information */
  MEMBERSHIP_READ: createPermission(
    'membership',
    'read',
    'Read membership information',
  ),

  // =========================================================================
  // ORGUNIT PERMISSIONS — Organizational structure
  // =========================================================================

  /** Manage organizational units */
  ORGUNIT_MANAGE: createPermission(
    'orgunit',
    'manage',
    'Manage organizational units',
  ),

  /** Read organizational structure */
  ORGUNIT_READ: createPermission(
    'orgunit',
    'read',
    'Read organizational structure',
  ),

  // =========================================================================
  // RESIDENT PERMISSIONS — Resident data management
  // =========================================================================

  /** Read resident data */
  RESIDENT_READ: createPermission(
    'resident',
    'read',
    'Read resident data',
  ),

  /** Write resident data */
  RESIDENT_WRITE: createPermission(
    'resident',
    'write',
    'Write resident data',
  ),

  // =========================================================================
  // HOUSEHOLD PERMISSIONS — Household management
  // =========================================================================

  /** Manage households */
  HOUSEHOLD_MANAGE: createPermission(
    'household',
    'manage',
    'Manage household data',
  ),

  /** Read household data */
  HOUSEHOLD_READ: createPermission(
    'household',
    'read',
    'Read household data',
  ),

  // =========================================================================
  // FINANCE PERMISSIONS — Financial operations
  // =========================================================================

  /** Read financial data */
  FINANCE_READ: createPermission(
    'finance',
    'read',
    'Read financial data',
  ),

  /** Write financial data (create transactions, etc.) */
  FINANCE_WRITE: createPermission(
    'finance',
    'write',
    'Write financial data',
  ),

  // =========================================================================
  // ANNOUNCEMENT PERMISSIONS — Communication
  // =========================================================================

  /** Read announcements */
  ANNOUNCEMENT_READ: createPermission(
    'announcement',
    'read',
    'Read announcements',
  ),

  /** Publish announcements */
  ANNOUNCEMENT_PUBLISH: createPermission(
    'announcement',
    'publish',
    'Publish announcements',
  ),

  // =========================================================================
  // VOTING PERMISSIONS — Voting system
  // =========================================================================

  /** Cast vote */
  VOTE_CAST: createPermission(
    'vote',
    'cast',
    'Cast vote in polls',
  ),

  /** Manage voting (create polls, view results) */
  VOTE_MANAGE: createPermission(
    'vote',
    'manage',
    'Manage voting polls',
  ),

  // =========================================================================
  // EMERGENCY PERMISSIONS — Safety-critical operations
  // =========================================================================

  /** Create emergency alerts (panic button) */
  EMERGENCY_CREATE: createPermission(
    'emergency',
    'create',
    'Create emergency alerts (panic button)',
  ),

  /** Read emergency alerts and status */
  EMERGENCY_READ: createPermission(
    'emergency',
    'read',
    'Read emergency alerts and status',
  ),

  /** Manage emergency responses */
  EMERGENCY_MANAGE: createPermission(
    'emergency',
    'manage',
    'Manage emergency responses',
  ),

  // =========================================================================
  // IOT PERMISSIONS — Device management
  // =========================================================================

  /** Send commands to IoT devices */
  IOT_COMMAND: createPermission(
    'iot',
    'command',
    'Send commands to IoT devices',
  ),

  /** Read IoT device status */
  IOT_READ: createPermission(
    'iot',
    'read',
    'Read IoT device status',
  ),

  /** Manage IoT device configuration */
  IOT_MANAGE: createPermission(
    'iot',
    'manage',
    'Manage IoT device configuration',
  ),

  // =========================================================================
  // PATROL PERMISSIONS — Security patrol
  // =========================================================================

  /** Manage patrol schedules and routes */
  PATROL_MANAGE: createPermission(
    'patrol',
    'manage',
    'Manage patrol schedules and routes',
  ),

  /** Read patrol information */
  PATROL_READ: createPermission(
    'patrol',
    'read',
    'Read patrol information',
  ),

  // =========================================================================
  // INCIDENT PERMISSIONS — Incident reporting
  // =========================================================================

  /** Report incidents */
  INCIDENT_REPORT: createPermission(
    'incident',
    'report',
    'Report incidents',
  ),

  /** Manage incidents */
  INCIDENT_MANAGE: createPermission(
    'incident',
    'manage',
    'Manage incidents',
  ),

  // =========================================================================
  // ADMINISTRATION PERMISSIONS — Tenant administrative tasks (letter requests)
  // =========================================================================

  /** Read administrative resources (e.g. list letter requests) */
  ADMIN_READ: createPermission(
    'admin',
    'read',
    'Read administrative resources such as letter requests',
  ),

  /** Create/submit administrative resources (e.g. submit a letter request) */
  ADMIN_WRITE: createPermission(
    'admin',
    'write',
    'Create administrative resources such as letter requests',
  ),

  /** Manage administrative workflows (e.g. approve/reject letter requests) */
  ADMIN_MANAGE: createPermission(
    'admin',
    'manage',
    'Manage administrative workflows such as approving or rejecting letter requests',
  ),

  // =========================================================================
  // SECURITY PERMISSIONS — Security monitoring
  // =========================================================================

  /** Read security information */
  SECURITY_READ: createPermission(
    'security',
    'read',
    'Read security information',
  ),

  /** Manage security settings */
  SECURITY_MANAGE: createPermission(
    'security',
    'manage',
    'Manage security settings',
  ),

  // =========================================================================
  // PRIVACY PERMISSIONS — GDPR/Privacy compliance
  // =========================================================================

  /** Read privacy data (own data export) */
  PRIVACY_READ: createPermission(
    'privacy',
    'read',
    'Read privacy data and export own personal data',
  ),

  /** Manage privacy settings (consent, deletion requests) */
  PRIVACY_MANAGE: createPermission(
    'privacy',
    'manage',
    'Manage privacy settings, consent, and deletion requests',
  ),
}) satisfies Record<string, Permission>;

// ---------------------------------------------------------------------------
// Permission Code Lookup Maps
// ---------------------------------------------------------------------------

/**
 * Map from permission code string to Permission object.
 * Used for quick lookup during authorization checks.
 */
export const PERMISSION_BY_CODE: ReadonlyMap<string, Permission> = new Map(
  Object.values(PERMISSIONS).map((p) => [p.code, p]),
);

/**
 * All valid permission codes as a frozen array.
 * Used for validation and enumeration.
 */
export const ALL_PERMISSION_CODES: readonly string[] = Object.freeze(
  Object.values(PERMISSIONS).map((p) => p.code),
);

// ---------------------------------------------------------------------------
// Permission Validation Helpers
// ---------------------------------------------------------------------------

/**
 * Checks if a permission code is valid (exists in the registry).
 */
export function isValidPermissionCode(code: string): boolean {
  return PERMISSION_BY_CODE.has(code);
}

/**
 * Parses a permission code into domain and action parts.
 * Returns null if the code format is invalid.
 */
export function parsePermissionCode(
  code: string,
): { domain: string; action: string } | null {
  const parts = code.split(':');
  if (parts.length !== 2) {
    return null;
  }
  const [domain, action] = parts;
  if (!domain || !action) {
    return null;
  }
  return { domain, action };
}

// ---------------------------------------------------------------------------
// Type helpers for permission codes
// ---------------------------------------------------------------------------

/**
 * Union type of all valid permission codes.
 * Useful for type-safe permission references.
 */
export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]['code'];
