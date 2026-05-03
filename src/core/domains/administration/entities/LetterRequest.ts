/**
 * LetterRequest — Domain entity representing an administrative letter
 * request within a tenant.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 13.1, 13.2, 13.3, 13.4, 13.5
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export type LetterType = 'surat_pengantar' | 'domisili' | 'SKTM';

export type LetterRequestStatus = 'pending' | 'approved' | 'rejected';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface LetterRequest {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly letterType: LetterType;
  readonly purpose: string;
  readonly status: LetterRequestStatus;
  readonly rejectionReason: string | null;
  readonly documentUrl: string | null;
  readonly decidedBy: string | null;
  readonly decidedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to submit a new letter request. */
export interface SubmitLetterRequestInput {
  readonly letterType: LetterType;
  readonly purpose: string;
}

/** Data required to approve a letter request. */
export interface ApproveLetterRequestInput {
  readonly documentUrl: string;
}

/** Data required to reject a letter request. */
export interface RejectLetterRequestInput {
  readonly rejectionReason: string;
}
