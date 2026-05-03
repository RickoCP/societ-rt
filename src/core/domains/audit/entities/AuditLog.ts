/**
 * AuditLog — Domain entity representing an append-only audit trail entry.
 *
 * Audit logs record all significant actions within a tenant for compliance,
 * debugging, and security monitoring.
 *
 * @see Requirements 18.2, 18.5, 18.6
 */

export interface AuditLog {
  readonly id: string;
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly actionType: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly details: Record<string, unknown>;
  readonly ipAddress: string | null;
  readonly impersonatorId: string | null;
  readonly timestamp: Date;
}

export interface CreateAuditLogInput {
  readonly actorUserId: string;
  readonly actionType: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly details: Record<string, unknown>;
  readonly ipAddress?: string;
  readonly impersonatorId?: string;
}
