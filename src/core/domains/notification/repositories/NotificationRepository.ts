/**
 * NotificationRepository — Core repository interface for notification persistence.
 *
 * Defines the contract for creating, querying, and updating notifications.
 * Infrastructure layer provides the concrete implementation.
 *
 * @see Requirements 17.3
 */

import type { DomainResult } from '@core/utils';
import type { PaginatedResult } from '@core/domains/resident/entities';
import type { Notification, CreateNotificationInput } from '../entities';

export interface NotificationFilters {
  readonly status?: 'unread' | 'read';
  readonly page?: number;
  readonly pageSize?: number;
}

export interface NotificationRepository {
  /** Create a new notification record. */
  create(
    tenantId: string,
    data: CreateNotificationInput,
  ): Promise<DomainResult<Notification>>;

  /** Find notifications for a specific user (paginated). */
  findByUser(
    tenantId: string,
    userId: string,
    filters: NotificationFilters,
  ): Promise<DomainResult<PaginatedResult<Notification>>>;

  /** Mark a notification as read. */
  markAsRead(
    tenantId: string,
    notificationId: string,
  ): Promise<DomainResult<Notification>>;
}
