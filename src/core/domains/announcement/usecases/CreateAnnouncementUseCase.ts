/**
 * CreateAnnouncementUseCase — Creates a new announcement within a tenant.
 *
 * Logic:
 * 1. Validate attachments: max 5 files, each max 10 MB → fail with
 *    announcementAttachmentLimitExceeded()
 * 2. Create announcement via announcementRepository.create
 * 3. Add attachments if provided
 * 4. Enqueue notification dispatch via notificationQueueProtocol
 *    (to all Warga in tenant — fire-and-forget)
 * 5. Enqueue audit (action: 'announcement_created', fire-and-forget)
 * 6. Return ok(announcement)
 *
 * @see Requirements 9.1, 9.2, 9.3, 9.4, 9.5
 */

import type {
  AuthContext,
  AuditQueueProtocol,
  NotificationQueueProtocol,
} from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { AnnouncementRepository } from '../repositories/AnnouncementRepository';
import type {
  Announcement,
  AttachmentInput,
  CreateAnnouncementInput,
} from '../entities';
import { announcementAttachmentLimitExceeded } from '../errors/announcementErrors';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ATTACHMENTS = 5;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CreateAnnouncementUseCase {
  execute(params: {
    authContext: AuthContext;
    data: CreateAnnouncementInput;
    attachments?: AttachmentInput[];
  }): Promise<DomainResult<Announcement>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const CreateAnnouncementUseCaseImpl = ({
  announcementRepository,
  notificationQueueProtocol,
  auditQueueProtocol,
}: {
  announcementRepository: AnnouncementRepository;
  notificationQueueProtocol: NotificationQueueProtocol;
  auditQueueProtocol: AuditQueueProtocol;
}): CreateAnnouncementUseCase => ({
  execute: async ({ authContext, data, attachments }) => {
    // 1. Validate attachments: max 5 files, each max 10 MB
    if (attachments && attachments.length > 0) {
      if (attachments.length > MAX_ATTACHMENTS) {
        return fail(announcementAttachmentLimitExceeded());
      }

      const oversized = attachments.some(
        a => a.fileSize > MAX_FILE_SIZE_BYTES,
      );
      if (oversized) {
        return fail(announcementAttachmentLimitExceeded());
      }
    }

    // 2. Create announcement via repository
    const result = await announcementRepository.create(
      authContext.tenantId,
      data,
      authContext.userId,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const announcement = result.data;

    // 3. Add attachments if provided
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        const attachResult = await announcementRepository.addAttachment(
          announcement.id,
          attachment,
        );

        if (!attachResult.success) {
          return fail(attachResult.error);
        }
      }
    }

    // 4. Enqueue notification dispatch (fire-and-forget)
    notificationQueueProtocol
      .enqueueNotification({
        tenantId: authContext.tenantId,
        userId: '', // broadcast to all Warga in tenant
        type: 'announcement',
        title: data.title,
        body: data.content,
        channels: ['push', 'inbox'],
      })
      .catch(() => {
        /* notification must not block the response */
      });

    // 5. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'announcement_created',
        resourceType: 'announcement',
        resourceId: announcement.id,
        details: { title: data.title, category: data.category },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 6. Return success
    return ok(announcement);
  },
});
