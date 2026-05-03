/**
 * AdministrationRepository — Core repository interface for administrative
 * letter request operations.
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure layer provides the concrete implementation.
 *
 * @see Requirements 13.1, 13.2, 13.3, 13.4, 13.5
 */

import type { DomainResult } from '@core/utils';
import type {
  LetterRequest,
  SubmitLetterRequestInput,
  ApproveLetterRequestInput,
  RejectLetterRequestInput,
} from '../entities';

// ---------------------------------------------------------------------------
// Paginated result type
// ---------------------------------------------------------------------------

export interface PaginatedLetterRequests {
  readonly data: readonly LetterRequest[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface AdministrationRepository {
  /** Create a new letter request within a tenant. */
  createRequest(
    tenantId: string,
    userId: string,
    data: SubmitLetterRequestInput,
  ): Promise<DomainResult<LetterRequest>>;

  /** Approve a letter request and attach the generated document URL. */
  approve(
    tenantId: string,
    requestId: string,
    decidedBy: string,
    data: ApproveLetterRequestInput,
  ): Promise<DomainResult<LetterRequest>>;

  /** Reject a letter request with a reason. */
  reject(
    tenantId: string,
    requestId: string,
    decidedBy: string,
    data: RejectLetterRequestInput,
  ): Promise<DomainResult<LetterRequest>>;

  /** Find all letter requests within a tenant (paginated). */
  findByTenant(
    tenantId: string,
    page: number,
    pageSize: number,
  ): Promise<DomainResult<PaginatedLetterRequests>>;

  /** Find all letter requests for a specific user within a tenant. */
  findByUser(
    tenantId: string,
    userId: string,
  ): Promise<DomainResult<LetterRequest[]>>;
}
