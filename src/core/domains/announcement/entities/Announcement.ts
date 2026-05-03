/**
 * Announcement — Domain entity representing a community announcement
 * within a tenant.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 9.1, 9.2
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export type AnnouncementCategory =
  | 'umum'
  | 'keamanan'
  | 'keuangan'
  | 'kegiatan'
  | 'darurat';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface Announcement {
  readonly id: string;
  readonly tenantId: string;
  readonly title: string;
  readonly content: string;
  readonly category: AnnouncementCategory;
  readonly createdBy: string;
  readonly publishedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to create a new announcement. */
export interface CreateAnnouncementInput {
  readonly title: string;
  readonly content: string;
  readonly category: AnnouncementCategory;
}
