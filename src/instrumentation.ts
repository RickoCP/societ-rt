/**
 * Next.js instrumentation hook.
 *
 * Runs once when the server process starts (Node.js runtime). We use it to
 * validate environment variables up front so the process fails fast on
 * misconfiguration — especially missing/weak security-critical secrets in
 * production — instead of failing lazily at the first request.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

export async function register(): Promise<void> {
  // Only run env validation in the Node.js runtime. The Edge runtime (used by
  // middleware) does not have full process.env access at register time and
  // validates its own critical secret (JWT_SECRET) lazily on first use.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnv } = await import(
      '@infrastructure/utils/envValidation'
    );
    validateEnv();
  }
}
