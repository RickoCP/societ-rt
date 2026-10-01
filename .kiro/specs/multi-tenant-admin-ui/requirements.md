# Requirements Document

## Introduction

This document specifies the comprehensive requirements for the **Multi-Tenant Admin UI** feature set for SocieT-RT. This feature builds upon the existing multi-tenant-saas-architecture backend services (see `.kiro/specs/multi-tenant-saas-architecture/`) to provide a complete administrative user interface for:

1. **Tenant Switching** — Users with multiple memberships can switch between tenants/org units
2. **Membership Management** — Invite, suspend, activate, revoke members with role management
3. **OrgUnit Hierarchy Management** — Tree view, CRUD, and member assignment for organizational units
4. **Tenant Settings** — Profile, configuration, and lifecycle management
5. **Subscription Management** — Plan viewing, comparison, and upgrade/downgrade
6. **Audit Log Viewing** — Filterable, exportable audit trail viewer
7. **Platform Admin Dashboard** — Cross-tenant overview and system health

**Technical Constraints:**
- All screens follow Clean Architecture: Screen → ViewModel → UseCase → Repository
- No API calls directly in components
- All text uses i18n translation keys
- State management: Zustand for UI state, React Query for server state
- Authorization checks at UI level (graceful degradation for unauthorized access)
- Error handling follows `12-error-handling` steering

**Backend Dependencies:**
All features leverage existing backend services from multi-tenant-saas-architecture:
- MembershipResolutionService, MembershipInvitationService, MembershipLifecycleService, DelegatedMembershipService
- TenantOnboardingService, ContextSwitchService
- OrgUnitManagementService, OrgUnitHierarchyReader
- PermissionRegistry, AuthorizationContext
- SubscriptionPlanService, EntitlementEnforcer
- AuditTrailService, SecurityEventLogger

---

## Glossary

- **System**: The Multi-Tenant Admin UI application
- **Tenant_Switcher**: UI component allowing users to switch active tenant/OrgUnit context
- **Member_List**: Screen displaying all members within current tenant/OrgUnit scope
- **Member_Card**: UI component displaying individual member information and actions
- **Invitation_Form**: Form component for inviting new members via email
- **OrgUnit_Tree**: Tree visualization component for organizational hierarchy
- **OrgUnit_Node**: Individual node in the OrgUnit tree with actions
- **Tenant_Settings_Form**: Form for editing tenant profile and configuration
- **Plan_Comparison_Card**: UI component displaying subscription plan features side-by-side
- **Audit_Log_Table**: Filterable table displaying audit trail entries
- **Filter_Panel**: Reusable component for date range, event type, and actor filtering
- **Platform_Dashboard**: Admin-only dashboard with cross-tenant metrics
- **ViewModel**: Presentation layer orchestration component using React Query
- **Permission_Guard**: Component that conditionally renders based on user permissions
- **DataTable**: Existing reusable table component with pagination and sorting
- **Effective_Administrator**: User who can administer a scope either directly or via authorized ancestor scope
- **Delegation_Matrix**: Configuration of which roles can grant which other roles

---

## Requirements

---

### Requirement 1: Tenant Switcher Component

**User Story:** As a user with multiple tenant memberships, I want to switch between tenants and organizational units from the header, so that I can work in the appropriate context without logging out.

#### Acceptance Criteria

1. THE System SHALL display a Tenant_Switcher component in the application header showing the current active tenant name and OrgUnit name (if applicable)
2. WHEN the user clicks on the Tenant_Switcher, THE System SHALL display a dropdown with all tenants where the user has an ACTIVE membership
3. THE Tenant_Switcher dropdown SHALL display for each tenant: tenant name, user's role in that tenant, and the tenant logo (if available)
4. WHEN the user has multiple memberships within the same tenant, THE System SHALL display each membership as a separate entry showing the OrgUnit name and role
5. WHEN the user selects a different tenant/OrgUnit, THE System SHALL call the ContextSwitchService and issue a new access token
6. IF the context switch succeeds, THEN THE System SHALL reload the current page to reflect the new context and display a success toast message using i18n key `tenant_switcher.switch_success`
7. IF the context switch fails, THEN THE System SHALL display an error message using i18n key `tenant_switcher.switch_error` and maintain the current context
8. THE Tenant_Switcher SHALL display a visual indicator (checkmark or highlight) for the currently active tenant/OrgUnit
9. WHERE the user has only one membership, THE Tenant_Switcher SHALL display the current tenant name but disable switching functionality
10. THE Tenant_Switcher SHALL be keyboard accessible with arrow key navigation and Enter to select

#### Security Considerations
- Context switch validation performed server-side by ContextSwitchService
- New JWT issued only after successful validation
- Failed switches do not modify session state

#### Testing Considerations
- Unit test: ViewModel correctly fetches and displays user's memberships
- Unit test: Context switch calls correct service with correct parameters
- Unit test: Error states display appropriate i18n messages
- Integration test: Full context switch flow with token refresh

---

### Requirement 2: Membership List Screen

**User Story:** As a tenant administrator, I want to view all members in my tenant or OrgUnit scope, so that I can manage the community membership effectively.

#### Acceptance Criteria

1. THE System SHALL display a Member_List screen accessible from the administration navigation menu
2. THE Member_List SHALL display members in a DataTable with columns: name, email, role, OrgUnit (if org-scoped), status, and joined date
3. THE Member_List SHALL fetch members using MembershipResolutionService filtered by the user's current authorization scope
4. WHEN the user is a tenant-level admin (PLATFORM_ADMIN, TENANT_OWNER), THE Member_List SHALL display all members across all OrgUnits in the tenant
5. WHEN the user is an org-scoped admin (ORG_ADMIN, RT_ADMIN), THE Member_List SHALL display only members within their OrgUnit scope and descendants
6. THE Member_List SHALL support pagination with configurable page size (10, 25, 50, 100 per page)
7. THE Member_List SHALL support sorting by any column (ascending/descending)
8. THE Member_List SHALL support filtering by: role (dropdown), status (ACTIVE, SUSPENDED, INVITED, REVOKED), and text search on name/email
9. WHEN the user has `membership:write` permission, THE System SHALL display action buttons for each member row
10. THE Member_List SHALL display a loading skeleton while data is being fetched
11. IF the fetch fails, THEN THE System SHALL display an error message using i18n key `member_list.fetch_error` with a retry button
12. THE Member_List SHALL display an empty state with i18n key `member_list.empty` when no members match the current filters

#### Security Considerations
- OrgUnit scope filtering enforced server-side by MembershipResolutionService
- UI displays only members within authorized scope
- Action buttons conditionally rendered based on permissions

#### Testing Considerations
- Unit test: ViewModel correctly applies scope filtering
- Unit test: Pagination, sorting, and filtering work correctly
- Unit test: Empty state and error state render correctly
- Property test: For any user scope, displayed members are subset of scope's valid members

