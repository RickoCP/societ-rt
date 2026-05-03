'use client';

import { useState } from 'react';
import { Badge } from '@components/atoms/Badge';
import { Button } from '@components/atoms/Button';
import { Spinner } from '@components/atoms/Spinner';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useNotificationListViewModel } from '../viewModel/useNotificationListViewModel';

export function NotificationListScreen() {
  const [page, setPage] = useState(1);
  const {
    notifications,
    totalPages,
    isLoading,
    isError,
    error,
    markAsRead,
    isMarkingRead,
  } = useNotificationListViewModel(page);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        Notifications
      </h1>

      {isError && (
        <ErrorMessage message={error?.message ?? 'Failed to load notifications'} />
      )}

      <div className="flex flex-col gap-2">
        {notifications.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">No notifications</p>
        )}
        {notifications.map(n => (
          <div
            key={n.id}
            className={`flex items-start justify-between rounded-lg border p-4 ${
              n.read
                ? 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'
                : 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950'
            }`}
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {n.title}
                </span>
                {!n.read && <Badge variant="info">New</Badge>}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{n.message}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{n.createdAt}</p>
            </div>
            {!n.read && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => markAsRead(n.id)}
                disabled={isMarkingRead}
              >
                Mark read
              </Button>
            )}
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Previous
          </Button>
          <span className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
