/**
 * Backup Job — Runs pg_dump for daily database backup.
 *
 * Configurable time (default 02:00 UTC).
 * Backup storage path: backups/{date}/societ-rt-{timestamp}.sql.gz
 * Logs: status (success/failed), timestamp, backup size, duration, storage path.
 *
 * Uses child_process.exec for pg_dump (placeholder — actual execution depends on environment).
 *
 * @see Requirements 24.1, 24.2, 24.3, 24.5
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BackupConfig {
  /** PostgreSQL connection string. Falls back to DATABASE_URL env. */
  readonly databaseUrl?: string;
  /** Base directory for backup storage. Defaults to 'backups'. */
  readonly backupBaseDir?: string;
  /** Scheduled hour in UTC (0-23). Defaults to 2 (02:00 UTC). */
  readonly scheduledHourUtc?: number;
}

export interface BackupResult {
  readonly status: 'success' | 'failed';
  readonly timestamp: string;
  readonly backupSizeBytes: number;
  readonly durationMs: number;
  readonly storagePath: string;
  readonly error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0] ?? '';
}

function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getFileSizeBytes(filePath: string): number {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Main backup function
// ---------------------------------------------------------------------------

export async function runDailyBackup(
  config: BackupConfig = {},
): Promise<BackupResult> {
  const startTime = Date.now();
  const now = new Date();
  const databaseUrl = config.databaseUrl ?? process.env.DATABASE_URL ?? '';
  const backupBaseDir = config.backupBaseDir ?? 'backups';

  const dateDir = formatDate(now);
  const timestamp = formatTimestamp(now);
  const fileName = `societ-rt-${timestamp}.sql.gz`;
  const dirPath = path.join(backupBaseDir, dateDir);
  const filePath = path.join(dirPath, fileName);

  try {
    ensureDirectoryExists(dirPath);

    // pg_dump piped through gzip for compressed backup
    const command = `pg_dump "${databaseUrl}" | gzip > "${filePath}"`;
    await execAsync(command, { timeout: 600_000 }); // 10 minute timeout

    const durationMs = Date.now() - startTime;
    const backupSizeBytes = getFileSizeBytes(filePath);

    const result: BackupResult = {
      status: 'success',
      timestamp: now.toISOString(),
      backupSizeBytes,
      durationMs,
      storagePath: filePath,
    };

    console.info(
      JSON.stringify({
        level: 'info',
        code: 'BACKUP_COMPLETED',
        ...result,
      }),
    );

    return result;
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const errorMessage =
      err instanceof Error ? err.message : 'Unknown backup error';

    const result: BackupResult = {
      status: 'failed',
      timestamp: now.toISOString(),
      backupSizeBytes: 0,
      durationMs,
      storagePath: filePath,
      error: errorMessage,
    };

    console.error(
      JSON.stringify({
        level: 'error',
        code: 'BACKUP_FAILED',
        ...result,
      }),
    );

    return result;
  }
}
