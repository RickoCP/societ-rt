/**
 * AnnouncementRepository — Core repository interface for announcement
 * operations.
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure layer provides the concrete implementation.
 *
 * @see Requirements 9.1, 9.2, 9.3
 */

import type { DomainResult } from '@core/utils';
import type { PaginatedResult } from '@core/domains/resident/entities';
import type {
  Announcement,
  AnnouncementAttachment,
  AttachmentInput,
  CreateAnnouncementInput,
} from '../entities';

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

export interface AnnouncementFilters {
  readonly category?: Announcement['category'];
  readonly page?: number;
  readonly pageSize?: number;
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface AnnouncementRepository {
  /** Create a new announcement within a tenant. */
  create(
    tenantId: string,
    data: CreateAnnouncementInput,
    createdBy: string,
  ): Promise<DomainResult<Announcement>>;

  /** Find announcements within a tenant with optional filters and pagination. */
  findByTenant(
    tenantId: string,
    filters: AnnouncementFilters,
  ): Promise<DomainResult<PaginatedResult<Announcement>>>;

  /** Add an attachment to an announcement. */
  addAttachment(
    announcementId: string,
    data: AttachmentInput,
  ): Promise<DomainResult<AnnouncementAttachment>>;
}
