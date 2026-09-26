/**
 * MembershipInvitation — Domain entity representing a pending membership invitation.
 *
 * When a member is invited:
 * 1. A Membership record is created with status=INVITED
 * 2. A MembershipInvitation record is created with a secure token
 * 3. The invited user can accept to activate their membership
 * 4. Invitations expire after a configured time (default: 7 days - D7)
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 22, 25
 * @see Design Section D7: Invitation expiry default
 * @see FASE 1.18 Task 53: Membership Invitation Flow
 */

// ---------------------------------------------------------------------------
// Invitation Status Enum
// ---------------------------------------------------------------------------

/**
 * MembershipInvitationStatus — Lifecycle states of an invitation.
 *
 * STATE MACHINE:
 * - PENDING → ACCEPTED (on acceptance)
 * - PENDING → REVOKED (on cancellation by inviter)
 * - PENDING → EXPIRED (when time passes expiresAt)
 *
 * Terminal states: ACCEPTED, REVOKED, EXPIRED
 */
export enum MembershipInvitationStatus {
  /** Invitation is active and awaiting acceptance */
  PENDING = 'PENDING',
  /** Invitation was accepted (membership activated) */
  ACCEPTED = 'ACCEPTED',
  /** Invitation was revoked by an admin */
  REVOKED = 'REVOKED',
  /** Invitation expired before being accepted */
  EXPIRED = 'EXPIRED',
}

/**
 * Check if a status is terminal (cannot transition further).
 */
export function isTerminalInvitationStatus(status: MembershipInvitationStatus): boolean {
  return (
    status === MembershipInvitationStatus.ACCEPTED ||
    status === MembershipInvitationStatus.REVOKED ||
    status === MembershipInvitationStatus.EXPIRED
  );
}

// ---------------------------------------------------------------------------
// Invitation Entity
// ---------------------------------------------------------------------------

/**
 * MembershipInvitation entity — represents a pending invitation to join a tenant.
 *
 * SECURITY CONSIDERATIONS:
 * - token MUST be cryptographically secure (256-bit random)
 * - token MUST be stored hashed (SHA-256) in the database
 * - token MUST be one-time use only
 * - inviter MUST have ACTIVE membership and be authorized per delegation matrix
 * - target OrgUnit MUST be in inviter's scope
 *
 * INVARIANTS:
 * - membershipId references a Membership with status=INVITED
 * - inviterUserId must have valid ACTIVE membership in same tenant
 * - expiresAt must be in the future at creation time
 */
export interface MembershipInvitation {
  /**
   * Unique identifier for this invitation record.
   */
  readonly id: string;

  /**
   * Reference to the pre-created Membership with status=INVITED.
   * This membership will be activated when invitation is accepted.
   */
  readonly membershipId: string;

  /**
   * Reference to the Tenant (for easier querying without joining).
   */
  readonly tenantId: string;

  /**
   * User ID of the person who created the invitation.
   * Used for audit trail and authorization validation.
   */
  readonly inviterUserId: string;

  /**
   * The membership ID of the inviter (for scope/role validation).
   * Cached at invitation time for audit purposes.
   */
  readonly inviterMembershipId: string;

  /**
   * The hashed invitation token (SHA-256).
   * NEVER store the raw token in the database.
   */
  readonly tokenHash: string;

  /**
   * When the invitation expires.
   * Default: 7 days from creation (D7).
   */
  readonly expiresAt: Date;

  /**
   * Current status of the invitation.
   */
  readonly status: MembershipInvitationStatus;

  /**
   * Email address the invitation was sent to (for tracking).
   * Optional — invitation can be created for existing users by userId.
   */
  readonly invitedEmail?: string;

  /**
   * User ID if inviting an existing user (mutually exclusive with invitedEmail).
   */
  readonly invitedUserId?: string;

  /**
   * When the invitation was created.
   */
  readonly createdAt: Date;

  /**
   * When the invitation was last updated.
   */
  readonly updatedAt: Date;

  /**
   * When the invitation was accepted (if status=ACCEPTED).
   */
  readonly acceptedAt?: Date;

  /**
   * When the invitation was revoked (if status=REVOKED).
   */
  readonly revokedAt?: Date;

  /**
   * User ID who revoked the invitation (if revoked).
   */
  readonly revokedBy?: string;
}

// ---------------------------------------------------------------------------
// Input Types
// ---------------------------------------------------------------------------

/**
 * Data required to create a new MembershipInvitation.
 * Omits auto-generated fields (id, timestamps, tokenHash).
 */
export interface CreateInvitationInput {
  /** The pre-created membership with status=INVITED */
  readonly membershipId: string;
  /** The tenant ID */
  readonly tenantId: string;
  /** User ID of the inviter */
  readonly inviterUserId: string;
  /** Membership ID of the inviter */
  readonly inviterMembershipId: string;
  /** The hashed token (caller provides the hash) */
  readonly tokenHash: string;
  /** When the invitation expires */
  readonly expiresAt: Date;
  /** Optional: Email address for the invitation */
  readonly invitedEmail?: string;
  /** Optional: User ID if inviting existing user */
  readonly invitedUserId?: string;
}

/**
 * Data for updating invitation status.
 */
export interface UpdateInvitationInput {
  /** New status */
  readonly status?: MembershipInvitationStatus;
  /** When accepted */
  readonly acceptedAt?: Date;
  /** When revoked */
  readonly revokedAt?: Date;
  /** Who revoked */
  readonly revokedBy?: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Default invitation expiry in milliseconds (7 days per D7).
 */
export const DEFAULT_INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Default invitation expiry in days.
 */
export const DEFAULT_INVITATION_EXPIRY_DAYS = 7;

/**
 * Token length in bytes (256 bits).
 */
export const INVITATION_TOKEN_BYTES = 32;

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Check if an invitation has expired.
 */
export function isInvitationExpired(invitation: MembershipInvitation): boolean {
  return new Date() > invitation.expiresAt;
}

/**
 * Check if an invitation can be accepted.
 * Must be PENDING and not expired.
 */
export function canAcceptInvitation(invitation: MembershipInvitation): boolean {
  return (
    invitation.status === MembershipInvitationStatus.PENDING &&
    !isInvitationExpired(invitation)
  );
}

/**
 * Check if an invitation can be revoked.
 * Must be PENDING (regardless of expiry).
 */
export function canRevokeInvitation(invitation: MembershipInvitation): boolean {
  return invitation.status === MembershipInvitationStatus.PENDING;
}

/**
 * Check if an invitation can be resent.
 * Must be PENDING.
 */
export function canResendInvitation(invitation: MembershipInvitation): boolean {
  return invitation.status === MembershipInvitationStatus.PENDING;
}

/**
 * Calculate the expiry date from now.
 */
export function calculateExpiryDate(expiryMs: number = DEFAULT_INVITATION_EXPIRY_MS): Date {
  return new Date(Date.now() + expiryMs);
}
