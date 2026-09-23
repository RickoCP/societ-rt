/**
 * Security headers (FASE 0 hardening).
 *
 * Central definition of HTTP security headers applied by middleware to every
 * response. Kept in one module so the policy is auditable and testable.
 *
 * CSP design notes (compatibility-first for FASE 0):
 *   - script-src 'self'      — inline scripts were removed (service-worker
 *                              registration moved to /sw-register.js). No
 *                              'unsafe-inline'/'unsafe-eval' in script-src.
 *   - style-src needs 'unsafe-inline' — Next.js and Leaflet inject inline
 *                              <style>/style attributes. Removing this would
 *                              break rendering. Tracked as a residual hardening
 *                              item (move to nonces/hashes later).
 *   - img-src allows OpenStreetMap tiles + data: + blob: + https: — Leaflet map
 *                              tiles and uploaded images.
 *   - connect-src allows self + OSM nominatim (geocoding) + ws/wss (realtime).
 *   - frame-ancestors 'none'  — clickjacking protection (complements
 *                              X-Frame-Options: DENY).
 *
 * HSTS is only emitted in production (HTTPS). Never emit HSTS over plain HTTP
 * in development.
 */

function buildContentSecurityPolicy(): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // No inline/eval scripts. SW registration is an external static file.
    'script-src': ["'self'"],
    // Inline styles required by Next.js/Leaflet (residual hardening item).
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': [
      "'self'",
      'data:',
      'blob:',
      'https:',
      'https://*.tile.openstreetmap.org',
    ],
    'font-src': ["'self'", 'data:'],
    'connect-src': [
      "'self'",
      'https://nominatim.openstreetmap.org',
      'ws:',
      'wss:',
    ],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'object-src': ["'none'"],
  };

  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
}

const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'camera=()',
  'geolocation=(self)',
  'gyroscope=()',
  'magnetometer=()',
  'microphone=()',
  'payment=()',
  'usb=()',
].join(', ');

export interface SecurityHeaderEntry {
  readonly name: string;
  readonly value: string;
}

/**
 * Returns the list of security headers to apply. HSTS is included only when
 * `isProduction` is true (HTTPS assumed in production).
 */
export function getSecurityHeaders(isProduction: boolean): SecurityHeaderEntry[] {
  const headers: SecurityHeaderEntry[] = [
    { name: 'X-Content-Type-Options', value: 'nosniff' },
    { name: 'X-Frame-Options', value: 'DENY' },
    { name: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { name: 'Permissions-Policy', value: PERMISSIONS_POLICY },
    { name: 'Content-Security-Policy', value: buildContentSecurityPolicy() },
  ];

  if (isProduction) {
    headers.push({
      name: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload',
    });
  }

  return headers;
}