---

### Requirement 3: Member Invitation Flow

**User Story:** As a tenant administrator, I want to invite new members via email, so that I can onboard new community members to the platform.

#### Acceptance Criteria

1. WHEN the user has `membership:delegate` permission, THE Member_List screen SHALL display an "Invite Member" button
2. WHEN the user clicks "Invite Member", THE System SHALL display an Invitation_Form modal/drawer
3. THE Invitation_Form SHALL include fields: email address (required), role selection (required), OrgUnit assignment (required for org-scoped roles)
4. THE Invitation_Form role dropdown SHALL display ONLY roles that the current user can delegate according to the Delegation_Matrix:
   - TENANT_OWNER can delegate: ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT
   - ORG_ADMIN can delegate: RT_ADMIN, SECURITY, RESIDENT
   - RT_ADMIN can delegate: SECURITY, RESIDENT
5. THE Invitation_Form OrgUnit dropdown SHALL display only OrgUnits within the user's current authorization scope
6. WHEN the user is an org-scoped admin, THE Invitation_Form SHALL pre-select their current OrgUnit and allow selection of descendant OrgUnits only
7. THE Invitation_Form SHALL validate email format client-side before submission
8. WHEN the user submits a valid invitation, THE System SHALL call MembershipInvitationService.invite()
9. IF the invitation succeeds, THEN THE System SHALL close the Invitation_Form and display success toast with i18n key `invitation.sent_success`; THE System SHALL NOT automatically refresh the Member_List (user may manually refresh to see new INVITED member)
10. IF the invitation fails due to duplicate email, THEN THE System SHALL display error using i18n key `invitation.duplicate_email`
11. IF the invitation fails for other reasons, THEN THE System SHALL display error using i18n key `invitation.send_error`
12. THE Invitation_Form SHALL support bulk invitation by pasting multiple emails (one per line), limited to 50 invitations per batch

#### Security Considerations
- Delegation matrix enforced server-side by DelegatedMembershipService
- OrgUnit scope validated against user's authorization context
- Email validation to prevent malicious input

#### Testing Considerations
- Unit test: Role dropdown filters based on delegation matrix
- Unit test: OrgUnit dropdown filters based on user scope
- Unit test: Bulk invitation parsing and validation
- Integration test: End-to-end invitation flow

---

### Requirement 4: Member Status Management

**User Story:** As a tenant administrator, I want to suspend, activate, or revoke member access, so that I can manage membership lifecycle appropriately.

#### Acceptance Criteria

1. WHEN viewing a member in the Member_List, THE System SHALL display status-specific action buttons based on current member status:
   - ACTIVE members: Show "Suspend" button
   - SUSPENDED members: Show "Activate" and "Revoke" buttons
   - INVITED members: Show "Resend Invitation" and "Cancel Invitation" buttons
2. WHEN the user has `membership:write` permission AND the target member role is within their delegation scope, THE action buttons SHALL be enabled
3. WHEN the user clicks "Suspend", THE System SHALL:
   - Display confirmation dialog with i18n key `member_actions.suspend_confirm`
   - Require the user to enter a suspension reason (optional text field)
   - Call MembershipLifecycleService.suspend() on confirmation
4. WHEN the user clicks "Activate", THE System SHALL:
   - Display confirmation dialog with i18n key `member_actions.activate_confirm`
   - Call MembershipLifecycleService.activate() on confirmation
5. WHEN the user clicks "Revoke", THE System SHALL:
   - Display confirmation dialog with i18n key `member_actions.revoke_confirm` with warning that this action is irreversible
   - Require the user to type "REVOKE" to confirm (safety measure)
   - Call MembershipLifecycleService.revoke() on confirmation
6. WHEN the user clicks "Resend Invitation", THE System SHALL call MembershipInvitationService.resend() and display success/error toast
7. WHEN the user clicks "Cancel Invitation", THE System SHALL display confirmation and call MembershipInvitationService.cancel() on confirmation
8. IF any status change succeeds, THEN THE System SHALL refresh the Member_List to reflect the new status
9. IF any status change fails, THEN THE System SHALL display the error message from the service using appropriate i18n keys
10. THE System SHALL NOT allow users to modify their own membership status (self-suspension/revocation prevention)
11. THE System SHALL NOT display action buttons for members with roles strictly above the current user's delegation scope; members with roles at the boundary level of the user's maximum manageable role SHALL have action buttons displayed

#### Security Considerations
- Delegation matrix enforced server-side
- Users cannot modify own membership
- Revoke confirmation pattern prevents accidental removal
- All status changes logged to audit trail

#### Testing Considerations
- Unit test: Action buttons rendered based on status and permissions
- Unit test: Confirmation dialogs display correct i18n content
- Unit test: Self-modification prevention
- Integration test: Full status change flow with audit logging

---

### Requirement 5: Member Role Change

**User Story:** As a tenant administrator, I want to change a member's role, so that I can adjust their permissions as responsibilities change.

#### Acceptance Criteria

1. WHEN the user clicks on a member row or dedicated "Edit" button, THE System SHALL display a Member_Card modal/drawer with member details
2. THE Member_Card SHALL display: profile picture (or initials avatar), name, email, current role, current OrgUnit, status, and membership dates
3. WHEN the user has `membership:write` permission, THE Member_Card SHALL include an editable role dropdown; WHEN the user lacks `membership:write` permission, THE Member_Card SHALL display the current role as non-editable plain text WITHOUT the dropdown
4. THE role dropdown SHALL display ONLY roles that the current user can delegate according to the Delegation_Matrix
5. THE role dropdown SHALL NOT include the user's current role (no same-to-same change)
6. WHEN a new role is selected, THE System SHALL:
   - If new role is org-scoped (RT_ADMIN, SECURITY, RESIDENT), require OrgUnit selection
   - If new role is tenant-level (ORG_ADMIN), allow null OrgUnit
7. WHEN the user saves role change, THE System SHALL call DelegatedMembershipService.changeRole()
8. IF the role change succeeds, THEN THE System SHALL display success toast and refresh the Member_List
9. IF the role change fails due to delegation violation, THEN THE System SHALL display error using i18n key `member_role.delegation_error`
10. IF the role change fails for other reasons, THEN THE System SHALL display error using i18n key `member_role.change_error`
11. THE Member_Card SHALL display a change history section showing previous role changes with timestamps and actors

#### Security Considerations
- Role changes validated against delegation matrix server-side
- Change history provides audit trail visibility
- OrgUnit assignment validated against user scope

#### Testing Considerations
- Unit test: Role dropdown filters based on delegation matrix
- Unit test: OrgUnit selection appears for org-scoped roles
- Unit test: Change history renders correctly
- Integration test: Full role change flow with validation

---

### Requirement 6: Bulk Membership Operations

