/**
 * Audit Worker — BullMQ Worker that processes 'audit_log' queue jobs.
 *
 * Writes audit entries to the database via AuditRepository.
 *
 * Implements:
 * - Sensitive data exclusion: strips fields named password, token, otp, secret, cvv
 * - Sensitive data masking: masks NIK (show last 4), phone (show last 4),
 *   email (show first char + *** + @domain)
 *
 * @see Requirements 18.2, 18.5, 18.6, 27.1, 27.2, 27.7
 */

import { Worker, type Job } from 'bullmq';
import type { AuditRepository } from '@core/domains/audit/repositories/AuditRepository';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditJobPayload {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly actionType: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly details: Record<string, unknown>;
  readonly ipAddress?: string;
  readonly impersonatorId?: string;
}

// ---------------------------------------------------------------------------
// Sensitive data handling
// ---------------------------------------------------------------------------

/** Fields that must be completely stripped from audit details. */
const EXCLUDED_FIELDS = new Set([
  'password',
  'token',
  'otp',
  'secret',
  'cvv',
]);

/** Check if a string looks like an email address. */
function isEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

/** Check if a string looks like a phone number (digits, optional +, 7-15 chars). */
function isPhone(value: string): boolean {
  return /^\+?\d{7,15}$/.test(value);
}

/** Check if a string looks like a NIK (exactly 16 digits). */
function isNik(value: string): boolean {
  return /^\d{16}$/.test(value);
}

/** Mask an email: first char + *** + @domain. */
export function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) return '***';
  const firstChar = email[0];
  const domain = email.slice(atIndex);
  return `${firstChar}***${domain}`;
}

/** Mask a phone number: show last 4 digits. */
export function maskPhone(phone: string): string {
  if (phone.length <= 4) return '****';
  return '*'.repeat(phone.length - 4) + phone.slice(-4);
}

/** Mask a NIK: show last 4 digits. */
export function maskNik(nik: string): string {
  if (nik.length <= 4) return '****';
  return '*'.repeat(nik.length - 4) + nik.slice(-4);
}

/**
 * Sanitize audit details by:
 * 1. Excluding sensitive fields (password, token, otp, secret, cvv)
 * 2. Masking NIK, phone, and email values
 */
export function sanitizeAuditDetails(
  details: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details)) {
    // 1. Exclude sensitive fields
    if (EXCLUDED_FIELDS.has(key.toLowerCase())) {
      continue;
    }

    // 2. Mask string values that look like sensitive data
    if (typeof value === 'string') {
      const lowerKey = key.toLowerCase();

      if (lowerKey.includes('nik') && isNik(value)) {
        sanitized[key] = maskNik(value);
        continue;
      }

      if (
        (lowerKey.includes('phone') || lowerKey.includes('tel')) &&
        isPhone(value)
      ) {
        sanitized[key] = maskPhone(value);
        continue;
      }

      if (lowerKey.includes('email') && isEmail(value)) {
        sanitized[key] = maskEmail(value);
        continue;
      }

      // Also detect by value pattern even if key doesn't hint
      if (isNik(value) && !lowerKey.includes('id')) {
        sanitized[key] = maskNik(value);
        continue;
      }

      sanitized[key] = value;
      continue;
    }

    // 3. Recursively sanitize nested objects
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeAuditDetails(
        value as Record<string, unknown>,
      );
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

// ---------------------------------------------------------------------------
// Redis connection helper
// ---------------------------------------------------------------------------

function parseRedisConnection(): { host: string; port: number } {
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
  };
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

export function createAuditWorker({
  auditRepository,
}: {
  auditRepository: AuditRepository;
}): Worker {
  const connection = parseRedisConnection();

  const worker = new Worker<AuditJobPayload>(
    'audit_log',
    async (job: Job<AuditJobPayload>) => {
      const {
        tenantId,
        actorUserId,
        actionType,
        resourceType,
        resourceId,
        details,
        ipAddress,
        impersonatorId,
      } = job.data;

      // Sanitize details before persisting
      const sanitizedDetails = sanitizeAuditDetails(details);

      const result = await auditRepository.create(tenantId, {
        actorUserId,
        actionType,
        resourceType,
        resourceId,
        details: sanitizedDetails,
        ipAddress,
        impersonatorId,
      });

      if (!result.success) {
        throw new Error(
          `Failed to create audit log: ${result.error.code}`,
        );
      }
    },
    {
      connection,
      concurrency: 10,
    },
  );

  worker.on('failed', (job, err) => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
      console.error(
        JSON.stringify({
          level: 'error',
          code: 'AUDIT_LOG_WRITE_FAILED',
          jobId: job.id,
          tenantId: (job.data as AuditJobPayload).tenantId,
          actionType: (job.data as AuditJobPayload).actionType,
          attempts: job.attemptsMade,
          message: err.message,
          timestamp: new Date().toISOString(),
        }),
      );
    }
  });

  return worker;
}
