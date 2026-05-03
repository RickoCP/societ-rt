'use client';

import { useState } from 'react';
import { DataTable, type DataTableColumn } from '@components/organisms/DataTable';
import { Badge } from '@components/atoms/Badge';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useUserListViewModel } from '../viewModel/useUserListViewModel';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
}

const ROLES = ['Warga', 'Pengurus', 'Security_Guard', 'Ketua_RT'] as const;

export function UserManagementScreen() {
  const [page, setPage] = useState(1);
  const { users, totalPages, isLoading, isError, error, assignRole, isAssigning } =
    useUserListViewModel(page);

  const columns: DataTableColumn<UserRow>[] = [
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    {
      key: 'role',
      header: 'Role',
      render: row => (
        <select
          value={row.role}
          disabled={isAssigning}
          onChange={e =>
            assignRole({ userId: row.id, role: e.target.value })
          }
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          aria-label={`Role for ${row.name}`}>
          {ROLES.map(role => (
            <option key={role} value={role}>
              {role.replace('_', ' ')}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: row => (
        <Badge variant={row.status === 'active' ? 'success' : 'warning'}>
          {row.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          User Management
        </h1>
      </div>

      {isError && (
        <ErrorMessage message={error?.message ?? 'Failed to load users'} />
      )}

      <DataTable<UserRow>
        columns={columns}
        data={users}
        loading={isLoading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        rowKey={row => row.id}
        emptyMessage="No users found"
      />
    </div>
  );
}