**User Story:** As a tenant administrator, I want to perform bulk operations on multiple members, so that I can efficiently manage large numbers of memberships.

#### Acceptance Criteria

1. THE Member_List SHALL include a selection checkbox column for bulk selection
2. WHEN one or more members are selected, THE System SHALL display a bulk actions toolbar with available operations
3. THE bulk actions toolbar SHALL display: number of selected members and available action buttons
4. THE bulk actions SHALL include:
   - "Bulk Suspend" - for ACTIVE members only
   - "Bulk Activate" - for SUSPENDED members only
   - "Bulk Change Role" - opens role selection dialog
   - "Export Selected" - exports selected members to CSV
5. WHEN members with mixed statuses are selected, THE System SHALL only enable actions applicable to all selected members
6. WHEN the user initiates a bulk operation, THE System SHALL:
   - Display confirmation dialog showing count of affected members
   - Process operations sequentially, showing progress indicator
   - Display summary of successes and failures after completion
7. IF any operation in a bulk action fails, THE System SHALL continue processing remaining items and display a detailed error report
8. THE bulk operation SHALL be limited to 100 members per batch to prevent timeout
9. IF bulk selection exceeds 100 members, THE System SHALL display warning and disable bulk actions with i18n key `member_bulk.limit_exceeded`

#### Security Considerations
- Each individual operation validated against delegation matrix
- Partial failures do not rollback successful operations
- Batch size limit prevents denial-of-service
- All bulk operations logged to audit trail as single batch event

#### Testing Considerations
- Unit test: Selection state management
- Unit test: Action availability based on selected member statuses
- Unit test: Progress indicator and error report rendering
- Integration test: Bulk operation with mixed success/failure

---

### Requirement 7: OrgUnit Hierarchy Tree View

**User Story:** As a tenant administrator, I want to view the organizational hierarchy as a tree, so that I can understand and navigate the community structure.

#### Acceptance Criteria

1. THE System SHALL display an OrgUnit_Tree screen accessible from the administration navigation menu
2. THE OrgUnit_Tree SHALL render the organizational hierarchy using a collapsible tree component
3. EACH OrgUnit_Node in the tree SHALL display: icon (based on OrgUnit type), name, member count, and type badge (ORGANIZATION, CLUSTER, RW, RT)
4. THE OrgUnit_Tree SHALL fetch hierarchy data using OrgUnitHierarchyReader filtered by user's authorization scope
5. WHEN the user is a tenant-level admin, THE OrgUnit_Tree SHALL display the complete tenant hierarchy
6. WHEN the user is an org-scoped admin, THE OrgUnit_Tree SHALL display only their OrgUnit and its descendants
7. THE OrgUnit_Tree SHALL be expandable/collapsible at each level with visual expand/collapse indicators
8. WHEN the user clicks on an OrgUnit_Node, THE System SHALL display a details panel showing: full name, type, path breadcrumb, member count, child count, created date, and last updated date
9. THE OrgUnit_Tree SHALL support search/filter by OrgUnit name with highlighting of matching nodes
10. THE OrgUnit_Tree SHALL maintain expand/collapse state when navigating away and returning
11. THE OrgUnit_Tree SHALL display loading skeletons while data is being fetched
12. IF the hierarchy fetch fails, THEN THE System SHALL display error with i18n key `orgunit_tree.fetch_error` and retry button

#### Security Considerations
- Hierarchy scope filtered server-side by OrgUnitHierarchyReader
- Member counts aggregated server-side to prevent data leakage

#### Testing Considerations
- Unit test: Tree rendering with nested levels
- Unit test: Expand/collapse state management
- Unit test: Search filtering and highlighting
- Property test: Displayed hierarchy is subset of authorized scope

---

### Requirement 8: OrgUnit CRUD Operations

**User Story:** As a tenant administrator, I want to create, edit, and delete organizational units, so that I can maintain the community structure as it evolves.

#### Acceptance Criteria

1. WHEN the user has `orgunit:write` permission, THE OrgUnit_Tree SHALL display "Add Child" button on each OrgUnit_Node
2. WHEN the user clicks "Add Child", THE System SHALL display a Create OrgUnit form with fields: name (required), type (auto-suggested based on parent type)
3. THE OrgUnit type dropdown SHALL only allow valid child types:
   - ORGANIZATION can have CLUSTER children
   - CLUSTER can have RW children
   - RW can have RT children
   - RT cannot have children
4. WHEN the user submits the Create OrgUnit form, THE System SHALL call OrgUnitManagementService.create()
5. IF OrgUnit creation succeeds, THEN THE System SHALL refresh the tree and auto-expand to show the new node
6. WHEN the user has `orgunit:write` permission, THE OrgUnit details panel SHALL include "Edit" and "Delete" buttons
7. WHEN the user clicks "Edit", THE System SHALL display an Edit OrgUnit form with pre-filled name field
8. THE Edit OrgUnit form SHALL NOT allow changing the OrgUnit type (type is immutable after creation)
9. WHEN the user clicks "Delete", THE System SHALL first check if the OrgUnit has children or members; IF the OrgUnit has any children or members, THEN THE System SHALL display a blocking error with i18n key `orgunit.delete_has_children` and SHALL NOT proceed with deletion; IF the OrgUnit has no children AND no members, THEN THE System SHALL display confirmation dialog with i18n key `orgunit.delete_confirm` and call OrgUnitManagementService.delete() on confirmation
10. IF OrgUnit deletion succeeds, THEN THE System SHALL refresh the tree and collapse to parent node
11. IF any OrgUnit operation fails, THEN THE System SHALL display error using appropriate i18n keys

#### Security Considerations
- Write permission checked at UI level; enforced server-side
- OrgUnit type immutability prevents hierarchy corruption
- Delete prevented for OrgUnits with children/members

#### Testing Considerations
- Unit test: Type dropdown filters based on parent type
- Unit test: Delete prevention for non-empty OrgUnits
- Unit test: Form validation for required fields
- Integration test: Full CRUD cycle for OrgUnit

---

### Requirement 9: OrgUnit Member Assignment

**User Story:** As a tenant administrator, I want to assign members to organizational units, so that I can organize the community hierarchy correctly.

#### Acceptance Criteria

1. THE OrgUnit details panel SHALL include a "Members" tab showing members directly assigned to that OrgUnit
2. THE Members tab SHALL display a simplified member list with: name, email, role, and "Remove from OrgUnit" action
3. WHEN the user has `membership:write` permission, THE Members tab SHALL include an "Assign Members" button
4. WHEN the user clicks "Assign Members", THE System SHALL display a member search dialog
5. THE member search dialog SHALL:
   - Allow searching members by name or email
   - Show only members within the user's authorization scope
   - Allow multi-select of members to assign
   - Display current OrgUnit assignment for each member
