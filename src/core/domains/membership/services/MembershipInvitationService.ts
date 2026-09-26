/**
 * MembershipInvitationService — Domain service for membership invitation workflow.
 *
 * This service orchestrates the complete invitation lifecycle:
 * - Creating invitations (with delegation validation)
 * - Accepting invitations (activating membership)
 * - Revoking invitations
 * - Resending invitations (with new token/expiry)
 *
 * **SECURITY REQUIREMENTS:**
 * - Inviter MUST have ACTIVE membership
 * - Inviter MUST be authorized per delegation matrix
 * - Target OrgUnit MUST be in inviter's scope
 * - Token MUST be cryptographically secure
 * - Token MUST be one-time use only
 *
 * **INTEGRATION WITH EXISTING SERVICES:**
 * - Uses MembershipLifecycleService.create() with status=INVITED
 * - Uses DelegationMatrixService to validate role assignment
 * - Uses MembershipLifecycleService.activate() for acceptance
 * - Uses OrgUnitHierarchyReader for scope validation
 *
 * @see FASE 1.18 Task 53: Membership Invitation Flow
 * @see Requirements 22 (AC 1-7), 25 (AC 1-9)
 * @see Design D7: Invitation expiry default (7 days)
 */

import { createHash, randomBytes } from 'crypto';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type {
  MembershipInvitation,
  Membership,
  MembershipInvitationStatus,
} from '../entities';
import {
  MembershipInvitationStatus as InvitationStatus,
  isInvitationExpired,
  canAcceptInvitation,
  canRevokeInvitation,
  canResendInvitation,
  calculateExpiryDate,
  INVITATION_TOKEN_BYTES,
  DEFAULT_INVITATION_EXPIRY_MS,
} from '../entities';
import type { MembershipRole, MembershipStatus } from '../types';
import { MembershipStatus as MembershipStatusEnum } from '../types';
import type { IMembershipInvitationRepository } from '../repositories';
import type { IMembershipLifecycleService } from './MembershipLifecycleService';
import type { IDelegationMatrixService } from './DelegationMatrixService';
import type { IOrgUnitHierarchyReader } from '@core/domains/orgunit/services';
import {
  invitationExpired,
  invitationAlreadyAccepted,
  invitationRevoked,
  invitationTokenInvalid,
  inviterNotAuthorized,
  inviterMembershipNotActive,
  inviterOutOfScope,
  invitationNotFound,
  invitationAlreadyExists,
  invitationInvalidState,
  invitationUserMismatch,
  invitationMembershipNotFound,
  invitationMembershipNotInvited,
} from '../errors';

// ---------------------------------------------------------------------------
// Event Types
// ---------------------------------------------------------------------------

/**
 * Invitation lifecycle event types.
 */
export enum InvitationEventType {
  /** Invitation created */
  CREATED = 'INVITATION_CREATED',
  /** Invitation accepted */
  ACCEPTED = 'INVITATION_ACCEPTED',
  /** Invitation revoked */
  REVOKED = 'INVITATION_REVOKED',
  /** Invitation resent (new token) */
  RESENT = 'INVITATION_RESENT',
  /** Invitation expired (batch job) */
  EXPIRED = 'INVITATION_EXPIRED',
}

/**
 * Invitation lifecycle event payload.
 */
export interface InvitationLifecycleEvent {
  /** The type of event */
  readonly type: InvitationEventType;
  /** The invitation ID */
  readonly invitationId: string;
  /** The membership ID */
  readonly membershipId: string;
  /** The tenant ID */
  readonly tenantId: string;
  /** The inviter user ID */
  readonly inviterUserId: string;
  /** The invited user ID (if known) */
  readonly invitedUserId?: string;
  /** The invited email (if applicable) */
  readonly invitedEmail?: string;
  /** The role being assigned */
  readonly role: MembershipRole;
  /** Timestamp of the event */
  readonly timestamp: Date;
  /** User who performed the action (for audit) */
  readonly performedBy?: string;
  /** Additional context */
  readonly reason?: string;
}

