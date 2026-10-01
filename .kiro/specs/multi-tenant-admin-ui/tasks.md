# Implementation Plan: Multi-Tenant Admin UI

## Overview

This implementation plan creates comprehensive administrative UI screens for the Multi-Tenant SaaS architecture. The UI follows Clean Architecture patterns (Screen → ViewModel → UseCase → Repository) and leverages existing backend services from the multi-tenant-saas-architecture spec.

| Field | Value |
|-------|-------|
| Feature Name | multi-tenant-admin-ui |
| Total Requirements | 25 |
| Total Tasks | 65 |
| Estimated Phases | 10 |
| Primary Technology | Next.js 14+, React Query, Zustand, TypeScript |
| Testing Framework | Vitest, React Testing Library, fast-check |

## Task Conventions

- Tasks marked with `*` are optional test sub-tasks
- Each task references specific requirements (e.g., `_Requirements: 1.1-1.10_`)
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from design.md

---

## Tasks

### Phase 1: Foundation (Shared Components)

- [x] 1. Create foundational shared components and infrastructure
  - [x] 1.1 Create PermissionGuard component
    - Create `src/presentation/components/atoms/PermissionGuard.tsx`
    - Create `src/presentation/hooks/usePermissions.ts`
    - Implement conditional rendering based on permissions array
    - Support `all` (require all) and `any` (require one) modes
    - Handle loading state gracefully
    - Add fallback prop for unauthorized view
    - _Requirements: 22.1-22.10_

  - [ ]* 1.2 Write property tests for PermissionGuard
    - **Property 20: Permission Guard - all mode**
    - **Property 21: Permission Guard - any mode**
    - **Validates: Requirements 22.3, 22.4**

  - [x] 1.3 Enhance DataTable with selection and sorting
    - Modify `src/presentation/components/organisms/DataTable.tsx`
    - Add `selectable` prop with checkbox column
    - Add `selectedIds` and `onSelectionChange` props
    - Add `sortable` prop with sort column/direction
    - Add `onSortChange` callback
    - Add `disableSelection` predicate function
    - Maintain backward compatibility with existing usage
    - _Requirements: 2.6, 2.7, 6.1, 6.2_

  - [ ]* 1.4 Write property tests for DataTable pagination and sorting
    - **Property 4: Pagination correctness**
    - **Property 5: Sorting correctness**
    - **Validates: Requirements 2.6, 2.7**

  - [x] 1.5 Create TreeView component
    - Create `src/presentation/components/organisms/TreeView.tsx`
    - Implement generic tree rendering with `TreeNode<T>` interface
    - Support expand/collapse with `expandedIds` state
    - Support keyboard navigation (Arrow keys, Enter, Escape)
    - Implement drag-and-drop support with `draggable` prop
    - Add `isValidDropTarget` validation callback
    - Add visual drop target highlighting
    - _Requirements: 7.2, 7.7, 10.1-10.3_

  - [x] 1.6 Create FilterPanel component
    - Create `src/presentation/components/molecules/FilterPanel.tsx`
    - Support filter types: text, select, multiselect, daterange
    - Implement `FilterDefinition` interface for declarative filters
    - Add apply/clear buttons
    - Support controlled values via props
    - _Requirements: 2.8, 17.8, 17.9_

  - [x] 1.7 Create DestructiveConfirmationDialog component
    - Create `src/presentation/components/molecules/DestructiveConfirmationDialog.tsx`
    - Extend existing ConfirmDialog with required text input
    - Block confirm until user types exact confirmation text
    - Use for irreversible actions (revoke, close tenant)
    - _Requirements: 4.5, 10.5, 13.9_

  - [x] 1.8 Create Toast store and component enhancements
    - Create `src/infrastructure/stateManagement/stores/toastStore.ts`
    - Define ToastConfig interface with type, message, duration, action
    - Implement addToast/removeToast actions
    - Configure auto-dismiss (3s success, 5s error)
    - _Requirements: 24.6, 24.7_

  - [x] 1.9 Create Admin UI state store
    - Create `src/infrastructure/stateManagement/stores/adminUiStore.ts`
    - Implement sidebar collapsed state
    - Implement OrgUnit tree expansion state (persisted)
    - Implement member selection state
    - Implement impersonation state
    - Implement active filters state
    - _Requirements: 6.1, 7.10, 20.3-20.5_

- [x] 2. Checkpoint - Foundation components complete
  - Ensure all tests pass, ask the user if questions arise.

---

### Phase 2: Tenant Switcher

- [x] 3. Implement Tenant Switcher component
  - [x] 3.1 Create Tenant Switcher component and ViewModel
    - Create `src/presentation/features/tenant-switcher/components/TenantSwitcher.tsx`
    - Create `src/presentation/features/tenant-switcher/viewModel/useTenantSwitcherViewModel.ts`
    - Display current tenant name, OrgUnit, and role
    - Render dropdown with all ACTIVE memberships
    - Show tenant logo, name, role for each membership entry
    - Implement keyboard navigation (Arrow keys, Enter, Escape)
    - Add visual indicator (checkmark) for current context
    - Disable switching when user has single membership
    - _Requirements: 1.1-1.4, 1.8-1.10_

  - [ ]* 3.2 Write property test for Tenant Switcher field display
    - **Property 1: Tenant Switcher displays all membership fields**
    - **Validates: Requirements 1.3**

  - [x] 3.3 Create SwitchContext use case and repository
    - Create `src/core/domains/auth/usecases/SwitchContextUseCase.ts`
    - Create `src/infrastructure/repositories/auth/ContextSwitchRepositoryImpl.ts`
    - Call ContextSwitchService backend
    - Handle new token issuance
    - Return DomainResult with success/error
    - _Requirements: 1.5-1.7_

  - [x] 3.4 Integrate Tenant Switcher with Header
    - Modify `src/presentation/components/organisms/Header.tsx`
    - Add optional `tenantSwitcherProps` prop
    - Position Tenant Switcher after impersonation banner
    - Pass memberships and current context from layout
    - Trigger page reload on successful context switch
    - Display success/error toasts with i18n keys
    - _Requirements: 1.5-1.7_

  - [x] 3.5 Register Tenant Switcher in DI container
    - Update `src/infrastructure/di/registry/useCasesContainer.ts`
    - Update `src/infrastructure/di/registry/viewModelContainer.ts`
    - Update `src/infrastructure/di/registry/repositoryContainer.ts`
    - Register switchContextUseCase
    - Register useTenantSwitcherViewModel
    - _Requirements: DI pattern per 06-di-pattern steering_

  - [ ]* 3.6 Write unit tests for Tenant Switcher ViewModel
    - Test membership fetching and display
    - Test context switch success path
    - Test error handling and toast display
    - Test keyboard navigation
    - _Requirements: 1.1-1.10_

