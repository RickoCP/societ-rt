/**
 * AuditLogEntry — Domain entity for Admin UI Audit Log Viewer display.
 *
 * This entity represents an audit log entry as displayed in the Audit Log Table
 * screen. It includes all fields needed for display, filtering, and export
 * in the Admin UI.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 17.3 (Audit Log Table columns: timestamp, event type, actor, target, details, IP)
 * @see Requirements 17.5 (PLATFORM_ADMIN cross-tenant view with tenant column)
 * @see Design Components > 10. Audit Log > AuditLogEntry interface
 */

import type { AuditEventType } from './AuditEventType';

// ---------------------------------------------------------------------------
// Actor Information
// ---------------------------------------------------------------------------

/**
 * Information about the user who performed the audited action.
 *
 * @see Requirements 17.3 (actor column)
 */
export interface AuditActor {
  /** Unique identifier of the actor user */
  readonly id: string;

  /** Display name of the actor */
  readonly name: string;

  /** Email address of the actor */
  readonly email: string;

  /** Whether this actor was impersonating another user */
  readonly isImpersonating?: boolean;

  /** If impersonating, the original PLATFORM_ADMIN's ID */
  readonly impersonatorId?: string;

  /** If impersonating, the original PLATFORM_ADMIN's name */
  readonly impersonatorName?: string;
}

// ---------------------------------------------------------------------------
// Resource Information
// ---------------------------------------------------------------------------

/**
 * Information about the resource that was the target of the audited action.
 *
 * @see Requirements 17.3 (target resource column)
 * @see Requirements 17.8 (Resource type/ID filters)
 */
export interface AuditResource {
  /**
   * Type of the resource.
   * Corresponds to domain entities: Membership, OrgUnit, Tenant, User, etc.
   *
   * @see Requirements 17.8 (Resource type filter)
   */
  readonly type: AuditResourceType;

  /** Unique identifier of the resource */
  readonly id: string;

  /** Human-readable name/label for the resource */
  readonly name: string;
}

/**
 * Types of resources that can be audit targets.
 */
export type AuditResourceType =
  | 'Membership'
  | 'OrgUnit'
  | 'Tenant'
  | 'User'
  | 'Subscription'
  | 'BillingEntry'
  | 'Device'
  | 'Emergency'
  | 'AuditLog';

/**
 * All valid audit resource types.
 */
export const ALL_AUDIT_RESOURCE_TYPES: readonly AuditResourceType[] = [
  'Membership',
  'OrgUnit',
  'Tenant',
  'User',
  'Subscription',
  'BillingEntry',
  'Device',
  'Emergency',
  'AuditLog',
] as const;

// ---------------------------------------------------------------------------
// Main Entity
// ---------------------------------------------------------------------------

/**
 * AuditLogEntry entity — individual audit log record for Admin UI.
 *
 * Each entry represents a significant action that occurred within the system
 * and is displayed in the Audit Log Viewer.
 *
 * INVARIANTS:
 * - Entry ID is unique across the platform
 * - Timestamp is in UTC
 * - Details JSON does not contain sensitive data (redacted server-side)
 * - tenantId is only visible for PLATFORM_ADMIN viewing cross-tenant logs
 *
 * SECURITY CONSIDERATIONS:
 * - Details field is sanitized server-side (no secrets, tokens, passwords)
 * - IP address may be partially masked based on privacy settings
 * - Actor information shows only displayable user info
 *
 * @see Requirements 17.1-17.13 (Audit Log Viewer)
 * @see Design > AuditLogViewModel > AuditLogEntry interface
 */
export interface AuditLogEntry {
  /**
   * Unique identifier for this audit log entry.
   */
  readonly id: string;

  /**
   * Timestamp when the action occurred (UTC).
   *
   * @see Requirements 17.3 (timestamp column)
   */
  readonly timestamp: Date;

  /**
   * Type of event that was audited.
   *
   * @see Requirements 17.3 (event type column)
   * @see Requirements 17.8 (event type filter)
   */
  readonly eventType: AuditEventType;

  /**
   * The user who performed the action.
   *
   * @see Requirements 17.3 (actor column)
   * @see Requirements 17.8 (actor search filter)
   */
  readonly actor: AuditActor;

  /**
   * The resource that was the target of the action.
   *
   * @see Requirements 17.3 (target resource column)
   * @see Requirements 17.8 (resource type/ID filters)
   */
  readonly resource: AuditResource;

  /**
   * Additional details about the action (JSON).
   *
   * Content varies by event type. May include:
   * - Previous/new values for updates
   * - Reason for suspensions/revocations
   * - Bulk operation counts
   * - Error details (sanitized)
   *
   * SECURITY: Sensitive data is redacted server-side.
   *
   * @see Requirements 17.3 (details column)
   * @see Requirements 17.12 (row expansion for full details)
   */
  readonly details: Record<string, unknown>;

