/**
 * In-Memory Rate Limiter — Simple rate limiting for Edge middleware.
 *
 * Uses a Map to track request counts per IP within a sliding window.
 * Designed for use in Next.js middleware (Edge runtime) where Redis
 * is not available synchronously.
 *
 * Note: This is per-instance only. In a multi-instance deployment,
 * consider a Redis-based rate limiter at the route handler level.
 *
 * @see Requirements 21.4
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const rateLimitMap = new Map<string, RateLimitEntry>();

// Cleanup interval: remove expired entries every 60 seconds
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function cleanupExpiredEntries(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
    return;
  }
  lastCleanup = now;

  for (const [key, entry] of rateLimitMap) {
    if (entry.resetAt <= now) {
      rateLimitMap.delete(key);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether a request from the given IP is within the rate limit.
 *
 * @param ip - The client IP address
 * @param maxRequests - Maximum number of requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns Whether the request is allowed and how many requests remain
 */
export function checkRateLimit(
  ip: string,
  maxRequests: number,
  windowMs: number,
): RateLimitResult {
  cleanupExpiredEntries();

  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  // No existing entry or window has expired — start fresh
  if (!entry || entry.resetAt <= now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  // Within the current window
  if (entry.count < maxRequests) {
    entry.count += 1;
    return { allowed: true, remaining: maxRequests - entry.count };
  }

  // Rate limit exceeded
  return { allowed: false, remaining: 0 };
}