- [x] 4. Checkpoint - Tenant Switcher complete
  - Ensure all tests pass, ask the user if questions arise.

---

### Phase 3: Membership Management

- [x] 5. Implement Member List Screen
  - [x] 5.1 Create Membership core domain entities and interfaces
    - Create `src/core/domains/membership/entities/Member.ts`
    - Create `src/core/domains/membership/entities/MembershipRole.ts`
    - Create `src/core/domains/membership/entities/MembershipStatus.ts`
    - Create `src/core/domains/membership/repositories/MembershipRepository.ts`
    - Define MemberFilters interface
    - _Requirements: 2.2-2.8_

  - [x] 5.2 Create ListMembers use case and repository
    - Create `src/core/domains/membership/usecases/ListMembersUseCase.ts`
    - Create `src/infrastructure/repositories/membership/MembershipRepositoryImpl.ts`
    - Implement scope-based filtering (tenant-level vs org-scoped)
    - Support pagination, sorting, and filtering
    - Return DomainResult with paginated members
    - _Requirements: 2.3-2.8_

  - [ ]* 5.3 Write property tests for Member List filtering
    - **Property 2: Member list scope filtering (tenant admin)**
    - **Property 3: Member list scope filtering (org admin)**
    - **Property 6: Filter correctness**
    - **Validates: Requirements 2.4, 2.5, 2.8**

  - [x] 5.4 Create Member List screen and ViewModel
    - Create `src/presentation/features/membership/screens/MemberListScreen.tsx`
    - Create `src/presentation/features/membership/viewModel/useMemberListViewModel.ts`
    - Wrap in PermissionGuard requiring `membership:read`
    - Display DataTable with columns: name, email, role, OrgUnit, status, joined date
    - Integrate pagination, sorting, and filtering
    - Display loading skeleton while fetching
    - Display error state with retry button
    - Display empty state when no results
    - _Requirements: 2.1-2.12_

  - [ ]* 5.5 Write property test for permission-based action visibility
    - **Property 7: Permission-based action visibility**
    - **Validates: Requirements 2.9**

  - [x] 5.6 Create Member Actions component
    - Create `src/presentation/features/membership/components/MemberActions.tsx`
    - Display status-specific action buttons per ACTION_VISIBILITY matrix
    - Conditionally render based on `membership:write` permission
    - Disable self-modification actions
    - Integrate with ConfirmDialog for confirm/cancel flow
    - _Requirements: 4.1-4.11_

  - [ ]* 5.7 Write property test for action button visibility matrix
    - **Property 12: Member action button visibility matrix**
    - **Validates: Requirements 4.1**

- [x] 6. Implement Member Invitation Flow
  - [x] 6.1 Create InviteMember use case
    - Create `src/core/domains/membership/usecases/InviteMemberUseCase.ts`
    - Call MembershipInvitationService.invite()
    - Handle duplicate email error
    - Support single and bulk invitations
    - _Requirements: 3.8-3.11_

  - [x] 6.2 Create Invitation Form component and ViewModel
    - Create `src/presentation/features/membership/components/InvitationForm.tsx`
    - Create `src/presentation/features/membership/viewModel/useInvitationFormViewModel.ts`
    - Implement email field with client-side validation
    - Implement role dropdown filtered by delegation matrix
    - Implement OrgUnit dropdown filtered by user scope
    - Pre-select current OrgUnit for org-scoped admins
    - Support bulk email input (paste multiple, limit 50)
    - Display success/error toasts
    - _Requirements: 3.1-3.12_

  - [ ]* 6.3 Write property tests for invitation delegation
    - **Property 8: Invitation role delegation matrix**
    - **Property 9: Invitation OrgUnit scope constraint**
    - **Property 10: Email validation**
    - **Property 11: Bulk email limit enforcement**
    - **Validates: Requirements 3.4, 3.5, 3.6, 3.7, 3.12**

- [x] 7. Implement Member Role Change
  - [x] 7.1 Create ChangeMemberRole use case
    - Create `src/core/domains/membership/usecases/ChangeMemberRoleUseCase.ts`
    - Call DelegatedMembershipService.changeRole()
    - Validate against delegation matrix
    - Handle OrgUnit assignment for org-scoped roles
    - _Requirements: 5.6-5.10_

  - [x] 7.2 Create Member Card modal and ViewModel
    - Create `src/presentation/features/membership/components/MemberCard.tsx`
    - Create `src/presentation/features/membership/viewModel/useMemberCardViewModel.ts`
    - Display member profile info (avatar, name, email, role, OrgUnit, status, dates)
    - Show editable role dropdown (filtered by delegation matrix) if has permission
    - Show OrgUnit selection when org-scoped role selected
    - Display role change history section
    - Handle save with success/error toasts
    - _Requirements: 5.1-5.11_

