/**
 * DashboardRepository — Core interface for dashboard metric aggregation.
 *
 * Infrastructure layer provides the concrete implementation using Prisma
 * aggregation queries.
 *
 * @see Requirements 28.1, 28.2
 */

import type { DomainResult } from '@core/utils';
import type {
  KetuaDashboardMetrics,
  PlatformDashboardMetrics,
} from '../entities';

export interface DashboardRepository {
  getKetuaMetrics(tenantId: string): Promise<DomainResult<KetuaDashboardMetrics>>;
  getPlatformMetrics(): Promise<DomainResult<PlatformDashboardMetrics>>;
}
