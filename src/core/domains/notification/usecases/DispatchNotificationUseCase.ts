/**
 * DispatchNotificationUseCase — Creates notification records and dispatches
 * via the appropriate channel.
 *
 * - inbox: creates a DB record via NotificationRepository
 * - push/email: placeholder (logs intent, no external service integration yet)
 *
 * Factory function pattern for Awilix DI compatibility.
 *
 * @see Requirements 17.3
 */

import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError } from '@core/utils';
import type { Notification } from '../entities';
import type { NotificationRepository } from '../repositories/NotificationRepository';

export interface DispatchNotificationInput {
  readonly tenantId: string;
  readonly userId: string;
  readonly type: string;
  readonly title: string;
  readonly body: string;
  readonly channels: ('push' | 'email' | 'inbox')[];
}

export interface DispatchNotificationUseCase {
  execute(
    input: DispatchNotificationInput,
  ): Promise<DomainResult<Notification[]>>;
}

export const DispatchNotificationUseCaseImpl = ({
  notificationRepository,
}: {
  notificationRepository: NotificationRepository;
}): DispatchNotificationUseCase => ({
  execute: async (
    input: DispatchNotificationInput,
  ): Promise<DomainResult<Notification[]>> => {
    try {
      const notifications: Notification[] = [];

      for (const channel of input.channels) {
        if (channel === 'inbox') {
          const result = await notificationRepository.create(input.tenantId, {
            userId: input.userId,
            type: input.type,
            title: input.title,
            body: input.body,
            channel: 'inbox',
          });

          if (result.success) {
            notifications.push(result.data);
          }
        }

        // push and email are placeholders — no external service integration yet.
        // In production, these would call a push notification service or email provider.
        if (channel === 'push') {
          // Placeholder: push notification dispatch
        }

        if (channel === 'email') {
          // Placeholder: email notification dispatch
        }
      }

      return ok(notifications);
    } catch (error) {
      return fail(
        technicalError(
          'NOTIFICATION_DISPATCH_FAILED',
          'Failed to dispatch notification',
          { cause: error },
        ),
      );
    }
  },
});