- [x] 8. Implement Bulk Membership Operations
  - [x] 8.1 Create BulkMemberOperation use case
    - Create `src/core/domains/membership/usecases/BulkMemberOperationUseCase.ts`
    - Process operations sequentially
    - Track progress (completed, successes, failures)
    - Continue on individual failures
    - Return summary results
    - _Requirements: 6.6, 6.7_

  - [x] 8.2 Create Bulk Actions Toolbar component
    - Create `src/presentation/features/membership/components/BulkActionsToolbar.tsx`
    - Display selected count and available actions
    - Enable/disable actions based on selected member statuses
    - Add Bulk Suspend, Bulk Activate, Bulk Change Role, Export Selected
    - Show progress indicator during bulk operation
    - Display detailed error report on completion
    - Enforce 100 member batch limit
    - _Requirements: 6.1-6.9_

  - [x] 8.3 Register Membership use cases and ViewModels in DI
    - Update `src/infrastructure/di/registry/useCasesContainer.ts`
    - Update `src/infrastructure/di/registry/viewModelContainer.ts`
    - Update `src/infrastructure/di/registry/repositoryContainer.ts`
    - Register listMembersUseCase, inviteMemberUseCase, changeMemberStatusUseCase
    - Register changeMemberRoleUseCase, bulkMemberOperationUseCase
    - Register useMemberListViewModel, useInvitationFormViewModel, useMemberCardViewModel
    - _Requirements: DI pattern per 06-di-pattern steering_

  - [ ]* 8.4 Write unit tests for Membership ViewModels
    - Test useMemberListViewModel filtering, pagination, sorting
    - Test useInvitationFormViewModel validation and submission
    - Test useMemberCardViewModel role change flow
    - Test bulk operations progress tracking
    - _Requirements: 2.1-6.9_

- [x] 9. Checkpoint - Membership Management complete
  - Ensure all tests pass, ask the user if questions arise.

---

### Phase 4: OrgUnit Hierarchy

- [x] 10. Implement OrgUnit Tree Screen
  - [x] 10.1 Create OrgUnit core domain entities and interfaces
    - Create `src/core/domains/orgunit/entities/OrgUnit.ts`
    - Create `src/core/domains/orgunit/entities/OrgUnitType.ts`
    - Create `src/core/domains/orgunit/entities/OrgUnitNode.ts`
    - Create `src/core/domains/orgunit/repositories/OrgUnitRepository.ts`
    - Define ORGUNIT_TYPE_HIERARCHY constant
    - _Requirements: 7.3, 8.3_

  - [x] 10.2 Create GetOrgUnitTree use case and repository
    - Create `src/core/domains/orgunit/usecases/GetOrgUnitTreeUseCase.ts`
    - Create `src/infrastructure/repositories/orgunit/OrgUnitRepositoryImpl.ts`
    - Call OrgUnitHierarchyReader backend
    - Filter by user's authorization scope
    - Return hierarchical tree structure
    - _Requirements: 7.4-7.6_

  - [ ]* 10.3 Write property tests for OrgUnit tree
    - **Property 13: OrgUnit tree hierarchy rendering**
    - **Property 14: OrgUnit tree scope filtering**
    - **Validates: Requirements 7.2, 7.4, 7.5, 7.6**

  - [x] 10.4 Create OrgUnit Tree screen and ViewModel
    - Create `src/presentation/features/orgunit/screens/OrgUnitTreeScreen.tsx`
    - Create `src/presentation/features/orgunit/viewModel/useOrgUnitTreeViewModel.ts`
    - Wrap in PermissionGuard requiring `orgunit:read`
    - Use TreeView component for hierarchy rendering
    - Display OrgUnit icons based on type
    - Show member count and type badge per node
    - Implement expand/collapse with state persistence
    - Add search/filter by OrgUnit name with highlighting
    - Display loading skeleton while fetching
    - Display error state with retry
    - _Requirements: 7.1-7.12_

  - [x] 10.5 Create OrgUnit Details Panel component
    - Create `src/presentation/features/orgunit/components/OrgUnitDetailsPanel.tsx`
    - Display full name, type, path breadcrumb
    - Show member count, child count, dates
    - Include tabs: Details, Members
    - Conditionally show Edit/Delete buttons with permission
    - _Requirements: 7.8_

- [x] 11. Implement OrgUnit CRUD Operations
  - [x] 11.1 Create OrgUnit CRUD use cases
    - Create `src/core/domains/orgunit/usecases/CreateOrgUnitUseCase.ts`
    - Create `src/core/domains/orgunit/usecases/UpdateOrgUnitUseCase.ts`
    - Create `src/core/domains/orgunit/usecases/DeleteOrgUnitUseCase.ts`
    - Call OrgUnitManagementService backend
    - Validate type hierarchy on create
    - Block delete if has children or members
    - _Requirements: 8.4, 8.9_

  - [x] 11.2 Create OrgUnit Form component
    - Create `src/presentation/features/orgunit/components/OrgUnitForm.tsx`
    - Implement create mode with name and type fields
    - Filter type dropdown by parent type (ORGUNIT_TYPE_HIERARCHY)
    - Implement edit mode with name field only (type immutable)
    - Validate required fields
    - Handle success/error with toasts
    - _Requirements: 8.1-8.8_

  - [ ]* 11.3 Write property test for OrgUnit type hierarchy
    - **Property 15: OrgUnit type hierarchy enforcement**
    - **Validates: Requirements 8.3**

  - [x] 11.4 Implement OrgUnit delete with confirmation
    - Check for children and members before allowing delete
    - Display blocking error if non-empty
    - Use ConfirmDialog for empty OrgUnits
    - Refresh tree and collapse to parent on success
    - _Requirements: 8.9, 8.10_

  - [ ]* 11.5 Write property test for OrgUnit delete prevention
    - **Property 16: OrgUnit delete prevention**
    - **Validates: Requirements 8.9**

