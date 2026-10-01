/**
 * Membership ViewModels — Barrel export for presentation layer ViewModels.
 *
 * @see Requirements 2.1-6.9 (Membership Management)
 */

// Member List ViewModel
export type { MemberListViewModel, MemberListFilters, SortDirection } from './useMemberListViewModel';
export { useMemberListViewModel, MEMBER_LIST_QUERY_KEY, MAX_BULK_SELECTION } from './useMemberListViewModel';

// Invitation Form ViewModel
export type {
  InvitationFormViewModel,
  InvitationFormData,
  EmailValidationResult,
} from './useInvitationFormViewModel';
export {
  useInvitationFormViewModel,
  parseBulkEmails,
  BULK_EMAIL_LIMIT,
  ORGUNITS_QUERY_KEY,
} from './useInvitationFormViewModel';

// Member Card ViewModel
export type {
  MemberCardViewModel,
  UseMemberCardViewModelProps,
  RoleChangeFormData,
} from './useMemberCardViewModel';
export {
  useMemberCardViewModel,
  MEMBER_DETAILS_QUERY_KEY,
  ROLE_CHANGE_HISTORY_QUERY_KEY,
  AVAILABLE_ORGUNITS_QUERY_KEY,
} from './useMemberCardViewModel';
