/**
 * Extract tenant subdomain from the current hostname.
 *
 * Production: rt-melati.societ-rt.com → "rt-melati"
 * Development: localhost → fallback to NEXT_PUBLIC_DEFAULT_SUBDOMAIN or "platform"
 *
 * @returns The subdomain string
 */
export function getTenantSubdomain(): string {
  if (typeof window === 'undefined') return 'platform';

  const hostname = window.location.hostname;

  // localhost or IP — use default
  if (hostname === 'localhost' || hostname === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return process.env.NEXT_PUBLIC_DEFAULT_SUBDOMAIN ?? 'platform';
  }

  // Extract first part of hostname: rt-melati.societ-rt.com → rt-melati
  const parts = hostname.split('.');
  if (parts.length >= 3) {
    return parts[0] ?? 'platform';
  }

  // Fallback
  return process.env.NEXT_PUBLIC_DEFAULT_SUBDOMAIN ?? 'platform';
}
