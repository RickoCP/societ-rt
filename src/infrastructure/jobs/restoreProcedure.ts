/**
 * Restore Procedure — Restore script using pg_restore from specified backup file.
 *
 * Pre-restore validation:
 * - Check file exists
 * - Check file format (.sql.gz extension)
 *
 * Uses child_process.exec for pg_restore (placeholder — actual execution depends on environment).
 *
 * @see Requirements 24.3, 24.8
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RestoreResult {
  readonly status: 'success' | 'failed';
  readonly timestamp: string;
  readonly durationMs: number;
  readonly backupPath: string;
  readonly error?: string;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateBackupFile(backupPath: string): string | null {
  if (!fs.existsSync(backupPath)) {
    return `Backup file not found: ${backupPath}`;
  }

  if (!backupPath.endsWith('.sql.gz')) {
    return `Invalid backup file format. Expected .sql.gz extension, got: ${backupPath}`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main restore function
// ---------------------------------------------------------------------------

export async function runRestore(
  backupPath: string,
): Promise<RestoreResult> {
  const startTime = Date.now();
  const now = new Date();

  // Pre-restore validation
  const validationError = validateBackupFile(backupPath);
  if (validationError) {
    return {
      status: 'failed',
      timestamp: now.toISOString(),
      durationMs: Date.now() - startTime,
      backupPath,
      error: validationError,
    };
  }

  const databaseUrl = process.env.DATABASE_URL ?? '';

  try {
    // Decompress and pipe to psql for restore
    const command = `gunzip -c "${backupPath}" | psql "${databaseUrl}"`;
    await execAsync(command, { timeout: 1_800_000 }); // 30 minute timeout

    const durationMs = Date.now() - startTime;

    const result: RestoreResult = {
      status: 'success',
      timestamp: now.toISOString(),
      durationMs,
      backupPath,
    };

    console.info(
      JSON.stringify({
        level: 'info',
        code: 'RESTORE_COMPLETED',
        durationMs: result.durationMs,
        backupPath: result.backupPath,
        timestamp: result.timestamp,
      }),
    );

    return result;
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const errorMessage =
      err instanceof Error ? err.message : 'Unknown restore error';

    const result: RestoreResult = {
      status: 'failed',
      timestamp: now.toISOString(),
      durationMs,
      backupPath,
      error: errorMessage,
    };

    console.error(
      JSON.stringify({
        level: 'error',
        code: 'RESTORE_FAILED',
        error: errorMessage,
        backupPath,
        timestamp: now.toISOString(),
      }),
    );

    return result;
  }
}