- [x] 12. Implement OrgUnit Member Assignment
  - [x] 12.1 Create OrgUnit Members Tab component
    - Create `src/presentation/features/orgunit/components/OrgUnitMembersTab.tsx`
    - Display simplified member list (name, email, role, remove action)
    - Add "Assign Members" button (permission-gated)
    - Disable "Remove from OrgUnit" at root level
    - _Requirements: 9.1-9.3, 9.8, 9.9_

  - [x] 12.2 Create Member Search Dialog component
    - Create `src/presentation/features/orgunit/components/MemberSearchDialog.tsx`
    - Allow searching by name or email
    - Filter to user's authorization scope
    - Support multi-select
    - Display current OrgUnit assignment
    - _Requirements: 9.4, 9.5_

  - [x] 12.3 Implement member assignment logic
    - Create AssignMembersToOrgUnit use case
    - Call DelegatedMembershipService.updateOrgUnit()
    - Show warning dialog for scope-changing assignments
    - Process bulk assignments with error summary
    - _Requirements: 9.6, 9.7, 9.10_

- [x] 13. Implement OrgUnit Reparenting (Move)
  - [x] 13.1 Create MoveOrgUnit use case with validation
    - Create `src/core/domains/orgunit/usecases/MoveOrgUnitUseCase.ts`
    - Implement validateMove function
    - Check: cycle prevention, type compatibility, cross-tenant block, root immovability
    - Call OrgUnitManagementService.reparent()
    - _Requirements: 10.4, 10.7, 10.8_

  - [ ]* 13.2 Write property tests for OrgUnit move validation
    - **Property 17: OrgUnit move validation - cycle prevention**
    - **Property 18: OrgUnit move validation - type compatibility**
    - **Validates: Requirements 10.4**

  - [x] 13.3 Implement drag-and-drop in OrgUnit Tree
    - Enable dragging for non-root OrgUnits with `orgunit:write`
    - Highlight valid drop targets during drag
    - Show invalid drop indicator for blocked targets
    - Display confirmation dialog showing source/target paths
    - Warn about descendant and scope effects
    - Restore tree on failure
    - _Requirements: 10.1-10.6, 10.9, 10.10_

  - [x] 13.4 Implement "Move" context menu option
    - Add context menu to OrgUnit nodes
    - Include "Move" option that opens target selection dialog
    - Provide alternative to drag-and-drop for accessibility
    - _Requirements: 10.11_

  - [x] 13.5 Register OrgUnit use cases and ViewModels in DI
    - Update DI containers with all OrgUnit use cases
    - Register useOrgUnitTreeViewModel
    - _Requirements: DI pattern per 06-di-pattern steering_

  - [ ]* 13.6 Write unit tests for OrgUnit ViewModels
    - Test tree rendering and expansion state
    - Test CRUD operations success and error paths
    - Test drag-and-drop validation logic
    - Test member assignment flows
    - _Requirements: 7.1-10.11_

- [x] 14. Checkpoint - OrgUnit Hierarchy complete
  - Ensure all tests pass, ask the user if questions arise.

---

### Phase 5: Tenant Settings

- [x] 15. Implement Tenant Settings Screen
  - [x] 15.1 Create Tenant Settings core entities and interfaces
    - Create `src/core/domains/tenant/entities/TenantProfile.ts`
    - Create `src/core/domains/tenant/entities/TenantConfiguration.ts`
    - Create `src/core/domains/tenant/entities/TenantLifecycleStatus.ts`
    - Create `src/core/domains/tenant/repositories/TenantSettingsRepository.ts`
    - _Requirements: 11.5, 12.2, 13.2_

  - [x] 15.2 Create Tenant Settings use cases
    - Create `src/core/domains/tenant/usecases/GetTenantSettingsUseCase.ts`
    - Create `src/core/domains/tenant/usecases/UpdateTenantProfileUseCase.ts`
    - Create `src/core/domains/tenant/usecases/UpdateTenantConfigUseCase.ts`
    - Create `src/core/domains/tenant/usecases/ManageTenantLifecycleUseCase.ts`
    - Create `src/infrastructure/repositories/tenant/TenantSettingsRepositoryImpl.ts`
    - _Requirements: 11.7, 12.7, 13.5-13.9_

  - [x] 15.3 Create Tenant Settings screen and ViewModel
    - Create `src/presentation/features/tenant-settings/screens/TenantSettingsScreen.tsx`
    - Create `src/presentation/features/tenant-settings/viewModel/useTenantSettingsViewModel.ts`
    - Wrap in PermissionGuard requiring `tenant:manage`
    - Implement tabbed interface: Profile, Configuration, Lifecycle
    - Display unauthorized message for insufficient permissions
    - _Requirements: 11.1-11.4, 12.1_

- [x] 16. Implement Profile Form
  - [x] 16.1 Create Profile Form component
    - Create `src/presentation/features/tenant-settings/components/ProfileForm.tsx`
    - Implement all profile fields (name, rtRwNumber, region, address, etc.)
    - Add logo upload with drag-and-drop and preview
    - Add color pickers for primary/secondary colors
    - Validate all required fields and formats
    - Track dirty state for unsaved changes warning
    - Block navigation with unsaved changes
    - _Requirements: 11.5-11.10_

- [x] 17. Implement Configuration Form
  - [x] 17.1 Create Configuration Form component
    - Create `src/presentation/features/tenant-settings/components/ConfigurationForm.tsx`
    - Display siren device ID and connection status
    - Add "Test Siren" button with confirmation dialog
    - Implement notification channel toggles (Telegram, WhatsApp, Email)
    - Add timezone dropdown (IANA timezones)
    - Add language dropdown
    - Add emergency escalation timeout input (1-10 minutes)
    - Display last update timestamp and actor
    - _Requirements: 12.2-12.10_

- [x] 18. Implement Lifecycle Panel
  - [x] 18.1 Create Lifecycle Panel component
    - Create `src/presentation/features/tenant-settings/components/LifecyclePanel.tsx`
    - Display current status with visual indicator
    - Show status transition history with timestamps/actors
    - Add "Suspend Tenant" button (ACTIVE state, tenant:manage permission)
    - Add "Reactivate Tenant" button (SUSPENDED state)
    - Add "Close Tenant" button (SUSPENDED state, PLATFORM_ADMIN only)
    - Use DestructiveConfirmationDialog for close action
    - Display visual state machine diagram
    - _Requirements: 13.1-13.11_

  - [x] 18.2 Register Tenant Settings in DI
    - Update DI containers with tenant use cases and ViewModel
    - _Requirements: DI pattern_

  - [ ]* 18.3 Write unit tests for Tenant Settings ViewModels
    - Test profile form validation and save
    - Test configuration toggle states
    - Test lifecycle state transitions and permissions
    - _Requirements: 11.1-13.11_

