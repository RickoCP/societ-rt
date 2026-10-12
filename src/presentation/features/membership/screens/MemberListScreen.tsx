'use client';

/**
 * MemberListScreen — Admin screen for managing tenant members.
 *
 * Displays a paginated, sortable, filterable list of members within
 * the user's authorization scope. Supports selection for bulk operations.
 *
 * This screen follows the Clean Architecture pattern:
 * Screen → ViewModel → UseCase → Repository
 *
 * Features:
 * - DataTable with columns: name, email, role, OrgUnit, status, joined date
 * - Pagination with configurable page size (10, 25, 50, 100)
 * - Sorting by any column (ascending/descending)
 * - Filtering by role, status, and text search
 * - Row selection for bulk operations
 * - Loading skeleton while fetching
 * - Error state with retry button
 * - Empty state when no results
 *
 * @see Requirements 2.1-2.12 (Membership List Screen)
 * @see Design Components > 2.1-2.4 (Member List Screen)
 */

import { useMemo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PermissionGuard } from '@presentation/components/atoms/PermissionGuard';
import { DataTable, type DataTableColumn, type SortDirection } from '@presentation/components/organisms/DataTable';
import { FilterPanel, type FilterDefinition, type FilterValue } from '@presentation/components/molecules/FilterPanel';
import { Button } from '@presentation/components/atoms/Button';
import { EmptyState } from '@presentation/components/molecules/EmptyState';
import { ConfirmDialog } from '@presentation/components/molecules/ConfirmDialog';
import { useMemberListViewModel, MAX_BULK_SELECTION } from '../viewModel/useMemberListViewModel';
import {
  useCreateMember,
  useUpdateMember,
  useDeleteMember,
  useBulkMember,
} from '../hooks/useMemberMutations';
import type { Member } from '@core/domains/membership/entities/Member';
import type { MemberSortColumn } from '@core/domains/membership/entities/MemberFilters';
import { MembershipRole, ALL_MEMBERSHIP_ROLES } from '@core/domains/membership/types/MembershipRole';
import { MembershipStatus, ALL_MEMBERSHIP_STATUSES } from '@core/domains/membership/types/MembershipStatus';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Valid page sizes for pagination.
 */
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

/**
 * Role display labels mapping (should be replaced with i18n).
 */
const ROLE_LABELS: Record<MembershipRole, string> = {
  [MembershipRole.PLATFORM_ADMIN]: 'Platform Admin',
  [MembershipRole.TENANT_OWNER]: 'Tenant Owner',
  [MembershipRole.ORG_ADMIN]: 'Org Admin',
  [MembershipRole.RT_ADMIN]: 'RT Admin',
  [MembershipRole.SECURITY]: 'Security',
  [MembershipRole.RESIDENT]: 'Resident',
};

/**
 * Status display labels and colors mapping.
 */
