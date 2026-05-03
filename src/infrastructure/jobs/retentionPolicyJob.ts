/**
 * Retention Policy Job — Checks backup files against retention policy.
 *
 * Policy:
 * - Retain daily backups for 30 days
 * - Retain weekly backups (Sunday) for 90 days
 * - Auto-delete expired backups
 *
 * @see Requirements 24.2, 24.4, 24.7
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetentionConfig {
  /** Base directory for backup storage. Defaults to 'backups'. */
  readonly backupBaseDir?: string;
  /** Number of days to retain daily backups. Defaults to 30. */
  readonly dailyRetentionDays?: number;
  /** Number of days to retain weekly backups. Defaults to 90. */
  readonly weeklyRetentionDays?: number;
}

export interface RetentionResult {
  readonly status: 'success' | 'failed';
  readonly timestamp: string;
  readonly totalChecked: number;
  readonly deletedCount: number;
  readonly retainedCount: number;
  readonly deletedPaths: string[];
  readonly error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a date directory name (YYYY-MM-DD) into a Date object. */
function parseDateDir(dirName: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dirName);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month, day));
}

/** Check if a date falls on a Sunday (weekly backup candidate). */
function isSunday(date: Date): boolean {
  return date.getUTCDay() === 0;
}

/** Calculate the age of a backup in days from now. */
function getAgeDays(backupDate: Date, now: Date): number {
  const diffMs = now.getTime() - backupDate.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

/** Recursively delete a directory and its contents. */
function removeDirectorySync(dirPath: string): void {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Main retention function
// ---------------------------------------------------------------------------

export async function runRetentionPolicy(
  config: RetentionConfig = {},
): Promise<RetentionResult> {
  const now = new Date();
  const backupBaseDir = config.backupBaseDir ?? 'backups';
  const dailyRetentionDays = config.dailyRetentionDays ?? 30;
  const weeklyRetentionDays = config.weeklyRetentionDays ?? 90;

  const deletedPaths: string[] = [];
  let totalChecked = 0;

  try {
    if (!fs.existsSync(backupBaseDir)) {
      return {
        status: 'success',
        timestamp: now.toISOString(),
        totalChecked: 0,
        deletedCount: 0,
        retainedCount: 0,
        deletedPaths: [],
      };
    }

    const entries = fs.readdirSync(backupBaseDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const backupDate = parseDateDir(entry.name);
      if (!backupDate) continue;

      totalChecked++;
      const ageDays = getAgeDays(backupDate, now);

      // Determine if this backup should be retained
      const isWeeklyBackup = isSunday(backupDate);
      const retentionDays = isWeeklyBackup
        ? weeklyRetentionDays
        : dailyRetentionDays;

      if (ageDays > retentionDays) {
        const dirPath = path.join(backupBaseDir, entry.name);
        removeDirectorySync(dirPath);
        deletedPaths.push(dirPath);
      }
    }

    const result: RetentionResult = {
      status: 'success',
      timestamp: now.toISOString(),
      totalChecked,
      deletedCount: deletedPaths.length,
      retainedCount: totalChecked - deletedPaths.length,
      deletedPaths,
    };

    console.info(
      JSON.stringify({
        level: 'info',
        code: 'RETENTION_POLICY_COMPLETED',
        totalChecked: result.totalChecked,
        deletedCount: result.deletedCount,
        retainedCount: result.retainedCount,
        timestamp: result.timestamp,
      }),
    );

    return result;
  } catch (err: unknown) {
    const errorMessage =
      err instanceof Error ? err.message : 'Unknown retention error';

    const result: RetentionResult = {
      status: 'failed',
      timestamp: now.toISOString(),
      totalChecked,
      deletedCount: deletedPaths.length,
      retainedCount: totalChecked - deletedPaths.length,
      deletedPaths,
      error: errorMessage,
    };

    console.error(
      JSON.stringify({
        level: 'error',
        code: 'RETENTION_POLICY_FAILED',
        error: errorMessage,
        timestamp: now.toISOString(),
      }),
    );

    return result;
  }
}
