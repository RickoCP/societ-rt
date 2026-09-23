/**
 * Centralized secret resolution & strength enforcement (FASE 0 hardening).
 *
 * Single source of truth for reading security-critical secrets from the
 * environment. Enforces:
 *   - Presence (throws if missing).
 *   - Strength in production (rejects weak/short/known-weak values).
 *
 * Rules:
 *   - Production: a missing OR weak secret is a fatal error (fail-fast).
 *   - Non-production: a missing secret is fatal; a weak secret is tolerated
 *     (auth must still work locally) but is the caller's responsibility to fix.
 *
 * Secret VALUES are never logged or embedded in error messages.
 *
 * NOTE: This is Edge-runtime safe — it only reads process.env and does simple
 * string checks, so it can be imported from both middleware (Edge) and Node.
 */

const MIN_SECRET_LENGTH = 32;

const WEAK_SECRET_DENYLIST = new Set<string>([
  'socieTRT-rcp',
  'secret',
  'changeme',
  'change-me',
  'default',
  'default-dev-key',
  'dev',
  'development',
  'test',
  'jwt-secret',
  'your-secret-here',
]);

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** Returns true if a secret value is considered weak. */
export function isWeakSecret(value: string): boolean {
  return value.length < MIN_SECRET_LENGTH || WEAK_SECRET_DENYLIST.has(value.trim());
}

/**
 * Resolve a required secret from the environment.
 *
 * @param name - The environment variable name (used only for error messages;
 *               the VALUE is never included in errors/logs).
 * @throws if the secret is missing, or (in production) if it is weak.
 */
export function requireSecret(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Required secret "${name}" is not set. Authentication/security cannot proceed.`,
    );
  }

  if (isProduction() && isWeakSecret(value)) {
    throw new Error(
      `Secret "${name}" is too weak for production. Use a cryptographically ` +
        `secure random value of at least ${MIN_SECRET_LENGTH} characters ` +
        `(256-bit recommended). Known-weak values are rejected.`,
    );
  }

  return value;
}

/**
 * Resolve the JWT signing secret. Thin wrapper around requireSecret for the
 * single most security-critical secret in the app.
 */
export function requireJwtSecret(): string {
  return requireSecret('JWT_SECRET');
}
