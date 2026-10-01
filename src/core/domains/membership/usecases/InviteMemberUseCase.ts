/**
 * InviteMemberUseCase — Handles member invitation for Admin UI.
 *
 * This use case orchestrates the invitation of new members to a tenant,
 * supporting both single and bulk invitations with proper validation:
 * - Email format validation
 * - Role delegation matrix validation (actor can only invite roles they can delegate)
 * - OrgUnit scope validation (target OrgUnit must be within actor's scope)
 *
 * **ORCHESTRATION FLOW:**
 * 1. Validate actor has membership:delegate permission
 * 2. Validate email format(s)
 * 3. Validate role delegation (delegation matrix check)
 * 4. Validate OrgUnit scope (target must be in actor's scope)
 * 5. Call repository for invitation
 * 6. Return invitation ID or bulk result
 *
 * @see Requirements 3.8-3.11 (Member Invitation Flow)
 * @see Design Components and Interfaces > 3. Member Invitation Flow
 */

import type { DomainResult } from '@core/utils';
import { ok, fail, validationError, businessError } from '@core/utils';
import type {
  MembershipAdminRepository,
  InviteMemberInput,
  BulkInviteMemberInput,
  BulkInviteResult,
} from '../repositories/MembershipAdminRepository';
import type { MembershipRole } from '../types/MembershipRole';
import { MembershipStatus, isOrgScopedRole } from '../types';
import {
  authInsufficientPermission,
  authNoMembership,
  authDelegationViolation,
  authOutOfScope,
} from '../errors';
import {
  type IDelegationMatrixService,
  canDelegate,
} from '../services/DelegationMatrixService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum emails allowed in a single bulk invitation.
 * @see Requirements 3.12
 */
export const BULK_INVITATION_LIMIT = 50;

/**
 * Email validation regex pattern.
 * Standard email format validation.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

/**
 * Validate a single email format.
 * @param email - Email address to validate
 * @returns true if valid email format
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }
  const trimmed = email.trim().toLowerCase();
  return EMAIL_REGEX.test(trimmed) && trimmed.length <= 254; // RFC 5321 max length
}

/**
 * Parse and validate bulk emails from input string.
 * @param input - String containing multiple emails (comma, semicolon, or newline separated)
 * @returns Object with valid and invalid emails
 */
export function parseBulkEmails(input: string): {
  valid: string[];
  invalid: string[];
} {
  const lines = input
    .split(/[\n,;]/)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  const valid: string[] = [];
  const invalid: string[] = [];

  for (const line of lines) {
    if (isValidEmail(line)) {
      valid.push(line);
    } else {
      invalid.push(line);
    }
  }

  // Dedupe valid emails
  return {
    valid: [...new Set(valid)],
    invalid,
  };
}

// ---------------------------------------------------------------------------
// Input Types
// ---------------------------------------------------------------------------

/**
 * Base input for invitation operations.
 */
interface InviteBaseInput {
  /**
   * The tenant to invite members to.
   */
  readonly tenantId: string;

  /**
   * The actor's membership ID (for audit and delegation validation).
   */
  readonly actorMembershipId: string;

  /**
   * The actor's role (for delegation matrix check).
   */
  readonly actorRole: MembershipRole;

  /**
   * The actor's membership status (must be ACTIVE).
   */
  readonly actorStatus: MembershipStatus;

  /**
   * The actor's OrgUnit scope (null for tenant-level admins).
   */
  readonly actorOrgUnitId: string | null;

  /**
   * Whether the actor has membership:delegate permission.
   */
  readonly hasDelegatePermission: boolean;
}

/**
 * Input for single member invitation.
 */
export interface InviteSingleMemberInput extends InviteBaseInput {
  /**
   * Email address of the user to invite.
   */
  readonly email: string;

  /**
   * Role to assign to the invited member.
   */
  readonly role: MembershipRole;

  /**
   * OrgUnit to assign the member to (required for org-scoped roles).
   */
  readonly orgUnitId: string | null;
}

/**
 * Input for bulk member invitation.
 */
export interface InviteBulkMembersInput extends InviteBaseInput {
  /**
   * List of email addresses to invite.
   */
  readonly emails: string[];

  /**
   * Role to assign to all invited members.
   */
  readonly role: MembershipRole;

  /**
   * OrgUnit to assign all members to.
   */
  readonly orgUnitId: string | null;
}

