'use client';

import { useState } from 'react';
import { DataTable, type DataTableColumn } from '@components/organisms/DataTable';
import { Badge } from '@components/atoms/Badge';
import { Button } from '@components/atoms/Button';
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

  // Invitation state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('Warga');
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteExpiry, setInviteExpiry] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleInvite = async () => {
    if (!inviteEmail) {
      setInviteError('Email is required');
      return;
    }
    setInviteLoading(true);
    setInviteError(null);
    setInviteToken(null);
    setInviteExpiry(null);
    setCopied(false);

    try {
      const res = await fetch('/api/auth/invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const json = await res.json();
      if (!res.ok) {
        setInviteError(json.message ?? json.code ?? 'Failed to create invitation');
        return;
      }
      setInviteToken(json.data.token);
      setInviteExpiry(json.data.expiresAt);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCopyToken = async () => {
    if (!inviteToken) return;
    try {
      await navigator.clipboard.writeText(inviteToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = inviteToken;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
        <Button
          onClick={() => setShowInvite(!showInvite)}
          variant={showInvite ? 'secondary' : 'primary'}
          aria-expanded={showInvite}
          aria-controls="invite-section">
          {showInvite ? 'Close' : 'Invite User'}
        </Button>
      </div>

      {/* Invitation Section */}
      {showInvite && (
        <div
          id="invite-section"
          className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Generate Invitation Token
          </h2>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label
                htmlFor="invite-email"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email
              </label>
              <input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <div className="w-full sm:w-48">
              <label
                htmlFor="invite-role"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Role
              </label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                {ROLES.map(role => (
                  <option key={role} value={role}>
                    {role.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <Button
              onClick={handleInvite}
              disabled={inviteLoading}
              variant="primary">
              {inviteLoading ? 'Generating...' : 'Generate Token'}
            </Button>
          </div>

          {inviteError && (
            <div className="mt-3">
              <ErrorMessage message={inviteError} />
            </div>
          )}

          {inviteToken && (
            <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
              <p className="mb-2 text-sm font-medium text-green-800 dark:text-green-300">
                Invitation token generated successfully!
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded bg-white px-3 py-2 text-sm text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                  {inviteToken}
                </code>
                <Button
                  onClick={handleCopyToken}
                  variant="secondary"
                  aria-label="Copy token to clipboard">
                  {copied ? '✓ Copied' : 'Copy'}
                </Button>
              </div>
              {inviteExpiry && (
                <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                  Expires: {new Date(inviteExpiry).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </div>
      )}

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