- [x] 19. Checkpoint - Tenant Settings complete
  - Ensure all tests pass, ask the user if questions arise.

---

### Phase 6: Subscription Management

- [x] 20. Implement Subscription Overview
  - [x] 20.1 Create Subscription core entities and interfaces
    - Create `src/core/domains/subscription/entities/SubscriptionPlan.ts`
    - Create `src/core/domains/subscription/entities/SubscriptionStatus.ts`
    - Create `src/core/domains/subscription/entities/BillingEntry.ts`
    - Create `src/core/domains/subscription/repositories/SubscriptionRepository.ts`
    - _Requirements: 14.3, 15.3_

  - [x] 20.2 Create Subscription use cases
    - Create `src/core/domains/subscription/usecases/GetSubscriptionUseCase.ts`
    - Create `src/core/domains/subscription/usecases/ChangePlanUseCase.ts`
    - Create `src/core/domains/subscription/usecases/GetBillingHistoryUseCase.ts`
    - Create `src/infrastructure/repositories/subscription/SubscriptionRepositoryImpl.ts`
    - _Requirements: 14.9, 15.5-15.8, 16.3_

  - [x] 20.3 Create Subscription screen and ViewModel
    - Create `src/presentation/features/subscription/screens/SubscriptionScreen.tsx`
    - Create `src/presentation/features/subscription/viewModel/useSubscriptionViewModel.ts`
    - Wrap in PermissionGuard requiring `tenant:manage`
    - Display current plan info (name, tier, status, billing period, trial days)
    - Display feature list with included/excluded indicators
    - Show PAST_DUE warning banner
    - Show trial countdown
    - Display usage metrics with 80% threshold warning
    - _Requirements: 14.1-14.9_

  - [ ]* 20.4 Write property test for usage warning threshold
    - **Property 19: Usage warning threshold**
    - **Validates: Requirements 14.8**

- [x] 21. Implement Plan Comparison
  - [x] 21.1 Create Plan Comparison Card component
    - Create `src/presentation/features/subscription/components/PlanComparisonCard.tsx`
    - Display plan name, price, features, limits
    - Show "Current Plan" badge
    - Add Upgrade/Downgrade buttons
    - Highlight differences from current plan
    - Stack vertically on mobile
    - _Requirements: 15.1-15.4, 15.10_

  - [x] 21.2 Implement upgrade/downgrade flow
    - Show upgrade confirmation with price difference and new features
    - Show downgrade confirmation with warnings and lost features
    - Check usage against new plan limits before downgrade
    - Hide upgrade/downgrade during trial, show "Start Subscription"
    - _Requirements: 15.5-15.9_

- [x] 22. Implement Billing History
  - [x] 22.1 Create Billing History Table component
    - Create `src/presentation/features/subscription/components/BillingHistoryTable.tsx`
    - Display columns: date, description, amount, status, invoice action
    - Color-code status (Paid green, Pending yellow, Failed red, Refunded gray)
    - Add "Download Invoice" button for paid entries
    - Add "Retry Payment" button for failed entries
    - Support pagination and date range filtering
    - Display empty state when no history
    - _Requirements: 16.1-16.11_

  - [x] 22.2 Register Subscription in DI
    - Update DI containers with subscription use cases and ViewModel
    - _Requirements: DI pattern_

  - [ ]* 22.3 Write unit tests for Subscription ViewModels
    - Test plan display and usage metrics
    - Test upgrade/downgrade confirmation flows
    - Test billing history pagination
    - _Requirements: 14.1-16.11_

- [x] 23. Checkpoint - Subscription Management complete
  - Ensure all tests pass, ask the user if questions arise.

---

### Phase 7: Audit Log

- [x] 24. Implement Audit Log Viewer
  - [x] 24.1 Create Audit core entities and interfaces
    - Create `src/core/domains/audit/entities/AuditLogEntry.ts`
    - Create `src/core/domains/audit/entities/AuditEventType.ts`
    - Create `src/core/domains/audit/entities/AuditFilters.ts`
    - Create `src/core/domains/audit/repositories/AuditRepository.ts`
    - _Requirements: 17.3, 17.9_

  - [x] 24.2 Create QueryAuditLogs use case and repository
    - Create `src/core/domains/audit/usecases/QueryAuditLogsUseCase.ts`
    - Create `src/infrastructure/repositories/audit/AuditRepositoryImpl.ts`
    - Call AuditTrailService backend
    - Filter by user's authorization scope
    - Support pagination and filtering
    - _Requirements: 17.4-17.7_

  - [x] 24.3 Create Audit Log screen and ViewModel
    - Create `src/presentation/features/audit-log/screens/AuditLogScreen.tsx`
    - Create `src/presentation/features/audit-log/viewModel/useAuditLogViewModel.ts`
    - Wrap in PermissionGuard requiring `audit:read` OR `tenant:manage`
    - Display DataTable with columns: timestamp, event type, actor, target, details, IP
    - Add tenant column for PLATFORM_ADMIN view
    - Integrate FilterPanel with date range, event types, actor search, resource filters
    - Support row expansion for full details JSON
    - Display loading indicator and empty state
    - _Requirements: 17.1-17.13_

  - [x] 24.4 Create Audit Log Table with expandable rows
    - Create `src/presentation/features/audit-log/components/AuditLogTable.tsx`
    - Implement row click to expand/collapse details
    - Display full details JSON in expanded view
    - Format timestamps according to locale
    - _Requirements: 17.12_