  /**
   * IP address from which the action was performed.
   * May be partially masked based on privacy settings.
   *
   * @see Requirements 17.3 (IP address column)
   */
  readonly ipAddress: string;

  /**
   * Tenant ID this entry belongs to.
   *
   * Only populated/visible when PLATFORM_ADMIN is viewing cross-tenant logs.
   * For tenant-scoped admins, this field is omitted or set to their own tenant.
   *
   * @see Requirements 17.5 (PLATFORM_ADMIN cross-tenant view)
   */
  readonly tenantId?: string;

  /**
   * Tenant name for display in cross-tenant view.
   * Only populated for PLATFORM_ADMIN.
   */
  readonly tenantName?: string;

  /**
   * Correlation ID for tracing related actions.
   * Useful for debugging bulk operations or multi-step flows.
   */
  readonly correlationId?: string;

  /**
   * Session ID when the action occurred.
   * Useful for security analysis.
   */
  readonly sessionId?: string;

  /**
   * User agent string from the request.
   * Useful for identifying device/browser.
   */
  readonly userAgent?: string;
}

// ---------------------------------------------------------------------------
// Query Result Types
// ---------------------------------------------------------------------------

/**
 * Paginated result for audit log queries.
 *
 * @see Requirements 17.10 (pagination support)
 */
export interface PaginatedAuditLogEntries {
  /** List of audit log entries for the current page */
  readonly entries: readonly AuditLogEntry[];

  /** Total count of entries matching the query */
  readonly totalCount: number;

  /** Current page number (1-indexed) */
  readonly page: number;

  /** Page size */
  readonly pageSize: number;

  /** Total number of pages */
  readonly totalPages: number;

  /** Whether there are more pages */
  readonly hasNextPage: boolean;

  /** Whether there are previous pages */
  readonly hasPreviousPage: boolean;
}

// ---------------------------------------------------------------------------
// Export Types
// ---------------------------------------------------------------------------

/**
 * Export format options.
 *
 * @see Requirements 18.3 (Format selection: CSV, JSON)
 */
export type AuditExportFormat = 'csv' | 'json';

/**
 * Export request parameters.
 *
 * @see Requirements 18.1-18.10 (Audit Log Export)
 */
export interface AuditExportRequest {
  /** Export format */
  readonly format: AuditExportFormat;

  /** Date range start */
  readonly dateFrom: Date;

  /** Date range end */
  readonly dateTo: Date;

  /** Event types to include (empty = all) */
  readonly eventTypes?: readonly AuditEventType[];

  /** Actor search filter */
  readonly actorSearch?: string;

  /** Resource type filter */
  readonly resourceType?: AuditResourceType;

  /** Maximum rows to export */
  readonly maxRows?: number;
}

/**
 * Export result.
 */
export interface AuditExportResult {
  /** Download URL for the exported file */
  readonly downloadUrl: string;

  /** Generated filename */
  readonly filename: string;

  /** Number of rows exported */
  readonly rowCount: number;

  /** Whether export was truncated due to row limit */
  readonly wasTruncated: boolean;

  /** Export file size in bytes */
  readonly sizeBytes: number;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Default page size for audit log queries.
 */
export const DEFAULT_AUDIT_PAGE_SIZE = 25;

/**
 * Maximum rows per export.
 *
 * @see Requirements 18.3 (limit 10,000 rows per export)
 */
export const MAX_AUDIT_EXPORT_ROWS = 10_000;

/**
 * Generate export filename following the pattern from requirements.
 *
 * @see Requirements 18.7 (filename pattern: audit-export-{tenant}-{from-date}-{to-date}.{format})
 */
export function generateAuditExportFilename(
  tenantSlug: string,
  dateFrom: Date,
  dateTo: Date,
  format: AuditExportFormat,
): string {
  const formatDate = (d: Date) => d.toISOString().split('T')[0];
  return `audit-export-${tenantSlug}-${formatDate(dateFrom)}-${formatDate(dateTo)}.${format}`;
}

/**
 * Get i18n key for resource type label.
 */
export function getResourceTypeI18nKey(resourceType: AuditResourceType): string {
  return `audit.resource_type.${resourceType.toLowerCase()}`;
}

/**
 * Format timestamp for display according to locale.
 */
export function formatAuditTimestamp(timestamp: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(timestamp);
}

/**
 * Check if details should be expanded for an entry.
 * Returns true if details contain more than basic info.
 */
export function hasExpandableDetails(entry: AuditLogEntry): boolean {
  const detailKeys = Object.keys(entry.details);
  return detailKeys.length > 0;
}


// ---------------------------------------------------------------------------
// Backward Compatibility Aliases
// ---------------------------------------------------------------------------

/**
 * Alias for PaginatedAuditLogEntries for backward compatibility.
 * @deprecated Use PaginatedAuditLogEntries instead.
 */
export type PaginatedAuditLogs = PaginatedAuditLogEntries;

