/**
 * ImpersonationSession & TenantHealthMetrics — Operational domain entities.
 *
 * @see Requirements 30.3, 30.4, 30.5
 */

export interface ImpersonationSession {
  readonly id: string;
  readonly impersonatorId: string;
  readonly impersonatedUserId: string;
  readonly tenantId: string;
  readonly token: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly endedAt: Date | null;
}

export interface TenantHealthMetrics {
  readonly activeUsers30d: number;
  readonly storageUsageBytes: number;
  readonly apiRequests30d: number;
  readonly lastActivity: Date | null;
}