/**
 * Event emitter interface for invitation lifecycle events.
 */
export interface IInvitationEventEmitter {
  emit(event: InvitationLifecycleEvent): Promise<void>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * Input for creating an invitation.
 */
export interface CreateInvitationCommand {
  /** User ID of the inviter */
  readonly inviterUserId: string;
  /** Membership ID of the inviter (resolved server-side) */
  readonly inviterMembershipId: string;
  /** The tenant ID */
  readonly tenantId: string;
  /** Email address of the invited user */
  readonly invitedEmail?: string;
  /** User ID if inviting existing user */
  readonly invitedUserId?: string;
  /** The role to assign */
  readonly role: MembershipRole;
  /** The OrgUnit to assign (null for tenant-level) */
  readonly orgUnitId: string | null;
  /** Custom expiry in milliseconds (default: 7 days) */
  readonly expiryMs?: number;
}

/**
 * Input for accepting an invitation.
 */
export interface AcceptInvitationCommand {
  /** The raw invitation token (NOT hashed) */
  readonly token: string;
  /** The user ID accepting the invitation */
  readonly acceptingUserId: string;
}

/**
 * Input for revoking an invitation.
 */
export interface RevokeInvitationCommand {
  /** The invitation ID */
  readonly invitationId: string;
  /** The tenant ID */
  readonly tenantId: string;
  /** The user ID revoking the invitation */
  readonly revokerUserId: string;
  /** Reason for revocation */
  readonly reason?: string;
}

/**
 * Input for resending an invitation.
 */
export interface ResendInvitationCommand {
  /** The invitation ID */
  readonly invitationId: string;
  /** The tenant ID */
  readonly tenantId: string;
  /** The user ID resending */
  readonly resenderUserId: string;
  /** Custom expiry in milliseconds (default: 7 days) */
  readonly expiryMs?: number;
}

/**
 * Result of creating an invitation.
 */
export interface CreateInvitationResult {
  /** The created invitation */
  readonly invitation: MembershipInvitation;
  /** The created membership (with status=INVITED) */
  readonly membership: Membership;
  /** The raw token (for sending to user - only returned once) */
  readonly token: string;
}

/**
 * Result of accepting an invitation.
 */
export interface AcceptInvitationResult {
  /** The updated invitation */
  readonly invitation: MembershipInvitation;
  /** The activated membership */
  readonly membership: Membership;
}

/**
 * Result of revoking an invitation.
 */
export interface RevokeInvitationResult {
  /** The updated invitation */
  readonly invitation: MembershipInvitation;
}

/**
 * Result of resending an invitation.
 */
export interface ResendInvitationResult {
  /** The updated invitation */
  readonly invitation: MembershipInvitation;
  /** The new raw token (for sending to user) */
  readonly token: string;
}

/**
 * MembershipInvitationService interface.
 */
export interface IMembershipInvitationService {
  /**
   * Create a new invitation.
   *
   * Validates:
   * - Inviter has ACTIVE membership
   * - Inviter is authorized to delegate the role
   * - Target OrgUnit is in inviter's scope
   * - No pending invitation exists for the user
   *
   * @param command - The creation command
   * @returns DomainResult with invitation, membership, and token
   */
  createInvitation(
    command: CreateInvitationCommand,
  ): Promise<DomainResult<CreateInvitationResult>>;

  /**
   * Accept an invitation.
   *
   * Validates:
   * - Token is valid
   * - Invitation is PENDING and not expired
   * - Accepting user matches invited user (if specified)
   *
   * @param command - The acceptance command
   * @returns DomainResult with invitation and activated membership
   */
  acceptInvitation(
    command: AcceptInvitationCommand,
  ): Promise<DomainResult<AcceptInvitationResult>>;

  /**
   * Revoke a pending invitation.
   *
   * Validates:
   * - Invitation exists and is PENDING
   *
   * Note: Also revokes the associated INVITED membership.
   *
   * @param command - The revocation command
   * @returns DomainResult with revoked invitation
   */
  revokeInvitation(
    command: RevokeInvitationCommand,
  ): Promise<DomainResult<RevokeInvitationResult>>;