6. WHEN the user confirms member assignment, THE System SHALL call DelegatedMembershipService.updateOrgUnit() for each selected member
7. IF assignment changes the member's scope to outside current user's scope, THE System SHALL display an informational warning dialog; WHEN the user acknowledges or dismisses the warning, THE System SHALL proceed with the assignment without requiring additional confirmation
8. THE "Remove from OrgUnit" action SHALL reassign the member to the parent OrgUnit (not remove membership entirely)
9. IF a member is at the root OrgUnit, THE "Remove from OrgUnit" action SHALL be disabled
10. IF any assignment operation fails, THE System SHALL display error summary and continue processing remaining members

#### Security Considerations
- OrgUnit assignment validated against user's authorization scope
- Warning for scope-changing operations prevents accidental access loss
- Remove action reassigns rather than revokes to prevent data loss

#### Testing Considerations
- Unit test: Member search filtering and multi-select
- Unit test: Scope warning dialog trigger conditions
- Unit test: Remove action disabled at root level
- Integration test: Bulk member assignment flow

---

### Requirement 10: OrgUnit Reparenting (Move)

**User Story:** As a tenant administrator, I want to move organizational units to different parents, so that I can reorganize the community structure when needed.

#### Acceptance Criteria

1. WHEN the user has `orgunit:write` permission AND the OrgUnit is not a root, THE OrgUnit_Node SHALL be draggable
2. THE OrgUnit_Tree SHALL support drag-and-drop for reparenting OrgUnits
3. WHEN dragging an OrgUnit, THE System SHALL highlight valid drop targets (OrgUnits that can accept children of the dragged type)
4. THE System SHALL prevent all of the following invalid moves and display appropriate error messages:
   - Moving an OrgUnit to any of its descendants (cycle prevention) → error i18n key `orgunit.move_cycle_error`
   - Moving an OrgUnit to a parent with incompatible type (type hierarchy: ORGANIZATION > CLUSTER > RW > RT) → error i18n key `orgunit.move_type_error`
   - Moving an OrgUnit to a different tenant (cross-tenant blocked) → error i18n key `orgunit.move_cross_tenant_error`
   - Moving a root OrgUnit (root OrgUnits cannot be moved) → error i18n key `orgunit.move_root_error`
5. WHEN the user drops an OrgUnit on a valid target, THE System SHALL display confirmation dialog showing: source path, target path, and count of affected descendants
6. THE confirmation dialog SHALL warn that all descendants will also be moved and member scopes may be affected
7. WHEN the user confirms the move, THE System SHALL call OrgUnitManagementService.reparent()
8. THE reparent operation SHALL update all descendant paths atomically
9. IF the reparent succeeds, THEN THE System SHALL refresh the tree with the new structure
10. IF the reparent fails, THEN THE System SHALL display error with i18n key `orgunit.reparent_error` and restore tree to previous state
11. THE OrgUnit_Tree SHALL also support a "Move" context menu action that opens a target selection dialog as alternative to drag-and-drop

#### Security Considerations
- Cross-tenant moves blocked server-side
- Cycle detection prevents hierarchy corruption
- Atomic path updates ensure consistency
- Move operation logged to audit trail

#### Testing Considerations
- Unit test: Valid drop target highlighting
- Unit test: Invalid move prevention (cycle, type, cross-tenant)
- Unit test: Confirmation dialog content calculation
- Integration test: Reparent operation with descendants

---

### Requirement 11: Tenant Settings Profile

**User Story:** As a tenant owner, I want to edit my tenant's profile information, so that I can keep the community identity and branding up to date.

#### Acceptance Criteria

1. THE System SHALL display a Tenant_Settings screen accessible from the administration navigation menu
2. THE Tenant_Settings screen SHALL require `tenant:manage` permission to access
3. IF the user lacks permission, THE System SHALL display unauthorized message with i18n key `tenant_settings.unauthorized`
4. THE Tenant_Settings screen SHALL display a tabbed interface with sections: Profile, Configuration, Lifecycle
5. THE Profile tab SHALL include an editable Tenant_Settings_Form with fields:
   - Tenant name (required, max 100 characters)
   - RT/RW number (required, validated format)
   - Region (required, dropdown of valid regions)
   - Address (required, max 500 characters)
   - Contact person name (required, max 100 characters)
   - Logo upload (optional, max 2MB, jpg/png only)
   - Primary color (optional, color picker)
   - Secondary color (optional, color picker)
6. THE Logo upload SHALL display current logo preview and support drag-and-drop
7. WHEN the user saves Profile changes, THE System SHALL call TenantOnboardingService.updateProfile()
8. IF Profile update succeeds, THEN THE System SHALL display success toast with i18n key `tenant_settings.profile_saved`
9. IF Profile update fails validation, THE System SHALL highlight invalid fields with error messages
10. THE Profile form SHALL track dirty state; WHEN the user attempts to navigate away with unsaved changes, THE System SHALL display a blocking confirmation dialog that halts navigation until the user explicitly chooses to discard changes and navigate away OR cancel navigation and remain on the form

#### Security Considerations
- Permission check at page load; enforced server-side
- File upload size and type restrictions
- Input sanitization for all text fields

#### Testing Considerations
- Unit test: Form validation for all fields
- Unit test: Dirty state tracking and navigation warning
- Unit test: Logo upload preview and validation
- Integration test: Profile save and refresh

---

### Requirement 12: Tenant Configuration Settings

**User Story:** As a tenant owner, I want to configure tenant-specific settings, so that I can customize the platform behavior for my community.

#### Acceptance Criteria

1. THE Configuration tab in Tenant_Settings SHALL display configurable tenant options
2. THE Configuration options SHALL include:
   - Siren device configuration (device ID, connection status)
   - Notification preferences (channels enabled: Telegram, WhatsApp, Email)
   - Timezone setting (dropdown of IANA timezones)
   - Language preference (dropdown of supported languages)
   - Emergency escalation timeout (number input, 1-10 minutes, default 2)
3. THE Siren device section SHALL display current connection status (Connected/Disconnected/Unknown)
4. THE Siren device section SHALL include a "Test Siren" button that triggers a brief test activation
5. WHEN the user clicks "Test Siren", THE System SHALL display confirmation dialog; WHEN the user confirms, THE System SHALL call IoTService.testDevice() atomically with the confirmation; IF the IoT call fails, THE System SHALL NOT report the test as executed and SHALL display error with i18n key `tenant_settings.siren_test_failed`
6. THE Notification preferences SHALL show toggle switches for each notification channel
7. WHEN any configuration is changed, THE System SHALL call TenantOnboardingService.updateConfiguration()
8. IF Configuration update succeeds, THEN THE System SHALL display success toast with i18n key `tenant_settings.config_saved`
9. THE Configuration form SHALL validate emergency timeout is within 1-10 minute range
10. THE Configuration tab SHALL display last configuration update timestamp and actor

