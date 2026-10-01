/**
 * ViewModel Container — Registers ViewModel factories.
 *
 * NOTE: Client-side ViewModels (React hooks) are not typically registered
 * in the DI container because they use React-specific features (hooks, context).
 * They are imported directly in components via barrel exports.
 *
 * This container documents available ViewModels for reference:
 *
 * Tenant Switcher (Task 3.5):
 * - useTenantSwitcherViewModel: Available from '@presentation/features/tenant-switcher'
 *   - Handles tenant/OrgUnit context switching
 *   - Uses React Query for data fetching
 *   - Uses usePermissions hook for auth context
 *   - @see Requirements 1.1-1.10
 *
 * Membership Management (Task 8.3):
 * - useMemberListViewModel: Available from '@presentation/features/membership'
 *   - Handles member list with pagination, sorting, and filtering
 *   - Supports bulk selection for bulk operations
 *   - Uses React Query for server state management
 *   - @see Requirements 2.1-2.12
 *
 * - useInvitationFormViewModel: Available from '@presentation/features/membership'
 *   - Handles member invitation flow (single and bulk)
 *   - Validates email format and delegation matrix
 *   - Uses React Query mutations for invitation API calls
 *   - @see Requirements 3.1-3.12
 *
 * - useMemberCardViewModel: Available from '@presentation/features/membership'
 *   - Handles member card modal with role change functionality
 *   - Displays role change history
 *   - Uses React Query for member details and mutations
 *   - @see Requirements 5.1-5.11
 *
 * OrgUnit Hierarchy (Task 13.5):
 * - useOrgUnitTreeViewModel: Available from '@presentation/features/orgunit'
 *   - Handles hierarchical OrgUnit tree with React Query
 *   - Manages expand/collapse state (persisted via adminUiStore)
 *   - Manages search/filter state with highlighting
 *   - Manages selected OrgUnit state for details panel
 *   - Permission-based action visibility (orgunit:read, orgunit:write)
 *   - Drag-and-drop move operations with validation
 *   - @see Requirements 7.1-7.12 (OrgUnit Hierarchy Tree View)
 *   - @see Requirements 10.1-10.11 (OrgUnit Reparenting)
 *
 * Tenant Settings (Task 18.2):
 * - useTenantSettingsViewModel: Available from '@presentation/features/tenant-settings'
 *   - Handles tenant settings screen with tabbed interface (Profile, Configuration, Lifecycle)
 *   - Manages dirty state for unsaved changes warning
 *   - Uses React Query for fetching and mutations
 *   - Requires tenant:manage permission
 *   - Lifecycle state machine with action availability based on current status and role
 *   - @see Requirements 11.1-11.10 (Tenant Settings Profile)
 *   - @see Requirements 12.1-12.10 (Tenant Configuration Settings)
 *   - @see Requirements 13.1-13.11 (Tenant Lifecycle Management)
 *
 * Subscription Management (Task 22.2):
 * - useSubscriptionViewModel: Available from '@presentation/features/subscription'
 *   - Handles subscription overview screen with current plan, status, and usage metrics
 *   - Manages plan comparison modal state
 *   - Calculates usage percentages and warnings (>80% threshold)
 *   - Determines upgrade/downgrade availability based on plan tier
 *   - Uses React Query for subscription data fetching
 *   - Requires tenant:manage permission
 *   - @see Requirements 14.1-14.9 (Subscription Plan Overview)
 *   - @see Requirements 15.5-15.9 (Plan Upgrade/Downgrade)
 *   - @see Requirements 16.1-16.11 (Billing History)
 *
 * Audit Log (Task 25.3):
 * - useAuditLogViewModel: Available from '@presentation/features/audit'
 *   - Handles audit log viewer with pagination and filtering
 *   - Uses React Query for data fetching
 *   - Supports row expansion for detailed JSON view
 *   - Supports export to CSV/JSON via ExportAuditLogsUseCase
 *   - Requires audit:read OR tenant:manage permission
 *   - @see Requirements 17.1-17.13 (Audit Log Viewer)
 *   - @see Requirements 18.1-18.10 (Audit Log Export)
 *
 * Platform Admin (Task 29.4):
 * - usePlatformDashboardViewModel: Available from '@presentation/features/platform-admin'
 *   - Handles platform-wide metrics display and auto-refresh (60s interval)
 *   - Manages tenant overview table with filtering and sorting
 *   - Manages alerts and warnings display
 *   - Uses React Query for metrics fetching
 *   - Requires PLATFORM_ADMIN role (redirects unauthorized users)
 *   - @see Requirements 19.1-19.11 (Platform Admin Dashboard)
 *
 * - useTenantOperationsViewModel: Available from '@presentation/features/platform-admin'
 *   - Handles tenant detail view with profile, subscription, and lifecycle info
 *   - Manages impersonation state (start, active, end)
 *   - Manages force operations (suspend, close, reset token version)
 *   - Uses React Query for tenant details and mutations
 *   - Audit logs all impersonation start/actions/end events
 *   - Auto-expires impersonation after 30 minutes
 *   - @see Requirements 20.1-20.9 (Tenant Management Operations)
 *
 * - useSecurityEventsViewModel: Available from '@presentation/features/platform-admin'
 *   - Handles security events list with severity filtering
 *   - Manages event acknowledgment flow
 *   - Displays trend chart for event count over time
 *   - Uses React Query for events fetching
 *   - Requires PLATFORM_ADMIN role
 *   - @see Requirements 21.1-21.10 (Security Events Section)
 *
 * For server-side ViewModels that need DI, register them using asFunction().
 */

import type { AwilixContainer } from 'awilix';

export function registerViewModels(_container: AwilixContainer): void {
  // Client-side ViewModels (React hooks) are not registered here.
  // They are imported directly from their feature modules:
  //
  // Tenant Switcher:
  // import { useTenantSwitcherViewModel } from '@presentation/features/tenant-switcher';
  //
  // Membership Management:
  // import { useMemberListViewModel, useInvitationFormViewModel } from '@presentation/features/membership';
  //
  // OrgUnit Hierarchy (Task 13.5):
  // import { useOrgUnitTreeViewModel } from '@presentation/features/orgunit';
  //
  // Tenant Settings (Task 18.2):
  // import { useTenantSettingsViewModel } from '@presentation/features/tenant-settings';
  //
  // Subscription Management (Task 22.2):
  // import { useSubscriptionViewModel } from '@presentation/features/subscription';
  //
  // Audit Log (Task 25.3):
  // import { useAuditLogViewModel } from '@presentation/features/audit';
  //
  // Platform Admin (Task 29.4):
  // import { usePlatformDashboardViewModel, useTenantOperationsViewModel, useSecurityEventsViewModel } from '@presentation/features/platform-admin';
  //
  // Server-side ViewModels can be registered here when needed.
}