  /**
   * Resend an invitation with a new token and expiry.
   *
   * Validates:
   * - Invitation exists and is PENDING
   *
   * @param command - The resend command
   * @returns DomainResult with updated invitation and new token
   */
  resendInvitation(
    command: ResendInvitationCommand,
  ): Promise<DomainResult<ResendInvitationResult>>;

  /**
   * Mark expired invitations (batch operation).
   *
   * Finds all PENDING invitations past their expiry and marks them EXPIRED.
   * Also revokes the associated INVITED memberships.
   *
   * @param tenantId - Optional: Filter by tenant (null = all tenants)
   * @param batchSize - Maximum number to process (default: 100)
   * @returns Number of invitations marked as expired
   */
  markExpiredInvitations(tenantId?: string, batchSize?: number): Promise<number>;
}

// ---------------------------------------------------------------------------
// Token Utilities
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically secure invitation token.
 * Returns base64url-encoded string (URL-safe).
 */
export function generateInvitationToken(): string {
  const bytes = randomBytes(INVITATION_TOKEN_BYTES);
  return bytes.toString('base64url');
}

/**
 * Hash a token using SHA-256.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a MembershipInvitationService instance.
 *
 * @param dependencies - The service dependencies
 * @returns An implementation of IMembershipInvitationService
 */
export const MembershipInvitationServiceImpl = ({
  membershipInvitationRepository,
  membershipLifecycleService,
  delegationMatrixService,
  orgUnitHierarchyReader,
  invitationEventEmitter,
  membershipWriteRepository,
}: {
  membershipInvitationRepository: IMembershipInvitationRepository;
  membershipLifecycleService: IMembershipLifecycleService;
  delegationMatrixService: IDelegationMatrixService;
  orgUnitHierarchyReader: IOrgUnitHierarchyReader;
  invitationEventEmitter: IInvitationEventEmitter;
  /** Repository to get membership by ID */
  membershipWriteRepository: { findById: (id: string, tenantId: string) => Promise<Membership | null> };
}): IMembershipInvitationService => {
  // -------------------------------------------------------------------------
  // Helper Functions
  // -------------------------------------------------------------------------

  /**
   * Validate inviter's authorization to create the invitation.
   */
  const validateInviterAuthorization = async (
    inviterMembershipId: string,
    inviterUserId: string,
    tenantId: string,
    targetRole: MembershipRole,
    targetOrgUnitId: string | null,
  ): Promise<DomainResult<{ inviterMembership: Membership }>> => {
    // Step 1: Get inviter's membership
    const inviterMembership = await membershipWriteRepository.findById(inviterMembershipId, tenantId);
    if (!inviterMembership) {
      return fail(inviterMembershipNotActive());
    }

    // Step 2: Check inviter's membership is ACTIVE (Req 25 AC 8)
    if (inviterMembership.status !== MembershipStatusEnum.ACTIVE) {
      return fail(inviterMembershipNotActive());
    }

    // Verify inviter user matches
    if (inviterMembership.userId !== inviterUserId) {
      return fail(inviterNotAuthorized());
    }

    // Step 3: Check delegation matrix (Req 25 AC 2)
    const delegationCheck = delegationMatrixService.validateDelegation({
      delegatorRole: inviterMembership.role,
      delegatorStatus: inviterMembership.status,
      targetRole,
    });

    if (!delegationCheck.success) {
      return fail(inviterNotAuthorized());
    }

    if (!delegationCheck.data.allowed) {
      return fail(inviterNotAuthorized());
    }

    // Step 4: Check OrgUnit scope (Req 25 AC 1)
    // Target OrgUnit must be in inviter's scope
    if (targetOrgUnitId !== null) {
      // If inviter has tenant-level membership (null orgUnitId), they can invite anywhere
      if (inviterMembership.orgUnitId !== null) {
        // Inviter has org-scoped membership - check target is within scope
        const scopeResult = await orgUnitHierarchyReader.isDescendantOrEqual(
          targetOrgUnitId,
          inviterMembership.orgUnitId,
          tenantId,
        );

        if (!scopeResult.success) {
          return fail(inviterOutOfScope());
        }

        if (!scopeResult.data) {
          return fail(inviterOutOfScope());
        }
      }
      // If inviterMembership.orgUnitId is null, inviter has tenant-wide scope
    } else {
      // Target is tenant-level - only tenant-level admins can invite tenant-level roles
      if (inviterMembership.orgUnitId !== null) {
        return fail(inviterOutOfScope());
      }
    }

    return ok({ inviterMembership });
  };

  /**
   * Create a lifecycle event.
   */
  const createEvent = (
    type: InvitationEventType,
    invitation: MembershipInvitation,
    role: MembershipRole,
    performedBy?: string,
    reason?: string,
  ): InvitationLifecycleEvent => ({
    type,
    invitationId: invitation.id,
    membershipId: invitation.membershipId,
    tenantId: invitation.tenantId,
    inviterUserId: invitation.inviterUserId,
    invitedUserId: invitation.invitedUserId,
    invitedEmail: invitation.invitedEmail,
    role,
    timestamp: new Date(),
    performedBy,
    reason,
  });

  // -------------------------------------------------------------------------
  // Service Implementation
  // -------------------------------------------------------------------------

  return {
    async createInvitation(
      command: CreateInvitationCommand,
    ): Promise<DomainResult<CreateInvitationResult>> {
      const {
        inviterUserId,
        inviterMembershipId,
        tenantId,
        invitedEmail,
        invitedUserId,
        role,
        orgUnitId,
        expiryMs = DEFAULT_INVITATION_EXPIRY_MS,
      } = command;

      // Step 1: Validate inviter authorization
      const authResult = await validateInviterAuthorization(
        inviterMembershipId,
        inviterUserId,
        tenantId,
        role,
        orgUnitId,
      );

      if (!authResult.success) {
        return authResult as DomainResult<CreateInvitationResult>;
      }

      // Step 2: Check for existing pending invitation
      const existingPending = await membershipInvitationRepository.existsPendingInvitation(
        tenantId,
        invitedEmail,
        invitedUserId,
      );

      if (existingPending) {
        return fail(invitationAlreadyExists());
      }

      // Step 3: Create membership with status=INVITED via MembershipLifecycleService
      const membershipResult = await membershipLifecycleService.create({
        userId: invitedUserId ?? '', // Will be updated on acceptance if email-based
        tenantId,
        orgUnitId,
        role,
        status: MembershipStatusEnum.INVITED,
        performedBy: inviterUserId,
        reason: 'Invitation created',
      });

      if (!membershipResult.success) {
        return membershipResult as DomainResult<CreateInvitationResult>;
      }

      const membership = membershipResult.data.membership;

      // Step 4: Generate secure token
      const token = generateInvitationToken();
      const tokenHash = hashToken(token);

      // Step 5: Calculate expiry
      const expiresAt = calculateExpiryDate(expiryMs);

      // Step 6: Create invitation record
      const invitationResult = await membershipInvitationRepository.create({
        membershipId: membership.id,
        tenantId,
        inviterUserId,
        inviterMembershipId,
        tokenHash,
        expiresAt,
        invitedEmail,
        invitedUserId,
      });

      if (!invitationResult.success) {
        // Rollback: Should revoke the created membership
        await membershipLifecycleService.revoke(
          membership.id,
          tenantId,
          'Invitation creation failed - rollback',
          inviterUserId,
        );
        return invitationResult as DomainResult<CreateInvitationResult>;
      }

      const invitation = invitationResult.data;

      // Step 7: Emit event
      const event = createEvent(
        InvitationEventType.CREATED,
        invitation,
        role,
        inviterUserId,
        'Invitation created',
      );
      await invitationEventEmitter.emit(event);

      return ok({
        invitation,
        membership,
        token, // Return raw token only once
      });
    },

    async acceptInvitation(
      command: AcceptInvitationCommand,
    ): Promise<DomainResult<AcceptInvitationResult>> {
      const { token, acceptingUserId } = command;

      // Step 1: Hash the token and find invitation
      const tokenHash = hashToken(token);
      const invitation = await membershipInvitationRepository.findByTokenHash(tokenHash);

      if (!invitation) {
        return fail(invitationTokenInvalid());
      }

      // Step 2: Check invitation status
      if (invitation.status === InvitationStatus.ACCEPTED) {
        return fail(invitationAlreadyAccepted());
      }

      if (invitation.status === InvitationStatus.REVOKED) {
        return fail(invitationRevoked());
      }

      if (invitation.status === InvitationStatus.EXPIRED) {
        return fail(invitationExpired());
      }

      // Step 3: Check expiry
      if (isInvitationExpired(invitation)) {
        // Mark as expired
        await membershipInvitationRepository.update(invitation.id, invitation.tenantId, {
          status: InvitationStatus.EXPIRED,
        });
        return fail(invitationExpired());
      }

      // Step 4: Check if accepting user matches (if invitedUserId was specified)
      if (invitation.invitedUserId && invitation.invitedUserId !== acceptingUserId) {
        return fail(invitationUserMismatch());
      }

      // Step 5: Get the associated membership
      const membership = await membershipWriteRepository.findById(invitation.membershipId, invitation.tenantId);
      if (!membership) {
        return fail(invitationMembershipNotFound());
      }

      // Step 6: Check membership is in INVITED status
      if (membership.status !== MembershipStatusEnum.INVITED) {
        return fail(invitationMembershipNotInvited());
      }

      // Step 7: Activate the membership via MembershipLifecycleService
      const activateResult = await membershipLifecycleService.activate(
        membership.id,
        invitation.tenantId,
        acceptingUserId,
      );

      if (!activateResult.success) {
        return activateResult as DomainResult<AcceptInvitationResult>;
      }

      const activatedMembership = activateResult.data.membership;

      // Step 8: Update invitation status
      const updateResult = await membershipInvitationRepository.update(invitation.id, invitation.tenantId, {
        status: InvitationStatus.ACCEPTED,
        acceptedAt: new Date(),
      });

      if (!updateResult.success) {
        // The membership is already activated, log the error but don't fail
        // This is a minor inconsistency that can be handled by ops
        console.error('Failed to update invitation status after acceptance:', updateResult.error);
      }

      const updatedInvitation = updateResult.success ? updateResult.data : {
        ...invitation,
        status: InvitationStatus.ACCEPTED,
        acceptedAt: new Date(),
      } as MembershipInvitation;

      // Step 9: Emit event
      const event = createEvent(
        InvitationEventType.ACCEPTED,
        updatedInvitation,
        activatedMembership.role,
        acceptingUserId,
        'Invitation accepted',
      );
      await invitationEventEmitter.emit(event);

      return ok({
        invitation: updatedInvitation,
        membership: activatedMembership,
      });
    },

    async revokeInvitation(
      command: RevokeInvitationCommand,
    ): Promise<DomainResult<RevokeInvitationResult>> {
      const { invitationId, tenantId, revokerUserId, reason } = command;

      // Step 1: Find the invitation
      const invitation = await membershipInvitationRepository.findById(invitationId, tenantId);
      if (!invitation) {
        return fail(invitationNotFound());
      }

      // Step 2: Check if can be revoked
      if (!canRevokeInvitation(invitation)) {
        return fail(
          invitationInvalidState(invitation.status, 'revoke'),
        );
      }

      // Step 3: Revoke the associated membership
      const membership = await membershipWriteRepository.findById(invitation.membershipId, tenantId);
      if (membership && membership.status === MembershipStatusEnum.INVITED) {
        await membershipLifecycleService.revoke(
          membership.id,
          tenantId,
          reason ?? 'Invitation revoked',
          revokerUserId,
        );
      }

      // Step 4: Update invitation status
      const updateResult = await membershipInvitationRepository.update(invitationId, tenantId, {
        status: InvitationStatus.REVOKED,
        revokedAt: new Date(),
        revokedBy: revokerUserId,
      });

      if (!updateResult.success) {
        return updateResult as DomainResult<RevokeInvitationResult>;
      }

      const updatedInvitation = updateResult.data;

      // Step 5: Emit event
      const event = createEvent(
        InvitationEventType.REVOKED,
        updatedInvitation,
        membership?.role ?? ('RESIDENT' as MembershipRole), // Fallback if membership not found
        revokerUserId,
        reason ?? 'Invitation revoked',
      );
      await invitationEventEmitter.emit(event);

      return ok({ invitation: updatedInvitation });
    },

    async resendInvitation(
      command: ResendInvitationCommand,
    ): Promise<DomainResult<ResendInvitationResult>> {
      const { invitationId, tenantId, resenderUserId, expiryMs = DEFAULT_INVITATION_EXPIRY_MS } = command;

      // Step 1: Find the invitation
      const invitation = await membershipInvitationRepository.findById(invitationId, tenantId);
      if (!invitation) {
        return fail(invitationNotFound());
      }

      // Step 2: Check if can be resent
      if (!canResendInvitation(invitation)) {
        return fail(
          invitationInvalidState(invitation.status, 'resend'),
        );
      }

      // Step 3: Generate new token
      const newToken = generateInvitationToken();
      const newTokenHash = hashToken(newToken);

      // Step 4: Calculate new expiry
      const newExpiresAt = calculateExpiryDate(expiryMs);

      // Step 5: Update invitation with new token and expiry
      const updateResult = await membershipInvitationRepository.updateToken(
        invitationId,
        tenantId,
        newTokenHash,
        newExpiresAt,
      );

      if (!updateResult.success) {
        return updateResult as DomainResult<ResendInvitationResult>;
      }

      const updatedInvitation = updateResult.data;

      // Step 6: Get membership for event
      const membership = await membershipWriteRepository.findById(invitation.membershipId, tenantId);

      // Step 7: Emit event
      const event = createEvent(
        InvitationEventType.RESENT,
        updatedInvitation,
        membership?.role ?? ('RESIDENT' as MembershipRole),
        resenderUserId,
        'Invitation resent with new token',
      );
      await invitationEventEmitter.emit(event);

      return ok({
        invitation: updatedInvitation,
        token: newToken, // Return new raw token
      });
    },

    async markExpiredInvitations(tenantId?: string, batchSize: number = 100): Promise<number> {
      // Step 1: Find expired pending invitations
      const expiredInvitations = await membershipInvitationRepository.findExpiredPending(tenantId, batchSize);

      if (expiredInvitations.length === 0) {
        return 0;
      }

      // Step 2: Revoke associated memberships
      for (const invitation of expiredInvitations) {
        const membership = await membershipWriteRepository.findById(invitation.membershipId, invitation.tenantId);
        if (membership && membership.status === MembershipStatusEnum.INVITED) {
          await membershipLifecycleService.revoke(
            membership.id,
            invitation.tenantId,
            'Invitation expired',
            'SYSTEM',
          );
        }
      }

      // Step 3: Bulk update invitation statuses
      const invitationIds = expiredInvitations.map((inv) => inv.id);
      const updatedCount = await membershipInvitationRepository.bulkUpdateStatus(
        invitationIds,
        InvitationStatus.EXPIRED,
      );

      // Step 4: Emit events for each expired invitation
      for (const invitation of expiredInvitations) {
        const membership = await membershipWriteRepository.findById(invitation.membershipId, invitation.tenantId);
        const event = createEvent(
          InvitationEventType.EXPIRED,
          { ...invitation, status: InvitationStatus.EXPIRED },
          membership?.role ?? ('RESIDENT' as MembershipRole),
          'SYSTEM',
          'Invitation expired automatically',
        );
        await invitationEventEmitter.emit(event);
      }

      return updatedCount;
    },
  };
};

/**
 * Type alias for the factory function for cleaner DI registration.
 */
export type MembershipInvitationService = IMembershipInvitationService;