#### Security Considerations
- Siren test requires explicit confirmation to prevent abuse
- Configuration changes logged to audit trail
- Timeout values bounded to prevent misconfiguration

#### Testing Considerations
- Unit test: Toggle switches state management
- Unit test: Timeout validation bounds
- Unit test: Siren test confirmation flow
- Integration test: Configuration save and validation

---

### Requirement 13: Tenant Lifecycle Management

**User Story:** As a tenant owner or platform admin, I want to manage tenant lifecycle status, so that I can suspend, reactivate, or close tenants as needed.

#### Acceptance Criteria

1. THE Lifecycle tab in Tenant_Settings SHALL display current lifecycle status with visual indicator
2. THE Lifecycle status SHALL display one of: PROVISIONING, ACTIVE, SUSPENDED, CLOSING, CLOSED, PURGED
3. THE Lifecycle tab SHALL display status transition history with timestamps and actors
4. WHEN the tenant status is ACTIVE AND the user has `tenant:manage` permission, THE System SHALL display "Suspend Tenant" button
5. WHEN the user clicks "Suspend Tenant", THE System SHALL:
   - Display confirmation dialog requiring suspension reason
   - Warn that all non-emergency operations will be blocked
   - Call TenantOnboardingService.suspend() on confirmation
6. WHEN the tenant status is SUSPENDED AND the user has `tenant:manage` permission, THE System SHALL display "Reactivate Tenant" button
7. WHEN the user clicks "Reactivate Tenant", THE System SHALL call TenantOnboardingService.reactivate() with confirmation
8. WHEN the user is PLATFORM_ADMIN AND tenant status is SUSPENDED, THE System SHALL display "Close Tenant" button
9. WHEN the user clicks "Close Tenant", THE System SHALL:
   - Display confirmation dialog with strong warning about data access loss
   - Require typing "CLOSE" and tenant name to confirm
   - Call TenantOnboardingService.close() on confirmation
10. THE System SHALL NOT display lifecycle management actions for CLOSING, CLOSED, or PURGED statuses (terminal states)
11. THE Lifecycle tab SHALL display a visual state machine diagram showing possible transitions from current state

#### Security Considerations
- Close operation restricted to PLATFORM_ADMIN
- Strong confirmation patterns for destructive actions
- All lifecycle changes logged with actor and reason
- Emergency access maintained during SUSPENDED state (per L10)

#### Testing Considerations
- Unit test: Button visibility based on status and permissions
- Unit test: Confirmation dialog requirements
- Unit test: State machine diagram rendering
- Integration test: Full suspend/reactivate cycle

---

### Requirement 14: Subscription Plan Overview

**User Story:** As a tenant owner, I want to view my current subscription plan and its features, so that I can understand what capabilities are available to my community.

#### Acceptance Criteria

1. THE System SHALL display a Subscription_Management screen accessible from the administration navigation menu
2. THE Subscription_Management screen SHALL require `tenant:manage` permission to access
3. THE Subscription_Management screen SHALL display current plan information:
   - Plan name and tier (Basic, Standard, Pro)
   - Subscription status (TRIAL, ACTIVE, PAST_DUE, SUSPENDED, CLOSED)
   - Current billing period start and end dates
   - Days remaining in trial (if applicable)
   - Feature list with availability indicators
4. THE feature list SHALL clearly indicate which features are included (checkmark) vs. not included (X) in current plan
5. WHEN subscription status is PAST_DUE, THE System SHALL display warning banner with i18n key `subscription.past_due_warning`
6. WHEN subscription status is TRIAL, THE System SHALL display countdown of remaining trial days
7. THE Subscription_Management screen SHALL display current usage metrics against plan limits:
   - Member count / max members
   - OrgUnit count / max OrgUnits
   - Storage used / max storage
8. WHEN usage exceeds 80% of any limit, THE System SHALL highlight that metric with warning color
9. THE Subscription_Management screen SHALL fetch data from SubscriptionPlanService and EntitlementEnforcer

#### Security Considerations
- Subscription data fetched from server (not cached in JWT)
- Usage metrics calculated server-side
- Plan details visible only to authorized users

#### Testing Considerations
- Unit test: Feature list rendering with availability indicators
- Unit test: Usage metric warning thresholds
- Unit test: Status-specific banner display
- Integration test: Full subscription data fetch and display

---

### Requirement 15: Plan Comparison and Upgrade

**User Story:** As a tenant owner, I want to compare subscription plans and upgrade/downgrade, so that I can choose the right plan for my community's needs.

#### Acceptance Criteria

1. THE Subscription_Management screen SHALL include a "Compare Plans" section
2. THE Compare Plans section SHALL display Plan_Comparison_Cards for all available plans side-by-side
3. EACH Plan_Comparison_Card SHALL display:
   - Plan name and price
   - Feature list with checkmarks for included features
   - Key limits (members, OrgUnits, storage)
   - "Current Plan" badge for the active plan
   - "Upgrade" or "Downgrade" button for other plans
4. THE Plan_Comparison_Cards SHALL highlight differences from current plan
5. WHEN the user clicks "Upgrade", THE System SHALL:
   - Display upgrade confirmation dialog showing price difference
   - List new features that will become available
   - Call SubscriptionPlanService.upgrade() on confirmation
6. WHEN the user clicks "Downgrade", THE System SHALL:
   - Display downgrade confirmation dialog with warnings
   - List features that will be lost
   - Check if current usage exceeds new plan limits and display error if so
   - Call SubscriptionPlanService.downgrade() on confirmation
7. IF plan change succeeds, THEN THE System SHALL display success toast and refresh the page
8. IF plan change fails, THEN THE System SHALL display error message with details
9. WHEN subscription status is TRIAL, THE System SHALL hide the "Upgrade" and "Downgrade" buttons entirely and SHALL display a "Start Subscription" button in their place that initiates the subscription onboarding flow
10. THE Plan_Comparison_Cards SHALL be responsive and stack vertically on mobile viewports

#### Security Considerations
- Plan changes validated server-side
- Downgrade blocked if usage exceeds new limits
- Payment processing handled by external payment gateway
- Plan change logged to audit trail

#### Testing Considerations
- Unit test: Plan comparison card rendering
- Unit test: Feature difference highlighting
- Unit test: Downgrade limit validation
- Integration test: Upgrade flow with payment

---

### Requirement 16: Billing History

**User Story:** As a tenant owner, I want to view my billing history, so that I can track past payments and download invoices.

#### Acceptance Criteria

