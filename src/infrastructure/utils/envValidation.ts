/**
 * Environment Variable Validation
 *
 * Validates environment variables at application startup using Zod, with
 * awareness of THREE tiers:
 *
 *   1. ALWAYS required      — must exist in every environment (dev/test/prod).
 *   2. PRODUCTION required   — must exist and be strong when NODE_ENV=production.
 *   3. FEATURE-conditional   — required only when the owning feature is enabled
 *                              (e.g. Tuya/IoT, CCTV, Web Push, S3 storage).
 *
 * Design goals (FASE 0 security hardening):
 *   - Fail fast in production for missing/weak critical secrets.
 *   - Do NOT crash startup just because an OPTIONAL feature's env is absent
 *     when that feature is disabled for the environment.
 *   - Reject known-weak JWT secrets (e.g. the old dev value) in production.
 *   - Never log secret values.
 *
 * Usage:
 * ```ts
 * import { validateEnv, getEnv } from '@utils/envValidation';
 * validateEnv();          // call once at startup (see src/instrumentation.ts)
 * const env = getEnv();   // typed, validated access afterwards
 * ```
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum acceptable JWT secret length (characters). 256-bit recommended. */
const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Known-weak secret values that must never be used in production.
 * These are rejected outright regardless of length.
 */
const WEAK_SECRET_DENYLIST = new Set<string>([
  'socieTRT-rcp',
  'secret',
  'changeme',
  'change-me',
  'default',
  'dev',
  'development',
  'test',
  'jwt-secret',
  'your-secret-here',
]);

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

// ---------------------------------------------------------------------------
// Schema (base — cross-environment shape)
// ---------------------------------------------------------------------------

const envSchema = z.object({
  // --- ALWAYS required ---
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),

  // --- Environment ---
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  // --- Feature-conditional (validated further in refinements) ---
  // S3 / object storage
  S3_BUCKET: z.string().default('societ-rt-files'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_ACCESS_KEY_ID: z.string().default(''),
  S3_SECRET_ACCESS_KEY: z.string().default(''),
  S3_TOKEN: z.string().default(''),

  // Web Push (VAPID)
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default('mailto:admin@societ-rt.com'),

  // Physical alarm / IoT (Tuya)
  ALARM_PROVIDER: z.string().default('tuya'),
  ALARM_DEVICE_ID: z.string().default(''),
  ALARM_SIREN_DP_CODE: z.string().default(''),
  TUYA_API_HOST: z.string().default('https://openapi.tuyaus.com'),
  TUYA_CLIENT_ID: z.string().default(''),
  TUYA_CLIENT_SECRET: z.string().default(''),
  TUYA_ENCRYPTION_KEY: z.string().default(''),

  // CCTV
  CCTV_ENCRYPTION_KEY: z.string().default(''),

  // Misc
  NEXT_PUBLIC_DEFAULT_SUBDOMAIN: z.string().default('platform'),
  WS_PORT: z.string().default('3001'),
});

// ---------------------------------------------------------------------------
// Cross-field / production refinements
// ---------------------------------------------------------------------------

/**
 * Validate the JWT secret strength. Applied in all environments, but only
 * *enforced* strictly in production. In non-production, a weak secret produces
 * a console warning (so local dev is not blocked) — it is NEVER logged.
 */
function refineJwtSecret(
  data: z.infer<typeof envSchema>,
  ctx: z.RefinementCtx,
): void {
  const secret = data.JWT_SECRET;
  const weak =
    secret.length < MIN_JWT_SECRET_LENGTH ||
    WEAK_SECRET_DENYLIST.has(secret.trim());

  if (!weak) return;

  if (data.NODE_ENV === 'production') {
    ctx.addIssue({
      code: 'custom',
      path: ['JWT_SECRET'],
      message:
        'JWT_SECRET is too weak for production. Use a cryptographically ' +
        `secure random value of at least ${MIN_JWT_SECRET_LENGTH} characters ` +
        '(256-bit recommended). Known-weak values are rejected.',
    });
  } else {
    // Non-production: warn but allow. Never print the secret itself.
    console.warn(
      JSON.stringify({
        level: 'warn',
        code: 'ENV_WEAK_JWT_SECRET',
        message:
          'JWT_SECRET is weak. This is tolerated in non-production only. ' +
          'Set a strong 256-bit secret before deploying to production.',
      }),
    );
  }
}

