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

// Query options and helper types
export type {
  MembershipQueryOptions,
  FindByUserIdOptions,
  ResolvedQueryOptions,
} from './types';

export { resolveQueryOptions } from './types';