- [x] 25. Implement Audit Log Export
  - [x] 25.1 Create ExportAuditLogs use case
    - Create `src/core/domains/audit/usecases/ExportAuditLogsUseCase.ts`
    - Call AuditTrailService.export()
    - Support CSV and JSON formats
    - Enforce 10,000 row limit
    - _Requirements: 18.3, 18.5_

  - [x] 25.2 Create Audit Export Dialog component
    - Create `src/presentation/features/audit-log/components/AuditExportDialog.tsx`
    - Add format selection (CSV, JSON)
    - Pre-fill date range from current filter
    - Display row count warning if >10,000
    - Show progress indicator during export
    - Trigger download on completion
    - Generate filename: audit-export-{tenant}-{from}-{to}.{format}
    - _Requirements: 18.1-18.10_

  - [x] 25.3 Register Audit in DI
    - Update DI containers with audit use cases and ViewModel
    - _Requirements: DI pattern_

  - [ ]* 25.4 Write unit tests for Audit Log ViewModels
    - Test filter application and pagination
    - Test row expansion
    - Test export format options and download
    - _Requirements: 17.1-18.10_

- [x] 26. Checkpoint - Audit Log complete
  - Ensure all tests pass, ask the user if questions arise.

---

### Phase 8: Platform Admin

- [x] 27. Implement Platform Dashboard
  - [x] 27.1 Create Platform Admin core entities
    - Create `src/core/domains/platform/entities/PlatformMetrics.ts`
    - Create `src/core/domains/platform/entities/TenantOverview.ts`
    - Create `src/core/domains/platform/entities/SecurityEvent.ts`
    - Create `src/core/domains/platform/repositories/PlatformRepository.ts`
    - _Requirements: 19.3, 19.4, 21.2_

  - [x] 27.2 Create Platform use cases
    - Create `src/core/domains/platform/usecases/GetPlatformMetricsUseCase.ts`
    - Create `src/core/domains/platform/usecases/GetTenantsOverviewUseCase.ts`
    - Create `src/core/domains/platform/usecases/GetSecurityEventsUseCase.ts`
    - Create `src/infrastructure/repositories/platform/PlatformRepositoryImpl.ts`
    - Use privileged execution path for cross-tenant access
    - _Requirements: 19.3-19.11_

  - [x] 27.3 Create Platform Dashboard screen and ViewModel
    - Create `src/presentation/features/platform-admin/screens/PlatformDashboardScreen.tsx`
    - Create `src/presentation/features/platform-admin/viewModel/usePlatformDashboardViewModel.ts`
    - Require PLATFORM_ADMIN role (redirect unauthorized)
    - Display system-wide metrics cards
    - Display tenant overview table with filtering and sorting
    - Display recent alerts and warnings
    - Auto-refresh metrics every 60 seconds with indicator
    - Add "Provision New Tenant" button
    - _Requirements: 19.1-19.11_

  - [x] 27.4 Create Platform Metrics Cards component
    - Create `src/presentation/features/platform-admin/components/PlatformMetricsCards.tsx`
    - Display tenant counts by status
    - Display total members and active sessions
    - Display system health indicators (response time, latency, error rate)
    - _Requirements: 19.3_

- [x] 28. Implement Tenant Operations
  - [x] 28.1 Create Tenant Detail screen
    - Create `src/presentation/features/platform-admin/screens/TenantDetailScreen.tsx`
    - Display comprehensive tenant info (profile, subscription, lifecycle)
    - Show recent audit logs (last 100)
    - Show member count and role distribution
    - _Requirements: 20.1_

  - [x] 28.2 Create Tenant Operations component
    - Create `src/presentation/features/platform-admin/components/TenantOperations.tsx`
    - Add "Impersonate Tenant" button
    - Add "Force Suspend" button with reason input
    - Add "Force Close" button with destructive confirmation
    - Add "Reset Token Version" button with confirmation
    - Add "View Audit Trail" navigation
    - _Requirements: 20.2, 20.6-20.8_

  - [x] 28.3 Implement Impersonation flow
    - Create ImpersonateTenant use case
    - Switch admin context to selected tenant
    - Display prominent impersonation banner
    - Log impersonation start/actions/end to audit
    - Add "Exit Impersonation" button
    - Auto-expire after 30 minutes
    - _Requirements: 20.3-20.5_

  - [x] 28.4 Create Impersonation Banner component
    - Create `src/presentation/features/platform-admin/components/ImpersonationBanner.tsx`
    - Display prominently during impersonation
    - Show impersonated tenant name
    - Include "Exit Impersonation" button
    - _Requirements: 20.3, 20.4_

- [x] 29. Implement Security Events
  - [x] 29.1 Create Security Events screen
    - Create `src/presentation/features/platform-admin/screens/SecurityEventsScreen.tsx`
    - Display events from SecurityEventLogger
    - Show: timestamp, type, severity, tenant, user, details, IP
    - Support severity filtering (Critical, High, Medium, Low)
    - Display alert badge for Critical/High events
    - Support event acknowledgment
    - Display trend chart for event count over time
    - _Requirements: 21.1-21.9_

  - [x] 29.2 Create Security Events List component
    - Create `src/presentation/features/platform-admin/components/SecurityEventsList.tsx`
    - Color-code by severity
    - Add acknowledge action per event
    - Log acknowledgment with actor and timestamp
    - _Requirements: 21.5-21.7_

  - [x] 29.3 Implement threshold alert notifications
    - Configure alert thresholds
    - Send notification on threshold crossing (edge-triggered)
    - Reset when count drops below threshold
    - _Requirements: 21.9, 21.10_

  - [x] 29.4 Register Platform Admin in DI
    - Update DI containers with platform use cases and ViewModel
    - _Requirements: DI pattern_

  - [ ]* 29.5 Write unit tests for Platform Admin ViewModels
    - Test metrics refresh cycle
    - Test impersonation state management
    - Test security event acknowledgment
    - _Requirements: 19.1-21.10_

- [x] 30. Checkpoint - Platform Admin complete
  - Ensure all tests pass, ask the user if questions arise.

---

### Phase 9: Navigation & Routing