/**
 * In production, certain feature groups — if the feature is *configured at all*
 * — must be fully configured, so we fail fast rather than half-enabling.
 * A feature that is entirely absent (all keys empty) is treated as DISABLED
 * for that environment and does NOT block startup.
 */
function refineProductionFeatures(
  data: z.infer<typeof envSchema>,
  ctx: z.RefinementCtx,
): void {
  if (data.NODE_ENV !== 'production') return;

  // --- Tuya / IoT alarm: if partially configured, require the full set ---
  const tuyaKeys = [data.TUYA_CLIENT_ID, data.TUYA_CLIENT_SECRET];
  const tuyaPartiallySet = tuyaKeys.some(v => v.trim() !== '');
  const tuyaFullySet = tuyaKeys.every(v => v.trim() !== '');
  if (tuyaPartiallySet && !tuyaFullySet) {
    ctx.addIssue({
      code: 'custom',
      path: ['TUYA_CLIENT_SECRET'],
      message:
        'Tuya/IoT feature appears enabled but is misconfigured: ' +
        'TUYA_CLIENT_ID and TUYA_CLIENT_SECRET must both be set.',
    });
  }

  // --- S3 storage: if partially configured, require credentials ---
  const s3PartiallySet =
    data.S3_ENDPOINT.trim() !== '' &&
    data.S3_ENDPOINT !== 'http://localhost:9000';
  if (s3PartiallySet) {
    const hasKeypair =
      data.S3_ACCESS_KEY_ID.trim() !== '' &&
      data.S3_SECRET_ACCESS_KEY.trim() !== '';
    const hasToken = data.S3_TOKEN.trim() !== '';
    if (!hasKeypair && !hasToken) {
      ctx.addIssue({
        code: 'custom',
        path: ['S3_SECRET_ACCESS_KEY'],
        message:
          'S3 storage endpoint is configured but no credentials found ' +
          '(need either S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY, or S3_TOKEN).',
      });
    }
  }

  // --- Web Push: if one VAPID key is set, both must be set ---
  const vapidPartiallySet =
    data.VAPID_PUBLIC_KEY.trim() !== '' || data.VAPID_PRIVATE_KEY.trim() !== '';
  const vapidFullySet =
    data.VAPID_PUBLIC_KEY.trim() !== '' && data.VAPID_PRIVATE_KEY.trim() !== '';
  if (vapidPartiallySet && !vapidFullySet) {
    ctx.addIssue({
      code: 'custom',
      path: ['VAPID_PRIVATE_KEY'],
      message:
        'Web Push (VAPID) is partially configured: both VAPID_PUBLIC_KEY ' +
        'and VAPID_PRIVATE_KEY must be set together.',
    });
  }
}

const refinedEnvSchema = envSchema
  .superRefine(refineJwtSecret)
  .superRefine(refineProductionFeatures);

// ---------------------------------------------------------------------------
// Typed env export
// ---------------------------------------------------------------------------

export type Env = z.infer<typeof envSchema>;

let _env: Env | undefined;

/**
 * Validates environment variables and populates the typed `env` object.
 * Throws with a clear message listing every missing/invalid variable.
 * Secret VALUES are never included in error output.
 *
 * Safe to call multiple times — subsequent calls return the cached result.
 */
export function validateEnv(): Env {
  if (_env) return _env;

  const result = refinedEnvSchema.safeParse(process.env);

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

/**
 * Whether the current runtime is production. Small helper so callers do not
 * need to reach into process.env directly for this common check.
 */
export function isProductionEnv(): boolean {
  return isProduction();
}
