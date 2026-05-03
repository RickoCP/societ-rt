'use client';

import { Avatar } from '../atoms/Avatar';
import { NotificationBell } from './NotificationBell';

export interface HeaderProps {
  userName: string;
  userAvatarUrl?: string | null;
  isImpersonating?: boolean;
  impersonatorName?: string;
  unreadCount?: number;
  onNotificationClick?: () => void;
  className?: string;
}

export function Header({
  userName,
  userAvatarUrl,
  isImpersonating = false,
  impersonatorName,
  unreadCount = 0,
  onNotificationClick,
  className = '',
}: HeaderProps) {
  return (
    <header
      className={`flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 dark:border-gray-700 dark:bg-gray-900 ${className}`}>
      {isImpersonating && (
        <div
          role="alert"
          className="mr-4 flex items-center gap-2 rounded-md bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
          <svg
            className="h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <span>
            Impersonating as {userName}
            {impersonatorName ? ` (by ${impersonatorName})` : ''}
          </span>
        </div>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-4">
        <NotificationBell
          count={unreadCount}
          onClick={onNotificationClick}
        />
        <div className="flex items-center gap-2">
          <Avatar name={userName} src={userAvatarUrl} size="sm" />
          <span className="hidden text-sm font-medium text-gray-700 dark:text-gray-300 sm:inline">
            {userName}
          </span>
        </div>
      </div>
    </header>
  );
}