- [x] 31. Implement Route Definitions
  - [x] 31.1 Create App Router pages for administration
    - Create `src/app/(dashboard)/administration/members/page.tsx`
    - Create `src/app/(dashboard)/administration/members/invite/page.tsx`
    - Create `src/app/(dashboard)/administration/orgunit/page.tsx`
    - Create `src/app/(dashboard)/administration/settings/page.tsx`
    - Create `src/app/(dashboard)/administration/settings/profile/page.tsx`
    - Create `src/app/(dashboard)/administration/settings/config/page.tsx`
    - Create `src/app/(dashboard)/administration/settings/lifecycle/page.tsx`
    - Create `src/app/(dashboard)/administration/subscription/page.tsx`
    - Create `src/app/(dashboard)/administration/audit/page.tsx`
    - _Requirements: 25.6_

  - [x] 31.2 Create App Router pages for platform admin
    - Create `src/app/(dashboard)/admin/platform/page.tsx`
    - Create `src/app/(dashboard)/admin/security/page.tsx`
    - Create `src/app/(dashboard)/admin/tenants/page.tsx`
    - Create `src/app/(dashboard)/admin/tenants/[id]/page.tsx`
    - _Requirements: 25.6_

- [x] 32. Implement Navigation Sidebar Updates
  - [x] 32.1 Update navItems configuration
    - Modify `src/presentation/components/organisms/navItems.ts`
    - Add Membership link (`/administration/members`, requires `membership:read`)
    - Add Organization link (`/administration/orgunit`, requires `orgunit:read`)
    - Add Tenant Settings link (`/administration/settings`, requires `tenant:manage`)
    - Add Subscription link (`/administration/subscription`, requires `tenant:manage`)
    - Add Audit Log link (`/administration/audit`, requires `audit:read` OR `tenant:manage`)
    - Add Platform Dashboard link (`/admin/platform`, requires PLATFORM_ADMIN role)
    - Add All Tenants link (`/admin/tenants`, requires PLATFORM_ADMIN role)
    - Add Security Events link (`/admin/security`, requires PLATFORM_ADMIN role)
    - _Requirements: 25.1-25.3_

  - [ ]* 32.2 Write property test for navigation link visibility
    - **Property 22: Navigation link visibility**
    - **Validates: Requirements 25.3**

  - [x] 32.3 Update Sidebar component
    - Modify `src/presentation/components/organisms/Sidebar.tsx`
    - Group links by category (Membership, Organization, Settings, Platform)
    - Implement permission-based link rendering
    - Highlight active section
    - Support collapsible state
    - _Requirements: 25.1, 25.4, 25.10_

  - [x] 32.4 Create Breadcrumbs component
    - Create `src/presentation/components/molecules/Breadcrumbs.tsx`
    - Generate breadcrumbs for nested routes
    - Integrate into layout for admin screens
    - _Requirements: 25.9_

- [x] 33. Implement Middleware Protection
  - [x] 33.1 Update middleware for route protection
    - Modify `src/middleware.ts`
    - Define ROUTE_PERMISSIONS mapping
    - Define ROUTE_ROLES mapping for platform admin routes
    - Validate authorization before rendering
    - Redirect unauthorized users to unauthorized page
    - _Requirements: 25.7, 25.8_

  - [x] 33.2 Create Unauthorized page
    - Create `src/app/(dashboard)/unauthorized/page.tsx`
    - Display user-friendly unauthorized message
    - Provide navigation back to dashboard
    - _Requirements: 25.8_

  - [ ]* 33.3 Write unit tests for navigation and routing
    - Test navItems visibility based on permissions
    - Test middleware route protection
    - Test breadcrumb generation
    - _Requirements: 25.1-25.11_

- [x] 34. Checkpoint - Navigation & Routing complete
  - Ensure all tests pass, ask the user if questions arise.

---

### Phase 10: Integration & Polish

- [x] 35. Implement i18n Translations
  - [x] 35.1 Create admin translation files
    - Create `src/presentation/locales/en/admin.json`
    - Create `src/presentation/locales/id/admin.json`
    - Add all i18n keys referenced in requirements
    - Follow key naming pattern: `admin.{feature}.{screen}.{element}`
    - _Requirements: All i18n keys in 1.6-18.10_

  - [x] 35.2 Implement pluralization for counts
    - Add plural forms for member counts, selection counts, etc.
    - Ensure proper locale-based formatting
    - _Requirements: Cross-cutting i18n requirements_

- [x] 36. Implement Responsive Design
  - [x] 36.1 Verify responsive breakpoints
    - Test all screens on viewport widths 320px-2560px
    - Ensure DataTables collapse non-essential columns on mobile
    - Ensure OrgUnit Tree uses full-width layout on mobile
    - Verify touch-friendly targets (44x44px minimum)
    - _Requirements: 23.1-23.4, 23.6_

  - [x] 36.2 Implement mobile bottom navigation
    - Update BottomNav component for key admin actions on mobile
    - _Requirements: 23.5_

- [x] 37. Implement Accessibility Compliance
  - [x] 37.1 Audit and fix accessibility issues
    - Ensure all form inputs have proper labels
    - Ensure color indicators have accompanying text/icons
    - Verify keyboard navigation for all interactive elements
    - Implement focus trapping for modals
    - Add ARIA live regions for dynamic content
    - Verify alt text for all images and icons
    - Check WCAG 2.1 AA contrast ratios
    - _Requirements: 23.5-23.12_

  - [ ]* 37.2 Run automated accessibility audit
    - Integrate axe-core checks into test suite
    - Fix any identified violations
    - _Requirements: 23.12_

- [x] 38. Implement Loading and Error States
  - [x] 38.1 Verify loading states across screens
    - Ensure all screens display loading skeletons
    - Match skeleton layout to actual content
    - Verify no layout shift on load
    - _Requirements: 24.1, 24.2_

  - [x] 38.2 Verify error states across screens
    - Ensure all screens display user-friendly errors
    - Ensure retry buttons are functional
    - Verify no technical details exposed
    - Verify error logging with correlation IDs
    - _Requirements: 24.3-24.10_

