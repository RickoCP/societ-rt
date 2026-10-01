/**
 * MembershipRepository — Unified repository interface for Admin UI membership operations.
 *
 * This file re-exports MembershipAdminRepository as MembershipRepository for the
 * Admin UI, providing a cleaner import path that matches the task specification.
 *
 * For authorization context resolution, use IMembershipRepository instead.
 *
 * @see Requirements 2.2-2.8 (Member List Screen)
 * @see Requirements 3.1-3.12 (Member Invitation Flow)
 * @see Requirements 4.1-4.11 (Member Status Management)
 * @see Requirements 5.1-5.11 (Member Role Change)
 */

export type {
  MembershipAdminRepository as MembershipRepository,
  InviteMemberInput,
  BulkInviteMemberInput,
  BulkInviteResult,
  ChangeMemberStatusInput,
  ChangeMemberRoleInput,
} from './MembershipAdminRepository';

export { BULK_OPERATION_LIMITS } from './MembershipAdminRepository';