/**
 * Result of single invitation.
 */
export interface SingleInviteResult {
  readonly invitationId: string;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * InviteMemberUseCase interface — handles member invitations.
 */
export interface InviteMemberUseCase {
  /**
   * Invite a single member.
   *
   * @param input - The invitation input
   * @returns DomainResult with invitation ID or error
   *
   * @see Requirements 3.8-3.11
   */
  execute(input: InviteSingleMemberInput): Promise<DomainResult<SingleInviteResult>>;

  /**
   * Invite multiple members in a batch.
   *
   * @param input - The bulk invitation input
   * @returns DomainResult with bulk invite result (successes and failures)
   *
   * @see Requirements 3.12
   */
  executeBulk(input: InviteBulkMembersInput): Promise<DomainResult<BulkInviteResult>>;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create an InviteMemberUseCase instance.
 *
 * @param dependencies - The use case dependencies
 * @returns An implementation of InviteMemberUseCase
 */
export const InviteMemberUseCaseImpl = ({
  membershipAdminRepository,
  delegationMatrixService,
  orgUnitScopeChecker,
}: {
  membershipAdminRepository: MembershipAdminRepository;
  delegationMatrixService?: IDelegationMatrixService;
  /**
   * Optional scope checker to verify OrgUnit is within actor's scope.
   * If not provided, assumes repository handles scope validation.
   */
  orgUnitScopeChecker?: {
    isOrgUnitInScope: (
      actorOrgUnitId: string | null,
      targetOrgUnitId: string | null,
      tenantId: string,
    ) => Promise<boolean>;
  };
}): InviteMemberUseCase => {
  /**
   * Validate common invitation inputs.
   */
  const validateCommonInputs = (
    input: InviteBaseInput,
    role: MembershipRole,
    orgUnitId: string | null,
  ): DomainResult<void> => {
    // Step 1: Validate actor has membership:delegate permission
    if (!input.hasDelegatePermission) {
      return fail(authInsufficientPermission(['membership:delegate']));
    }

    // Step 2: Validate tenantId is provided
    if (!input.tenantId) {
      return fail(authNoMembership());
    }

    // Step 3: Validate actor's membership is ACTIVE
    if (input.actorStatus !== MembershipStatus.ACTIVE) {
      return fail(
        businessError(
          'ACTOR_MEMBERSHIP_INACTIVE',
          'Actor membership must be ACTIVE to invite members',
          { userMessage: 'Your membership is not active.' },
        ),
      );
    }

    // Step 4: Validate role delegation (actor can only delegate roles in their matrix)
    // Use the quick canDelegate helper for synchronous check
    const canDelegateRole = delegationMatrixService
      ? delegationMatrixService.canDelegateRole(input.actorRole, role)
      : canDelegate(input.actorRole, role);

    if (!canDelegateRole) {
      return fail(authDelegationViolation(role));
    }

    // Step 5: Validate OrgUnit requirement based on role
    if (isOrgScopedRole(role) && !orgUnitId) {
      return fail(
        validationError(
          'VALIDATION_ORGUNIT_REQUIRED',
          `Role ${role} requires OrgUnit assignment`,
          { userMessage: 'An organization unit is required for this role.' },
        ),
      );
    }

    // Tenant-level roles should not have OrgUnit (but TENANT_OWNER/PLATFORM_ADMIN
    // cannot be invited via delegation, so this is just a safety check)
    if (!isOrgScopedRole(role) && orgUnitId) {
      return fail(
        validationError(
          'VALIDATION_ORGUNIT_FORBIDDEN',
          `Role ${role} cannot have OrgUnit assignment`,
          { userMessage: 'This role cannot be assigned to an organization unit.' },
        ),
      );
    }

    return ok(undefined);
  };

  /**
   * Validate OrgUnit scope (target must be within actor's scope).
   */
  const validateOrgUnitScope = async (
    actorOrgUnitId: string | null,
    targetOrgUnitId: string | null,
    tenantId: string,
  ): Promise<DomainResult<void>> => {
    // If actor is tenant-level admin (null OrgUnit), they can invite to any OrgUnit
    if (actorOrgUnitId === null) {
      return ok(undefined);
    }

    // If no target OrgUnit (tenant-level role), check is not applicable
    if (targetOrgUnitId === null) {
      return ok(undefined);
    }

    // If scope checker is provided, use it
    if (orgUnitScopeChecker) {
      const inScope = await orgUnitScopeChecker.isOrgUnitInScope(
        actorOrgUnitId,
        targetOrgUnitId,
        tenantId,
      );

      if (!inScope) {
        return fail(authOutOfScope());
      }
    }

    // If actor is org-scoped and inviting to a different OrgUnit without a checker,
    // we assume the repository will handle the validation
    // For a strict implementation, we could fail here, but the repository layer
    // should enforce scope constraints as the final check

    return ok(undefined);
  };

  return {
    execute: async (
      input: InviteSingleMemberInput,
    ): Promise<DomainResult<SingleInviteResult>> => {
      const { tenantId, actorMembershipId, email, role, orgUnitId } = input;

      // Step 1: Validate email format
      if (!isValidEmail(email)) {
        return fail(
          validationError(
            'VALIDATION_INVALID_EMAIL',
            `Invalid email format: ${email}`,
            { userMessage: 'Please enter a valid email address.' },
          ),
        );
      }

      // Step 2: Validate common inputs (permission, delegation, etc.)
      const commonValidation = validateCommonInputs(input, role, orgUnitId);
      if (!commonValidation.success) {
        return commonValidation;
      }

      // Step 3: Validate OrgUnit scope
      const scopeValidation = await validateOrgUnitScope(
        input.actorOrgUnitId,
        orgUnitId,
        tenantId,
      );
      if (!scopeValidation.success) {
        return scopeValidation;
      }

      // Step 4: Call repository for invitation
      const invitationInput: InviteMemberInput = {
        email: email.trim().toLowerCase(),
        role,
        orgUnitId,
      };

      const result = await membershipAdminRepository.inviteMember(
        tenantId,
        actorMembershipId,
        invitationInput,
      );

      return result;
    },

    executeBulk: async (
      input: InviteBulkMembersInput,
    ): Promise<DomainResult<BulkInviteResult>> => {
      const { tenantId, actorMembershipId, emails, role, orgUnitId } = input;

      // Step 1: Validate bulk limit
      if (emails.length > BULK_INVITATION_LIMIT) {
        return fail(
          validationError(
            'VALIDATION_BULK_LIMIT_EXCEEDED',
            `Bulk invitation limited to ${BULK_INVITATION_LIMIT} emails per batch`,
            {
              userMessage: `You can only invite up to ${BULK_INVITATION_LIMIT} members at a time.`,
            },
          ),
        );
      }

      // Step 2: Validate emails
      const validEmails: string[] = [];
      const invalidEmails: Array<{
        email: string;
        errorCode: string;
        errorMessage: string;
      }> = [];

      for (const email of emails) {
        if (isValidEmail(email)) {
          validEmails.push(email.trim().toLowerCase());
        } else {
          invalidEmails.push({
            email,
            errorCode: 'VALIDATION_INVALID_EMAIL',
            errorMessage: 'Invalid email format',
          });
        }
      }

      // If all emails are invalid, return early with all failures
      if (validEmails.length === 0) {
        return ok({
          successes: [],
          failures: invalidEmails,
        });
      }

      // Step 3: Validate common inputs (permission, delegation, etc.)
      const commonValidation = validateCommonInputs(input, role, orgUnitId);
      if (!commonValidation.success) {
        return commonValidation;
      }

      // Step 4: Validate OrgUnit scope
      const scopeValidation = await validateOrgUnitScope(
        input.actorOrgUnitId,
        orgUnitId,
        tenantId,
      );
      if (!scopeValidation.success) {
        return scopeValidation;
      }

      // Step 5: Call repository for bulk invitation (dedupe emails)
      const uniqueEmails = [...new Set(validEmails)];
      const bulkInput: BulkInviteMemberInput = {
        emails: uniqueEmails,
        role,
        orgUnitId,
      };

      const result = await membershipAdminRepository.bulkInviteMembers(
        tenantId,
        actorMembershipId,
        bulkInput,
      );

      // Step 6: Merge repository result with pre-validation failures
      if (!result.success) {
        return result;
      }

      // Combine invalid email failures with any repository-level failures
      return ok({
        successes: result.data.successes,
        failures: [...invalidEmails, ...result.data.failures],
      });
    },
  };
};

/**
 * Type alias for cleaner DI registration.
 */
export type InviteMemberUseCaseType = InviteMemberUseCase;