- [ ] 39. Final Integration Testing
  - [ ]* 39.1 Write end-to-end tests for critical flows
    - Test tenant switching flow
    - Test member invitation flow
    - Test OrgUnit CRUD flow
    - Test subscription upgrade flow
    - Test audit log export flow
    - Test impersonation flow
    - _Requirements: All_

  - [ ]* 39.2 Run full test suite and fix issues
    - Ensure all unit tests pass
    - Ensure all property tests pass
    - Ensure all integration tests pass
    - Verify coverage meets minimum threshold (80%)
    - _Requirements: Testing per 04-testing-pattern steering_

- [x] 40. Final Checkpoint - Multi-Tenant Admin UI complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify all 25 requirements are implemented
  - Verify all 22 correctness properties are tested

---

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from design.md
- All screens follow Clean Architecture: Screen → ViewModel → UseCase → Repository
- All text uses i18n translation keys, no hardcoded strings
- Error handling follows `12-error-handling` steering document
- DI registration follows `06-di-pattern` steering document
- Testing follows `04-testing-pattern` steering document
- Security follows `05-security-guideline` steering document

### Backend Dependencies

All UI features depend on existing backend services from multi-tenant-saas-architecture:
- **MembershipResolutionService**: Member list filtering and scope
- **MembershipInvitationService**: Invite, resend, cancel invitations
- **MembershipLifecycleService**: Suspend, activate, revoke members
- **DelegatedMembershipService**: Role changes, OrgUnit assignment
- **OrgUnitManagementService**: CRUD and reparent operations
- **OrgUnitHierarchyReader**: Tree hierarchy fetching
- **TenantOnboardingService**: Profile, config, lifecycle management
- **ContextSwitchService**: Tenant/OrgUnit context switching
- **SubscriptionPlanService**: Plan viewing and changes
- **EntitlementEnforcer**: Usage limits and feature gates
- **AuditTrailService**: Audit log querying and export
- **SecurityEventLogger**: Security event logging

### Correctness Properties Covered

| Property | Requirement | Test Task |
|----------|-------------|-----------|
| 1: Tenant Switcher displays all membership fields | 1.3 | 3.2 |
| 2: Member list scope filtering (tenant admin) | 2.4 | 5.3 |
| 3: Member list scope filtering (org admin) | 2.5 | 5.3 |
| 4: Pagination correctness | 2.6 | 1.4 |
| 5: Sorting correctness | 2.7 | 1.4 |
| 6: Filter correctness | 2.8 | 5.3 |
| 7: Permission-based action visibility | 2.9 | 5.5 |
| 8: Invitation role delegation matrix | 3.4 | 6.3 |
| 9: Invitation OrgUnit scope constraint | 3.5, 3.6 | 6.3 |
| 10: Email validation | 3.7 | 6.3 |
| 11: Bulk email limit enforcement | 3.12 | 6.3 |
| 12: Member action button visibility matrix | 4.1 | 5.7 |
| 13: OrgUnit tree hierarchy rendering | 7.2 | 10.3 |
| 14: OrgUnit tree scope filtering | 7.4, 7.5, 7.6 | 10.3 |
| 15: OrgUnit type hierarchy enforcement | 8.3 | 11.3 |
| 16: OrgUnit delete prevention | 8.9 | 11.5 |
| 17: OrgUnit move validation - cycle prevention | 10.4 | 13.2 |
| 18: OrgUnit move validation - type compatibility | 10.4 | 13.2 |
| 19: Usage warning threshold | 14.8 | 20.4 |
| 20: Permission Guard - all mode | 22.3 | 1.2 |
| 21: Permission Guard - any mode | 22.4 | 1.2 |
| 22: Navigation link visibility | 25.3 | 32.2 |

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.5", "1.6", "1.7", "1.8", "1.9"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4", "3.1", "5.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "5.2", "10.1"] },
    { "id": 4, "tasks": ["3.4", "3.5", "5.3", "5.4", "10.2"] },
    { "id": 5, "tasks": ["3.6", "5.5", "5.6", "10.3", "10.4", "10.5"] },
    { "id": 6, "tasks": ["5.7", "6.1", "7.1", "11.1"] },
    { "id": 7, "tasks": ["6.2", "7.2", "8.1", "11.2", "12.1"] },
    { "id": 8, "tasks": ["6.3", "8.2", "8.3", "11.3", "11.4", "12.2", "12.3"] },
    { "id": 9, "tasks": ["8.4", "11.5", "13.1", "15.1"] },
    { "id": 10, "tasks": ["13.2", "13.3", "13.4", "13.5", "15.2", "15.3"] },
    { "id": 11, "tasks": ["13.6", "16.1", "17.1", "18.1", "20.1"] },
    { "id": 12, "tasks": ["18.2", "18.3", "20.2", "20.3"] },
    { "id": 13, "tasks": ["20.4", "21.1", "24.1"] },
    { "id": 14, "tasks": ["21.2", "22.1", "24.2", "24.3", "24.4"] },
    { "id": 15, "tasks": ["22.2", "22.3", "25.1", "25.2", "27.1"] },
    { "id": 16, "tasks": ["25.3", "25.4", "27.2", "27.3", "27.4"] },
    { "id": 17, "tasks": ["28.1", "28.2", "29.1"] },
    { "id": 18, "tasks": ["28.3", "28.4", "29.2", "29.3", "29.4"] },
    { "id": 19, "tasks": ["29.5", "31.1", "31.2"] },
    { "id": 20, "tasks": ["32.1", "33.1"] },
    { "id": 21, "tasks": ["32.2", "32.3", "32.4", "33.2"] },
    { "id": 22, "tasks": ["33.3", "35.1", "35.2"] },
    { "id": 23, "tasks": ["36.1", "36.2", "37.1"] },
    { "id": 24, "tasks": ["37.2", "38.1", "38.2"] },
    { "id": 25, "tasks": ["39.1", "39.2"] }
  ]
}
```
