/**
 * Membership Use Cases — Barrel export for Admin UI membership operations.
 *
 * @see Requirements 2.1-6.9 (Membership Management)
 */

// List Members
export type { ListMembersUseCase, ListMembersInput } from './ListMembersUseCase';
export { ListMembersUseCaseImpl } from './ListMembersUseCase';

// Invite Member
export type {
  InviteMemberUseCase,
  InviteSingleMemberInput,
  InviteBulkMembersInput,
  SingleInviteResult,
} from './InviteMemberUseCase';
export {
  InviteMemberUseCaseImpl,
  BULK_INVITATION_LIMIT,
  isValidEmail,
  parseBulkEmails,
} from './InviteMemberUseCase';

// Bulk Member Operations
export type {
  BulkMemberOperationUseCase,
  BulkOperationType,
  BulkOperationProgress,
  BulkOperationFailure,
  BulkOperationResult,
  BulkStatusChangeInput,
  BulkRoleChangeInput,
} from './BulkMemberOperationUseCase';
export { BulkMemberOperationUseCaseImpl } from './BulkMemberOperationUseCase';

// Change Member Role
export type {
  ChangeMemberRoleUseCase,
  ChangeMemberRoleUseCaseInput,
} from './ChangeMemberRoleUseCase';
export { ChangeMemberRoleUseCaseImpl } from './ChangeMemberRoleUseCase';

// Assign Members to OrgUnit
export type {
  AssignMembersToOrgUnitUseCase,
  AssignMembersToOrgUnitInput,
  MemberAssignmentInfo,
  SingleAssignmentResult,
  AssignMembersToOrgUnitResult,
} from './AssignMembersToOrgUnitUseCase';
export {
  AssignMembersToOrgUnitUseCaseImpl,
  BULK_ASSIGNMENT_LIMIT,
} from './AssignMembersToOrgUnitUseCase';