const STATUS_CONFIG: Record<MembershipStatus, { label: string; color: string }> = {
  [MembershipStatus.ACTIVE]: { label: 'Active', color: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30' },
  [MembershipStatus.INVITED]: { label: 'Invited', color: 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30' },
  [MembershipStatus.SUSPENDED]: { label: 'Suspended', color: 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30' },
  [MembershipStatus.REVOKED]: { label: 'Revoked', color: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30' },
};

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

/**
 * Status badge component.
 */
function StatusBadge({ status }: { status: MembershipStatus }) {
  // Fail securely: fall back to a neutral badge for any unexpected/unmapped
  // status rather than crashing on `config.color`.
  const config = STATUS_CONFIG[status] ?? {
    label: String(status),
    color: 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-700',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

/**
 * Role badge component.
 */
function RoleBadge({ role }: { role: MembershipRole }) {
  const label = ROLE_LABELS[role] ?? role;
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
      {label}
    </span>
  );
}

/**
 * Member avatar component with initials fallback.
 */
function MemberAvatar({
  name,
  profilePictureUrl,
}: {
  name: string;
  profilePictureUrl?: string;
}) {
  const initials = useMemo(() => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }, [name]);

  if (profilePictureUrl) {
    return (
      <img
        src={profilePictureUrl}
        alt={name}
        className="h-8 w-8 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
      {initials}
    </div>
  );
}

/**
 * Page size selector component.
 */
function PageSizeSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (size: 10 | 25 | 50 | 100) => void;
}) {
  const { t } = useTranslation();
  
  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor="page-size" className="text-gray-500 dark:text-gray-400">
        {t('member_list.page_size', 'Show')}
      </label>
      <select
        id="page-size"
        value={value}
        onChange={e => onChange(Number(e.target.value) as 10 | 25 | 50 | 100)}
        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800">
        {PAGE_SIZE_OPTIONS.map(size => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
      <span className="text-gray-500 dark:text-gray-400">
        {t('member_list.per_page', 'per page')}
      </span>
    </div>
  );
}

/**
 * Loading skeleton for the member list.
 */
function MemberListSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      {/* Filter skeleton */}
      <div className="flex gap-4">
        <div className="h-10 w-64 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-10 w-32 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-10 w-32 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
      
      {/* Table skeleton */}
      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex gap-4 bg-gray-50 px-4 py-3 dark:bg-gray-800">
          <div className="h-4 w-8 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 w-48 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
        
        {/* Rows */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-4 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
            <div className="h-4 w-8 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-48 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Error state component with retry button.
 */
function MemberListError({
  error,
  onRetry,
}: {
  error: { code: string; message: string } | null;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50 py-12 dark:border-red-900 dark:bg-red-900/20">
      <svg
        className="mb-4 h-12 w-12 text-red-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <h3 className="text-lg font-medium text-red-800 dark:text-red-200">
        {t('member_list.fetch_error', 'Failed to load members')}
      </h3>
      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
        {t('member_list.generic_error', 'An error occurred while fetching members. Please try again.')}
      </p>
      {error?.code && (
        <p className="mt-2 text-xs text-red-500 dark:text-red-500">
          {t('common.error_code', 'Error code: {{code}}', { code: error.code })}
        </p>
      )}
      <Button
        variant="primary"
        size="sm"
        onClick={onRetry}
        className="mt-4">
        {t('member_list.retry', 'Retry')}
      </Button>
    </div>
  );
}

/**
 * Selection limit warning banner.
 */
function SelectionLimitWarning({ selectedCount }: { selectedCount: number }) {
  const { t } = useTranslation();
  
  return (
    <div className="rounded-md bg-yellow-50 p-3 dark:bg-yellow-900/20">
      <div className="flex items-center gap-2">
        <svg
          className="h-5 w-5 text-yellow-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span className="text-sm text-yellow-700 dark:text-yellow-300">
          {t(
            'member_bulk.limit_exceeded',
            `Selection limit exceeded. You've selected {{count}} members, but bulk operations are limited to ${MAX_BULK_SELECTION}.`,
            { count: selectedCount }
          )}
        </span>
      </div>
    </div>
  );
}

/**
 * Invite Member dialog — a minimal create form (name, email, role).
 */
function InviteMemberDialog({
  open,
  isSubmitting,
  onSubmit,
  onClose,
}: {
  open: boolean;
  isSubmitting: boolean;
  onSubmit: (data: { name: string; email: string; role: MembershipRole }) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MembershipRole>(MembershipRole.RESIDENT);
  const [error, setError] = useState<string | null>(null);

  // Reset fields whenever the dialog opens.
  const handleClose = useCallback(() => {
    setName('');
    setEmail('');
    setRole(MembershipRole.RESIDENT);
    setError(null);
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    setError(null);
    if (!name.trim()) {
      setError(t('member_list.invite_name_required', 'Name is required'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t('member_list.invite_email_invalid', 'A valid email is required'));
      return;
    }
    await onSubmit({ name: name.trim(), email: email.trim(), role });
  }, [name, email, role, onSubmit, t]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50"
        aria-hidden="true"
        onClick={handleClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('member_list.invite_member', 'Invite Member')}
        className="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          {t('member_list.invite_member', 'Invite Member')}
        </h2>

        <div className="space-y-4">
          <div>
            <label htmlFor="invite-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('member_list.invite_name', 'Name')}
            </label>
            <input
              id="invite-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>

          <div>
            <label htmlFor="invite-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('member_list.invite_email', 'Email')}
            </label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>

          <div>
            <label htmlFor="invite-role" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('member_list.invite_role', 'Role')}
            </label>
            <select
              id="invite-role"
              value={role}
              onChange={e => setRole(e.target.value as MembershipRole)}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
              {ALL_MEMBERSHIP_ROLES.map(r => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={isSubmitting}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} disabled={isSubmitting}>
            {t('member_list.invite_submit', 'Send Invite')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * MemberListContent — The main content of the Member List screen.
 */
function MemberListContent() {
  const { t } = useTranslation();
  const vm = useMemberListViewModel();

  // ---------------------------------------------------------------------------
  // Mutations (create / update / delete / bulk) — users-table backend
  // ---------------------------------------------------------------------------

  const createMember = useCreateMember();
  const updateMember = useUpdateMember();
  const deleteMember = useDeleteMember();
  const bulkMember = useBulkMember();

  const [isInviteOpen, setInviteOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null);

  const handleInviteSubmit = useCallback(
    async (data: { name: string; email: string; role: MembershipRole }) => {
      await createMember.mutateAsync(data);
      setInviteOpen(false);
    },
    [createMember],
  );

  const handleChangeRole = useCallback(
    (member: Member, role: MembershipRole) => {
      if (role === member.role) return;
      void updateMember.mutateAsync({ memberId: member.id, role });
    },
    [updateMember],
  );

  const handleToggleStatus = useCallback(
    (member: Member) => {
      const next =
        member.status === MembershipStatus.ACTIVE
          ? MembershipStatus.SUSPENDED
          : MembershipStatus.ACTIVE;
      void updateMember.mutateAsync({ memberId: member.id, status: next });
    },
    [updateMember],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!memberToDelete) return;
    await deleteMember.mutateAsync(memberToDelete.id);
    setMemberToDelete(null);
  }, [memberToDelete, deleteMember]);

  const handleBulk = useCallback(
    (action: 'activate' | 'suspend' | 'revoke' | 'delete') => {
      const ids = Array.from(vm.selectedIds);
      if (ids.length === 0) return;
      void bulkMember.mutateAsync({ action, memberIds: ids }).then(() => {
        vm.clearSelection();
      });
    },
    [vm, bulkMember],
  );
  
  // ---------------------------------------------------------------------------
  // Filter Configuration
  // ---------------------------------------------------------------------------
  
  const filterDefinitions = useMemo<FilterDefinition[]>(() => [
    {
      key: 'search',
      label: t('member_list.filter_search', 'Search'),
      type: 'text',
      placeholder: t('member_list.filter_search_placeholder', 'Search by name or email...'),
    },
    {
      key: 'role',
      label: t('member_list.filter_role', 'Role'),
      type: 'select',
      options: ALL_MEMBERSHIP_ROLES.map(role => ({
        value: role,
        label: ROLE_LABELS[role],
      })),
    },
    {
      key: 'status',
      label: t('member_list.filter_status', 'Status'),
      type: 'select',
      options: ALL_MEMBERSHIP_STATUSES.map(status => ({
        value: status,
        label: STATUS_CONFIG[status].label,
      })),
    },
  ], [t]);
  
  const filterValues = useMemo(() => ({
    search: vm.filters.search,
    role: vm.filters.role ?? '',
    status: vm.filters.status ?? '',
  }), [vm.filters]);
  
  const handleFilterChange = useCallback((key: string, value: FilterValue) => {
    if (key === 'search') {
      vm.setFilters({ search: value as string });
    } else if (key === 'role') {
      vm.setFilters({ role: value ? value as MembershipRole : null });
    } else if (key === 'status') {
      vm.setFilters({ status: value ? value as MembershipStatus : null });
    }
  }, [vm]);
  
  // ---------------------------------------------------------------------------
  // Table Columns
  // ---------------------------------------------------------------------------
  
  const columns = useMemo<DataTableColumn<Member>[]>(() => [
    {
      key: 'name',
      header: t('member_list.column_name', 'Name'),
      sortable: true,
      // Essential column - always visible
      responsive: { priority: 'essential' },
      render: (row) => (
        <div className="flex items-center gap-3">
          <MemberAvatar name={row.name} profilePictureUrl={row.profilePictureUrl} />
          <div>
            <div className="font-medium text-gray-900 dark:text-white">
              {row.name}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'email',
      header: t('member_list.column_email', 'Email'),
      sortable: true,
      // High priority - visible on mobile
      responsive: { priority: 'high' },
      render: (row) => (
        <span className="text-gray-600 dark:text-gray-300">{row.email}</span>
      ),
    },
    {
      key: 'role',
      header: t('member_list.column_role', 'Role'),
      sortable: true,
      // High priority - visible on mobile (important for understanding member access)
      responsive: { priority: 'high' },
      render: (row) => <RoleBadge role={row.role} />,
    },
    {
      key: 'orgUnitName',
      header: t('member_list.column_orgunit', 'OrgUnit'),
      sortable: true,
      // Medium priority - hidden on mobile, visible on tablet and above
      responsive: { priority: 'medium', hideOnMobile: true },
      render: (row) => (
        <span className="text-gray-600 dark:text-gray-300">
          {row.orgUnitName ?? '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('member_list.column_status', 'Status'),
      sortable: true,
      // Essential column - always visible (critical for member management)
      responsive: { priority: 'essential' },
      render: (row) => <StatusBadge status={row.status} />,
    },
    ...(vm.canWrite
      ? [
          {
            key: 'actions',
            header: t('member_list.column_actions', 'Actions'),
            responsive: { priority: 'high' as const },
            render: (row: Member) => (
              <div className="flex items-center gap-2">
                {/* Inline role change */}
                <select
                  aria-label={t('member_list.change_role_aria', 'Change role for {{name}}', { name: row.name })}
                  value={row.role}
                  onChange={e => handleChangeRole(row, e.target.value as MembershipRole)}
                  disabled={row.status === MembershipStatus.REVOKED}
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
                  {ALL_MEMBERSHIP_ROLES.map(r => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>

                {/* Suspend / Activate toggle */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggleStatus(row)}
                  disabled={row.status === MembershipStatus.REVOKED}>
                  {row.status === MembershipStatus.ACTIVE
                    ? t('member_list.suspend', 'Suspend')
                    : t('member_list.activate', 'Activate')}
                </Button>

                {/* Delete */}
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setMemberToDelete(row)}
                  aria-label={t('member_list.delete_aria', 'Remove {{name}}', { name: row.name })}>
                  {t('common.delete', 'Delete')}
                </Button>
              </div>
            ),
          } as DataTableColumn<Member>,
        ]
      : []),
    {
      key: 'createdAt',
      header: t('member_list.column_joined', 'Joined'),
      sortable: true,
      // Low priority - hidden on mobile and tablet, visible only on desktop
      responsive: { priority: 'low', hideOnMobile: true, hideOnTablet: true },
      render: (row) => (
        <span className="text-gray-600 dark:text-gray-300">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ], [t, vm.canWrite, handleChangeRole, handleToggleStatus]);
  
  // ---------------------------------------------------------------------------
  // Sort Handler
  // ---------------------------------------------------------------------------
  
  const handleSortChange = useCallback(
    (column: string, direction: SortDirection) => {
      vm.setSort(column as MemberSortColumn, direction);
    },
    [vm],
  );
  
  // ---------------------------------------------------------------------------
  // Selection Handler
  // ---------------------------------------------------------------------------
  
  const handleSelectionChange = useCallback(
    (selectedIds: Set<string>) => {
      // Clear selection first, then add all new selections
      vm.clearSelection();
      selectedIds.forEach(id => vm.toggleSelection(id));
    },
    [vm],
  );
  
  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  
  // Loading state
  if (vm.isLoading) {
    return <MemberListSkeleton />;
  }
  
  // Error state
  if (vm.isError) {
    return <MemberListError error={vm.error} onRetry={vm.refetch} />;
  }
  
  // Empty state (no results)
  if (vm.members.length === 0 && !vm.isLoading) {
    const hasFilters = vm.filters.search || vm.filters.role || vm.filters.status;
    
    return (
      <div className="space-y-4">
        {/* Filters */}
        <FilterPanel
          filters={filterDefinitions}
          values={filterValues}
          onChange={handleFilterChange}
          onClear={vm.clearFilters}
          onApply={() => {}} // Filters are applied immediately via onChange
          applyLabel={t('member_list.apply_filters', 'Apply')}
          clearLabel={t('member_list.clear_filters', 'Clear')}
        />
        
        {/* Empty state */}
        <EmptyState
          title={
            hasFilters
              ? t('member_list.no_results', 'No members found')
              : t('member_list.empty', 'No members yet')
          }
          description={
            hasFilters
              ? t('member_list.no_results_description', 'Try adjusting your filters to find what you\'re looking for.')
              : t('member_list.empty_description', 'Invite members to get started.')
          }
          action={
            hasFilters ? (
              <Button variant="secondary" size="sm" onClick={vm.clearFilters}>
                {t('member_list.clear_filters', 'Clear filters')}
              </Button>
            ) : vm.canDelegate ? (
              <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)}>
                {t('member_list.invite_member', 'Invite Member')}
              </Button>
            ) : undefined
          }
        />

        {/* Invite dialog (also reachable from the empty state) */}
        <InviteMemberDialog
          open={isInviteOpen}
          isSubmitting={createMember.isPending}
          onSubmit={handleInviteSubmit}
          onClose={() => setInviteOpen(false)}
        />
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Header with title and actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            {t('member_list.title', 'Members')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('member_list.total_count', '{{count}} members', { count: vm.totalCount })}
          </p>
        </div>
        
        {vm.canDelegate && (
          <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)}>
            {t('member_list.invite_member', 'Invite Member')}
          </Button>
        )}
      </div>
      
      {/* Filters */}
      <FilterPanel
        filters={filterDefinitions}
        values={filterValues}
        onChange={handleFilterChange}
        onClear={vm.clearFilters}
        onApply={() => {}} // Filters are applied immediately via onChange
        applyLabel={t('member_list.apply_filters', 'Apply')}
        clearLabel={t('member_list.clear_filters', 'Clear')}
      />
      
      {/* Selection limit warning */}
      {vm.isSelectionLimitExceeded && (
        <SelectionLimitWarning selectedCount={vm.selectedCount} />
      )}
      
      {/* Bulk actions bar (shown when items are selected) */}
      {vm.selectedCount > 0 && (
        <div className="flex items-center justify-between rounded-lg bg-blue-50 px-4 py-3 dark:bg-blue-900/20">
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {t('member_list.selected_count', '{{count}} selected', { count: vm.selectedCount })}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={vm.clearSelection}>
              {t('member_list.clear_selection', 'Clear')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={bulkMember.isPending || vm.isSelectionLimitExceeded}
              onClick={() => handleBulk('activate')}>
              {t('member_list.bulk_activate', 'Activate')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={bulkMember.isPending || vm.isSelectionLimitExceeded}
              onClick={() => handleBulk('suspend')}>
              {t('member_list.bulk_suspend', 'Suspend')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={bulkMember.isPending || vm.isSelectionLimitExceeded}
              onClick={() => handleBulk('delete')}>
              {t('member_list.bulk_delete', 'Delete')}
            </Button>
          </div>
        </div>
      )}
      
      {/* Data Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <DataTable
          columns={columns}
          data={vm.members}
          rowKey={(row) => row.id}
          loading={vm.isLoading}
          emptyMessage={t('member_list.empty', 'No members found')}
          
          // Selection
          selectable={vm.canWrite}
          selectedIds={vm.selectedIds}
          onSelectionChange={handleSelectionChange}
          disableSelection={(row) => row.status === MembershipStatus.REVOKED}
          
          // Sorting
          sortable
          sortColumn={vm.sortColumn}
          sortDirection={vm.sortDirection}
          onSortChange={handleSortChange}
          
          // Pagination
          page={vm.page}
          totalPages={vm.totalPages}
          onPageChange={vm.setPage}
        />
      </div>
      
      {/* Footer with page size selector and count */}
      <div className="flex items-center justify-between">
        <PageSizeSelector value={vm.pageSize} onChange={vm.setPageSize} />
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {t(
            'member_list.showing_range',
            'Showing {{from}}-{{to}} of {{total}}',
            {
              from: (vm.page - 1) * vm.pageSize + 1,
              to: Math.min(vm.page * vm.pageSize, vm.totalCount),
              total: vm.totalCount,
            }
          )}
        </span>
      </div>

      {/* Invite Member dialog */}
      <InviteMemberDialog
        open={isInviteOpen}
        isSubmitting={createMember.isPending}
        onSubmit={handleInviteSubmit}
        onClose={() => setInviteOpen(false)}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={memberToDelete !== null}
        title={t('member_list.delete_confirm_title', 'Remove Member')}
        description={
          memberToDelete
            ? t(
                'member_list.delete_confirm',
                'Are you sure you want to remove "{{name}}"? This action cannot be undone.',
                { name: memberToDelete.name },
              )
            : ''
        }
        confirmLabel={t('common.delete', 'Delete')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="danger"
        loading={deleteMember.isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setMemberToDelete(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported Component
// ---------------------------------------------------------------------------

/**
 * MemberListScreen — The Member List screen wrapped with PermissionGuard.
 *
 * Requires `membership:read` permission to access.
 *
 * @example
 * ```tsx
 * // In app/dashboard/members/page.tsx
 * import { MemberListScreen } from '@presentation/features/membership/screens/MemberListScreen';
 *
 * export default function MembersPage() {
 *   return <MemberListScreen />;
 * }
 * ```
 */
export function MemberListScreen() {
  const { t } = useTranslation();
  
  return (
    <PermissionGuard
      permissions={['membership:read']}
      fallback={
        <div className="flex flex-col items-center justify-center py-12">
          <svg
            className="mb-4 h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            {t('member_list.unauthorized', 'Access Denied')}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t(
              'member_list.unauthorized_description',
              'You do not have permission to view the member list.'
            )}
          </p>
        </div>
      }>
      <MemberListContent />
    </PermissionGuard>
  );
}

export default MemberListScreen;
