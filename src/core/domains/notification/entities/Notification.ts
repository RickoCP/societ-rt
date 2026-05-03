/**
 * Notification — Domain entity representing a notification sent to a user.
 *
 * Notifications can be delivered via push, email, or inbox channels.
 * Inbox notifications are persisted in the database and can be marked as read.
 *
 * @see Requirements 17.3
 */

export type NotificationChannel = 'push' | 'email' | 'inbox';
export type NotificationStatus = 'unread' | 'read';

export interface Notification {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly type: string;
  readonly title: string;
  readonly body: string;
  readonly channel: NotificationChannel;
  readonly status: NotificationStatus;
  readonly createdAt: Date;
}

export interface CreateNotificationInput {
  readonly userId: string;
  readonly type: string;
  readonly title: string;
  readonly body: string;
  readonly channel: NotificationChannel;
}
