/**
 * Tenant Switcher feature barrel export.
 *
 * This feature provides tenant/OrgUnit context switching functionality
 * for users with multiple memberships.
 *
 * @see Requirements 1.1-1.10
 * @see Design Components > 1. Tenant Switcher Component
 */

// Components
export { TenantSwitcher } from './components';
export type { TenantSwitcherProps } from './components';

// ViewModel
export {
  useTenantSwitcherViewModel,
  useTenantSwitcher,
} from './viewModel';
export type {
  TenantSwitcherViewModel,
  MembershipSummary,
  CurrentContext,
} from './viewModel';
