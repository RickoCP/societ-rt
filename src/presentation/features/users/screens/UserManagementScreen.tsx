'use client';

import { useState } from 'react';
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

const roleColors: Record<string, string> = {
  Super_Admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  Ketua_RT: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  Pengurus: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  Security_Guard: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  Warga: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarColor(name: string): string {
  const colors = [
    'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500',
    'bg-indigo-500', 'bg-teal-500', 'bg-orange-500', 'bg-cyan-500',
  ];
  const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  return colors[index] ?? 'bg-blue-500';
}

export function UserManagementScreen() {
  const [page, setPage] = useState(1);
  const { users, totalPages, isLoading, isError, error, assignRole, isAssigning, inviteUser } =
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
      setInviteError('Email wajib diisi');
      return;
    }
    setInviteLoading(true);
    setInviteError(null);
    setInviteToken(null);
    setInviteExpiry(null);
    setCopied(false);

    try {
      const result = await inviteUser({ email: inviteEmail, role: inviteRole });
      setInviteToken(result.token);
      setInviteExpiry(result.expiresAt);
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

  // Stats
  const activeUsers = users.filter(u => u.status === 'active').length;
  const roleDistribution = users.reduce((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Manajemen User
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Kelola akun dan hak akses pengguna
          </p>
        </div>
        <Button
          onClick={() => setShowInvite(!showInvite)}
          variant={showInvite ? 'secondary' : 'primary'}
          size="sm"
          aria-expanded={showInvite}
          aria-controls="invite-section">
          {showInvite ? 'Tutup' : '+ Undang User'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total User</p>
          <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{users.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Aktif</p>
          <p className="mt-1 text-xl font-bold text-green-600 dark:text-green-400">{activeUsers}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Pengurus</p>
          <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{(roleDistribution['Pengurus'] ?? 0) + (roleDistribution['Ketua_RT'] ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Security</p>
          <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{roleDistribution['Security_Guard'] ?? 0}</p>
        </div>
      </div>

      {/* Invitation Section */}
      {showInvite && (
        <div
          id="invite-section"
          className="rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm dark:border-blue-800 dark:bg-blue-900/20">
          <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">
            Undang User Baru
          </h2>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="invite-email" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
              <input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <div className="w-full sm:w-48">
              <label htmlFor="invite-role" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                {ROLES.map(role => (
                  <option key={role} value={role}>{role.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <Button onClick={handleInvite} disabled={inviteLoading} variant="primary">
              {inviteLoading ? 'Generating...' : 'Generate Token'}
            </Button>
          </div>

          {inviteError && <div className="mt-3"><ErrorMessage message={inviteError} /></div>}

          {inviteToken && (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
              <p className="mb-2 text-sm font-medium text-green-800 dark:text-green-300">
                ✓ Token undangan berhasil dibuat!
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-lg bg-white px-3 py-2 text-sm text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                  {inviteToken}
                </code>
                <Button onClick={handleCopyToken} variant="secondary" size="sm" aria-label="Copy token">
                  {copied ? '✓ Copied' : '📋 Copy'}
                </Button>
              </div>
              {inviteExpiry && (
                <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                  Berlaku sampai: {new Date(inviteExpiry).toLocaleString('id-ID')}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {isError && (
        <ErrorMessage message={error?.message ?? 'Failed to load users'} />
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700" />
                <div className="flex-1">
                  <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="mt-1 h-3 w-48 rounded bg-gray-100 dark:bg-gray-700" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && users.length === 0 && !isError && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-16 dark:border-gray-600">
          <span className="text-4xl">👤</span>
          <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">Belum ada user</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Undang user pertama untuk memulai</p>
        </div>
      )}

      {/* User List */}
      {!isLoading && users.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Daftar User ({users.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {users.map((user: UserRow) => (
              <div key={user.id} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
                {/* Avatar */}
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${getAvatarColor(user.name)}`}>
                  {getInitials(user.name)}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{user.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
                </div>

                {/* Role Badge */}
                <span className={`hidden shrink-0 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-block ${roleColors[user.role] ?? roleColors['Warga']}`}>
                  {(user.role ?? '').replace('_', ' ')}
                </span>

                {/* Role Selector */}
                <select
                  value={user.role ?? 'Warga'}
                  disabled={isAssigning}
                  onChange={e => assignRole({ userId: user.id, role: e.target.value })}
                  className="shrink-0 rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  aria-label={`Role for ${user.name}`}>
                  {ROLES.map(role => (
                    <option key={role} value={role}>{role.replace('_', ' ')}</option>
                  ))}
                </select>

                {/* Status */}
                <Badge variant={user.status === 'active' ? 'success' : 'warning'}>
                  {user.status === 'active' ? '● Active' : user.status}
                </Badge>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
