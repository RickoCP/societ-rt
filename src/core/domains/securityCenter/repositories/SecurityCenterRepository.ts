/**
 * SecurityCenterRepository — Core repository interface for the Security Center domain.
 *
 * Defines the contract for fetching aggregated security metrics,
 * incident timelines, analytics, and broadcasting neighborhood alerts.
 *
 * Implementation lives in infrastructure layer.
 *
 * @see Requirements 31.1, 31.3, 31.4, 31.6
 */

import type { DomainResult } from '@core/utils';
import type {
  SecurityDashboardMetrics,
  SecurityTimelineEvent,
  SecurityAnalytics,
  NeighborhoodAlert,
  CreateNeighborhoodAlertInput,
} from '../entities';

// ---------------------------------------------------------------------------
// Query input types
// ---------------------------------------------------------------------------

export interface TimelineQuery {
  readonly tenantId: string;
  readonly startTime: Date;
  readonly endTime: Date;
}

export interface AnalyticsQuery {
  readonly tenantId: string;
  readonly startTime: Date;
  readonly endTime: Date;
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface SecurityCenterRepository {
  /** Fetch aggregated dashboard metrics for a tenant. */
  getDashboardMetrics(tenantId: string): Promise<DomainResult<SecurityDashboardMetrics>>;

  /** Fetch chronological security events within a time range. */
  getIncidentTimeline(query: TimelineQuery): Promise<DomainResult<SecurityTimelineEvent[]>>;

  /** Fetch security analytics (incident counts, response times, etc.) within a time range. */
  getSecurityAnalytics(query: AnalyticsQuery): Promise<DomainResult<SecurityAnalytics>>;

  /** Persist a neighborhood alert and return the created entity. */
  broadcastAlert(
    tenantId: string,
    createdBy: string,
    input: CreateNeighborhoodAlertInput,
  ): Promise<DomainResult<NeighborhoodAlert>>;
}
