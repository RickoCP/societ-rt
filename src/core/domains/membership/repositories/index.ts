/**
 * Membership Repository barrel export.
 *
 * Exports the repository interface and related types for the membership domain.
 * The interface is defined in core (Clean Architecture) while implementations
 * live in infrastructure.
 *
 * @see FASE 1.6 — Membership Read Model / Repository
 * @see FASE 1.18 — Membership Lifecycle Management
 * @see FASE 1.18 Task 53 — Membership Invitation Flow
 * @see Requirements 1 (AC 1-7), 22 (AC 1-7), 25 (AC 1-9)
 * @see Requirements 2.2-2.8 (Member List Screen)
 */

// Repository interfaces
export type { IMembershipRepository } from './IMembershipRepository';
export type {
  MembershipWriteRepository,
  UpdateMembershipData,
} from './MembershipWriteRepository';
export type {
  IMembershipInvitationRepository,
  InvitationQueryOptions,
} from './IMembershipInvitationRepository';

// Admin UI Repository interface (Task 5.1)
export type {
  MembershipAdminRepository,
  InviteMemberInput,
  BulkInviteMemberInput,
  BulkInviteResult,
  ChangeMemberStatusInput,
  ChangeMemberRoleInput,
} from './MembershipAdminRepository';

export { BULK_OPERATION_LIMITS } from './MembershipAdminRepository';

// MembershipRepository alias (Task 5.1 - named export per spec)
export type { MembershipRepository } from './MembershipRepository';

// Query options and helper types
export type {
  MembershipQueryOptions,
  FindByUserIdOptions,
  ResolvedQueryOptions,
} from './types';

export { resolveQueryOptions } from './types';
