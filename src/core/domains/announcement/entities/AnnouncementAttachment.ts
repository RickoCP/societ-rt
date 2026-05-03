/**
 * AnnouncementAttachment — Domain entity representing a file attached
 * to an announcement.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 9.3
 */

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface AnnouncementAttachment {
  readonly id: string;
  readonly announcementId: string;
  readonly fileUrl: string;
  readonly fileName: string;
  readonly fileSize: number;
  readonly mimeType: string;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to add an attachment to an announcement. */
export interface AttachmentInput {
  readonly fileUrl: string;
  readonly fileName: string;
  readonly fileSize: number;
  readonly mimeType: string;
}