1. THE Subscription_Management screen SHALL include a "Billing History" section
2. THE Billing History section SHALL display a table with columns: date, description, amount, status, and invoice action
3. THE Billing History table SHALL fetch data from SubscriptionPlanService.getBillingHistory()
4. THE status column SHALL display: Paid (green), Pending (yellow), Failed (red), Refunded (gray)
5. THE invoice action SHALL include "Download Invoice" button for each paid entry
6. WHEN the user clicks "Download Invoice", THE System SHALL trigger a PDF download of the invoice
7. THE Billing History table SHALL support pagination (10 entries per page default)
8. THE Billing History table SHALL support date range filtering
9. IF no billing history exists, THE System SHALL display empty state with i18n key `billing.empty_history`
10. WHEN payment status is Failed, THE System SHALL display "Retry Payment" action
11. WHEN the user clicks "Retry Payment", THE System SHALL automatically retry the charge using the existing payment method on file without requiring the user to re-enter payment details; IF the retry fails, THE System SHALL display error with i18n key `billing.retry_failed` and option to update payment method

#### Security Considerations
- Invoice downloads use signed URLs with short TTL
- Payment retry requires re-authentication
- Billing data visible only to authorized users

#### Testing Considerations
- Unit test: Table rendering with status colors
- Unit test: Download invoice trigger
- Unit test: Date range filter functionality
- Integration test: Invoice PDF download

---

### Requirement 17: Audit Log Viewer

**User Story:** As a tenant administrator, I want to view audit logs, so that I can track what actions have been performed in my tenant for security and compliance purposes.

#### Acceptance Criteria

1. THE System SHALL display an Audit_Log_Table screen accessible from the administration navigation menu
2. THE Audit_Log_Table SHALL require at least one of: `audit:read` or `tenant:manage` permission to access
3. THE Audit_Log_Table SHALL display columns: timestamp, event type, actor (user), target resource, details, and IP address
4. THE Audit_Log_Table SHALL fetch data from AuditTrailService filtered by user's authorization scope
5. WHEN the user is PLATFORM_ADMIN, THE System SHALL display audit logs across all tenants with tenant column
6. WHEN the user is tenant-level admin, THE System SHALL display audit logs for their tenant only
7. WHEN the user is org-scoped admin, THE System SHALL display audit logs for their OrgUnit scope only
8. THE Audit_Log_Table SHALL include a Filter_Panel with:
   - Date range picker (from/to dates)
   - Event type multi-select dropdown
   - Actor search (by name or email)
   - Resource type filter (Membership, OrgUnit, Tenant, etc.)
   - Resource ID search
9. THE event type dropdown SHALL include categories: AUTH, MEMBERSHIP, ORGUNIT, TENANT, SUBSCRIPTION, EMERGENCY, IOT
10. THE Audit_Log_Table SHALL support pagination with configurable page size
11. THE Audit_Log_Table SHALL display a loading indicator WHILE data is being fetched AND SHALL hide the loading indicator WHEN data fetching completes or fails
12. THE Audit_Log_Table SHALL support clicking on a row to expand and show full details JSON
13. IF no audit logs match filters, THE System SHALL display empty state with i18n key `audit.no_results`

#### Security Considerations
- Audit log scope filtered server-side by user's authorization context
- Sensitive details may be redacted in audit log entries
- IP address display may be masked based on privacy settings

#### Testing Considerations
- Unit test: Filter panel state management
- Unit test: Scope filtering based on user role
- Unit test: Row expansion for details
- Integration test: Full filter and pagination flow

---

### Requirement 18: Audit Log Export

**User Story:** As a tenant administrator, I want to export audit logs, so that I can analyze them externally or retain them for compliance requirements.

#### Acceptance Criteria

1. THE Audit_Log_Table SHALL include an "Export" button when the user has `audit:read` permission
2. WHEN the user clicks "Export", THE System SHALL display export options dialog
3. THE export options dialog SHALL include:
   - Format selection: CSV, JSON
   - Date range (pre-filled from current filter)
   - Maximum rows warning (limit 10,000 rows per export)
4. WHEN the user confirms export, THE System SHALL:
   - Call AuditTrailService.export() with selected options
   - Display progress indicator during export generation
   - Trigger download when ready
5. IF export exceeds 10,000 rows, THE System SHALL warn user and suggest narrowing date range
6. THE exported file SHALL include all filtered audit log fields
7. THE exported filename SHALL follow pattern: `audit-export-{tenant}-{from-date}-{to-date}.{format}`
8. IF export fails, THE System SHALL display error with i18n key `audit.export_error` and allow retry
9. WHEN exporting as CSV, THE System SHALL properly escape special characters and handle unicode
10. THE System SHALL log the export action to the audit trail

#### Security Considerations
- Export includes data within user's authorization scope only
- Export action logged to audit trail
- Row limit prevents resource exhaustion
- Export files use signed URLs with short TTL

#### Testing Considerations
- Unit test: Export options validation
- Unit test: Row limit warning display
- Unit test: Filename generation
- Integration test: Full export download flow

---

### Requirement 19: Platform Admin Dashboard

**User Story:** As a platform administrator, I want a dashboard showing all tenants and system health, so that I can monitor and manage the entire platform effectively.

#### Acceptance Criteria

1. THE System SHALL display a Platform_Dashboard screen accessible only to users with PLATFORM_ADMIN role
2. IF the user is not PLATFORM_ADMIN, THE System SHALL redirect to unauthorized page with i18n key `platform.unauthorized`
3. THE Platform_Dashboard SHALL display system-wide metrics:
   - Total tenant count by status (Active, Suspended, Closed)
   - Total member count across all tenants
   - Total active sessions count
   - System health indicators (API response time, database latency, error rate)
4. THE Platform_Dashboard SHALL display a tenant overview table with columns: tenant name, status, member count, subscription plan, created date, last activity
5. THE tenant overview table SHALL support filtering by: status, plan, and text search
6. THE tenant overview table SHALL support sorting by any column
7. THE Platform_Dashboard SHALL display recent system-wide alerts and warnings:
   - Failed payments
   - Security events
   - Rate limit violations
   - Subscription expirations approaching
8. WHEN the user clicks on a tenant row, THE System SHALL navigate to that tenant's detail view
9. THE Platform_Dashboard SHALL include a "Provision New Tenant" button that opens the tenant onboarding wizard
10. THE Platform_Dashboard SHALL auto-refresh metrics every 60 seconds with visual refresh indicator
11. THE Platform_Dashboard SHALL display data fetched from privileged execution path (cross-tenant, audited)

#### Security Considerations
- PLATFORM_ADMIN role check at page load and enforced server-side
- Cross-tenant data access via privileged execution path (L11)
- All cross-tenant access logged to audit trail

#### Testing Considerations
- Unit test: Role-based access control
- Unit test: Metric refresh cycle
- Unit test: Alert rendering and filtering
- Integration test: Cross-tenant data aggregation

---

### Requirement 20: Platform Admin Tenant Operations

**User Story:** As a platform administrator, I want to perform administrative operations on any tenant, so that I can support tenants and resolve platform-wide issues.

#### Acceptance Criteria

