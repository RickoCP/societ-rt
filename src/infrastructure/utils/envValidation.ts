/**
 * Environment Variable Validation
 *
 * Validates all required environment variables at application startup using Zod.
 * Throws a clear, descriptive error if any required variable is missing.
 *
 * Usage:
 * ```ts
 * import { validateEnv, getEnv } from '@utils/envValidation';
 *
 * // Call once at startup to validate and populate the typed env object:
 * validateEnv();
 *
 * // Then use the typed env object anywhere:
 * const env = getEnv();
 * console.log(env.DATABASE_URL);
 * ```
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const envSchema = z.object({
  // Required
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),

  // Optional with defaults
  S3_BUCKET: z.string().default('societ-rt-files'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_ACCESS_KEY_ID: z.string().default(''),
  S3_SECRET_ACCESS_KEY: z.string().default(''),

  // VAPID (optional)
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default('mailto:admin@societ-rt.com'),
});

// ---------------------------------------------------------------------------
// Typed env export
// ---------------------------------------------------------------------------

export type Env = z.infer<typeof envSchema>;

let _env: Env | undefined;

/**
 * Validates all required environment variables and populates the typed `env`
 * object. Throws with a clear message listing every missing/invalid variable.
 *
 * Safe to call multiple times — subsequent calls return the cached result.
 */
export function validateEnv(): Env {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = z.prettifyError(result.error);
    throw new Error(`❌ Environment validation failed:\n${formatted}`);
  }

  _env = result.data;
  return _env;
}

/**
 * Typed, validated environment variables.
 *
 * Access this only after `validateEnv()` has been called at least once.
 * Throws if accessed before validation.
 */
export function getEnv(): Env {
  if (!_env) {
    throw new Error(
      'Environment has not been validated yet. Call validateEnv() first.',
    );
  }
  return _env;
}