1. THE Platform_Dashboard tenant detail view SHALL display comprehensive tenant information:
   - Full tenant profile
   - Subscription details
   - Lifecycle history
   - Recent audit logs (last 100 entries)
   - Member count and distribution by role
2. THE tenant detail view SHALL include administrative actions:
   - "Impersonate Tenant" - switch context to view as tenant (with banner)
   - "Force Suspend" - immediately suspend tenant with reason
   - "Force Close" - initiate tenant closure with strong confirmation
   - "Reset Token Version" - force-logout all tenant users
   - "View Audit Trail" - navigate to full audit log for tenant
3. WHEN the user clicks "Impersonate Tenant", THE System SHALL:
   - Switch the admin's active context to the selected tenant
   - Display a prominent banner indicating impersonation mode
   - Log the impersonation start to audit trail
4. WHEN in impersonation mode, THE System SHALL:
   - Display tenant's dashboard as they would see it
   - Include "Exit Impersonation" button in banner
   - Log all actions with impersonation flag
5. WHEN the user clicks "Exit Impersonation", THE System SHALL restore PLATFORM_ADMIN context and log impersonation end
6. WHEN the user clicks "Force Suspend", THE System SHALL require reason and confirmation, then call TenantOnboardingService.adminSuspend()
7. WHEN the user clicks "Force Close", THE System SHALL require typing "CLOSE {tenant-name}" and call TenantOnboardingService.adminClose()
8. WHEN the user clicks "Reset Token Version", THE System SHALL:
   - Display confirmation warning about forcing all users to re-login
   - Increment token version for all tenant users
   - Log the action to audit trail
9. ALL platform admin operations SHALL be logged to audit trail with PLATFORM_ADMIN actor and operation type

#### Security Considerations
- All operations require explicit PLATFORM_ADMIN role
- Impersonation clearly visible and logged
- Force operations require strong confirmation
- All actions logged to audit trail with full context

#### Testing Considerations
- Unit test: Impersonation banner display and context switch
- Unit test: Strong confirmation patterns
- Unit test: Operation logging
- Integration test: Full impersonation cycle

---

### Requirement 21: Security Event Alerts

**User Story:** As a platform administrator, I want to see security-related events and alerts, so that I can respond to potential security incidents quickly.

#### Acceptance Criteria

1. THE Platform_Dashboard SHALL include a "Security Events" section
2. THE Security Events section SHALL display events logged by SecurityEventLogger:
   - Failed login attempts (count by tenant/user)
   - Token reuse detection (potential session hijacking)
   - Unauthorized access attempts (403 responses)
   - Rate limit violations
   - Cross-tenant access attempts (blocked)
   - Token version resets
3. EACH security event SHALL display: timestamp, event type, severity, tenant (if applicable), user (if applicable), details, and IP address
4. THE Security Events section SHALL support severity filtering: Critical, High, Medium, Low
5. WHEN a Critical or High severity event occurs, THE System SHALL display a visual alert badge on the dashboard tab
6. THE Security Events section SHALL support acknowledging events to clear them from active view
7. WHEN the user acknowledges an event, THE System SHALL log the acknowledgment with actor and timestamp
8. THE Security Events section SHALL display a trend chart showing event count over time
9. THE System SHALL support configuring alert thresholds for automatic notifications
10. WHEN event count exceeds the configured threshold, THE System SHALL send a notification to configured PLATFORM_ADMIN channels; THE System SHALL send this notification only once per threshold-crossing episode (edge-triggered), not for every subsequent event that remains above the threshold; THE notification count SHALL reset when the event count drops below the threshold

#### Security Considerations
- Security events contain sensitive information; access restricted to PLATFORM_ADMIN
- IP addresses may be used for blocking decisions
- Acknowledgment provides audit trail of response
- Threshold alerts enable proactive response

#### Testing Considerations
- Unit test: Event severity filtering
- Unit test: Alert badge visibility rules
- Unit test: Acknowledgment flow and logging
- Integration test: Threshold notification trigger

---

### Requirement 22: Permission-Based UI Rendering

**User Story:** As a developer, I want a Permission_Guard component, so that I can conditionally render UI elements based on user permissions without duplicating authorization logic.

#### Acceptance Criteria

1. THE System SHALL provide a Permission_Guard component that conditionally renders children based on permissions
2. THE Permission_Guard SHALL accept props: `permissions` (required array of permission strings), `fallback` (optional ReactNode for unauthorized view), `all` (boolean, default true - require all permissions vs. any)
3. WHEN `all` is true, THE Permission_Guard SHALL render children only if the user has ALL specified permissions
4. WHEN `all` is false, THE Permission_Guard SHALL render children if the user has ANY of the specified permissions
5. IF the user lacks required permissions AND `fallback` is provided, THE Permission_Guard SHALL render the fallback
6. IF the user lacks required permissions AND `fallback` is not provided, THE Permission_Guard SHALL render nothing
7. THE Permission_Guard SHALL use the current authorization context from AuthorizationContextProvider
8. THE Permission_Guard SHALL re-render when authorization context changes (e.g., after context switch)
9. THE System SHALL provide a `usePermissions()` hook returning: `hasPermission(permission: string)`, `hasAllPermissions(permissions: string[])`, `hasAnyPermission(permissions: string[])`
10. THE `usePermissions()` hook SHALL handle loading state gracefully by returning false during context resolution

#### Security Considerations
- Permission_Guard provides UI-level hiding only; authorization enforced server-side
- UI should degrade gracefully for unauthorized users (no broken layouts)
- Permission checks use resolved authorization context, not JWT claims

#### Testing Considerations
- Unit test: Permission_Guard renders correctly for various permission combinations
- Unit test: Fallback rendering when unauthorized
- Unit test: usePermissions hook returns correct values
- Integration test: Permission_Guard updates after context switch

---

### Requirement 23: Responsive and Accessible UI

**User Story:** As a user, I want the admin UI to be responsive and accessible, so that I can use it effectively on different devices and with assistive technologies.

#### Acceptance Criteria

1. ALL admin UI screens SHALL be responsive and usable on viewport widths from 320px to 2560px
2. THE Member_List and Audit_Log_Table SHALL adapt to mobile viewports by:
   - Collapsing non-essential columns
   - Providing horizontal scroll for wide tables
   - Stacking action buttons vertically
3. THE OrgUnit_Tree SHALL adapt to mobile viewports by using full-width layout with touch-friendly expand/collapse targets
4. THE Tenant_Switcher dropdown SHALL be fully functional on touch devices
5. ALL form inputs SHALL have proper labels associated via `for`/`id` attributes or wrapping `<label>` elements
6. ALL interactive elements SHALL have minimum touch target size of 44x44 pixels on touch devices
7. ALL color-based indicators (status badges, severity) SHALL have accompanying text or icons for colorblind accessibility
8. THE System SHALL support keyboard navigation for all interactive elements with visible focus indicators
9. ALL modals and dialogs SHALL trap focus and return focus to trigger element on close
10. THE System SHALL announce dynamic content changes to screen readers using ARIA live regions
11. ALL images and icons SHALL have appropriate alt text or aria-labels
12. THE System SHALL maintain WCAG 2.1 AA contrast ratios for all text content

#### Security Considerations
- Accessibility features do not expose additional data
- Screen reader content matches visible content (no hidden data leakage)

#### Testing Considerations
- Unit test: Responsive breakpoint behavior
- Unit test: Keyboard navigation flow
- Manual test: Screen reader compatibility
- Automated accessibility audit with axe-core

---

### Requirement 24: Loading and Error States

**User Story:** As a user, I want clear loading and error feedback, so that I understand the system state and can recover from errors.

#### Acceptance Criteria

1. ALL data-fetching screens SHALL display loading skeletons or spinners while initial data loads
2. THE loading skeletons SHALL match the layout of actual content to prevent layout shift
3. WHEN a data fetch fails, THE System SHALL display an error state with:
   - User-friendly error message using appropriate i18n key
   - Retry button to attempt the fetch again
   - Support information or link (if applicable)
4. THE error state SHALL NOT expose technical error details to the user
5. WHEN a mutation (create, update, delete) is in progress, THE System SHALL:
   - Disable the submit button
   - Display a loading spinner on the button
   - Prevent duplicate submissions
6. WHEN a mutation fails, THE System SHALL display error toast with:
   - User-friendly message from i18n
   - Error code for reference (if applicable)
   - Close button or auto-dismiss after 5 seconds
7. WHEN a mutation succeeds, THE System SHALL display success toast that auto-dismisses after 3 seconds
8. THE System SHALL use optimistic updates for low-risk operations (e.g., acknowledging events) with rollback on failure
9. ALL error messages SHALL follow the `12-error-handling` steering document guidelines
10. THE System SHALL log errors to the error tracking system with correlation IDs for debugging

#### Security Considerations
- Technical error details logged server-side, not exposed to UI
- Error messages do not reveal sensitive system information
- Correlation IDs enable debugging without exposing internals

#### Testing Considerations
- Unit test: Loading skeleton rendering
- Unit test: Error state display and retry functionality
- Unit test: Toast display and auto-dismiss timing
- Integration test: Optimistic update with rollback

---

### Requirement 25: Navigation and Routing

**User Story:** As a user, I want intuitive navigation to all admin features, so that I can easily find and access the functionality I need.

#### Acceptance Criteria

1. THE System SHALL provide a consistent navigation sidebar for desktop viewports with links to all admin features
2. THE navigation sidebar SHALL group links by category: Membership, Organization, Settings, Platform (admin only)
3. THE navigation sidebar links SHALL be conditionally rendered based on user permissions:
   - Member List: requires `membership:read`
   - OrgUnit Tree: requires `orgunit:read`
   - Tenant Settings: requires `tenant:manage`
   - Subscription: requires `tenant:manage`
   - Audit Log: requires `audit:read` or `tenant:manage`
   - Platform Dashboard: requires PLATFORM_ADMIN role
4. THE navigation sidebar SHALL highlight the currently active section
5. THE System SHALL provide a bottom navigation bar for mobile viewports with key actions
6. THE System SHALL support deep linking to specific screens via URL routes
7. THE URL routes SHALL be protected by middleware that validates authorization before rendering
8. IF a user navigates to a route they don't have permission for, THE System SHALL redirect to an unauthorized page
9. THE navigation SHALL include breadcrumbs for nested screens (e.g., Tenant Settings > Profile)
10. THE navigation sidebar SHALL be collapsible on desktop to maximize content area
11. ALL navigation links SHALL use Next.js Link component for client-side navigation

#### Security Considerations
- Route protection enforced at middleware level
- Navigation links hidden for unauthorized features (defense in depth)
- Deep links validated server-side before rendering

#### Testing Considerations
- Unit test: Navigation link visibility based on permissions
- Unit test: Breadcrumb generation for nested routes
- Unit test: Active state highlighting
- Integration test: Route protection and redirect

---

## Cross-Cutting Requirements

### Security Requirements Summary

All UI screens MUST implement the following security measures:

1. **Permission Checks**: UI elements conditionally rendered based on permissions; authorization enforced server-side
2. **Input Validation**: All user inputs validated client-side for UX, validated server-side for security
3. **CSRF Protection**: All mutations protected by CSRF tokens (handled by Next.js)
4. **XSS Prevention**: All user-generated content sanitized before rendering
5. **Audit Logging**: All state-changing operations logged to audit trail
6. **Error Handling**: Errors handled gracefully without exposing technical details

### Testing Requirements Summary

All UI screens MUST have the following test coverage:

1. **ViewModel Unit Tests**: All ViewModel logic tested with mocked dependencies
2. **Screen Integration Tests**: Critical user flows tested with React Testing Library
3. **Accessibility Tests**: Automated axe-core checks integrated into test suite
4. **Error State Tests**: Error and loading states explicitly tested

### Internationalization Requirements Summary

All UI screens MUST follow these i18n practices:

1. **No Hardcoded Text**: All user-visible text uses translation keys
2. **Key Naming**: Keys follow pattern `{feature}.{screen}.{element}` (e.g., `member_list.table.header_name`)
3. **Pluralization**: Quantity-dependent text uses proper plural forms
4. **Date/Number Formatting**: All dates and numbers formatted according to user's locale

---

## Backend Service Dependencies

This feature set depends on the following backend services from multi-tenant-saas-architecture:

| Feature | Services Used |
|---------|--------------|
| Tenant Switcher | ContextSwitchService, MembershipResolutionService |
| Membership Management | MembershipResolutionService, MembershipInvitationService, MembershipLifecycleService, DelegatedMembershipService |
| OrgUnit Management | OrgUnitManagementService, OrgUnitHierarchyReader |
| Tenant Settings | TenantOnboardingService, IoTService |
| Subscription Management | SubscriptionPlanService, EntitlementEnforcer |
| Audit Log | AuditTrailService, SecurityEventLogger |
| Platform Dashboard | Cross-tenant aggregation via privileged execution path |
| Authorization | PermissionRegistry, AuthorizationContext |

---

## Out of Scope

The following are explicitly out of scope for this feature:

1. **User Registration** — Handled by auth feature
2. **Password Management** — Handled by auth feature
3. **Two-Factor Authentication Setup** — Handled by auth feature
4. **Payment Gateway Integration** — Backend only, UI uses abstracted SubscriptionPlanService
5. **IoT Device Provisioning** — Handled by separate IoT management feature
6. **Emergency/Panic Features** — Handled by emergency feature
7. **Resident Management** — Handled by resident feature
8. **Financial Transactions** — Handled by finance feature
