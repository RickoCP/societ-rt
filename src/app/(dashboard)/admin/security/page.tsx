/**
 * Security Events Page — App Router page for platform security monitoring.
 *
 * This page provides access to the SecurityEventsScreen component for viewing
 * and managing security events across the platform:
 * - Severity badges (Critical, High, Medium, Low)
 * - Event type filtering
 * - Date range filtering
 * - Acknowledged/unacknowledged filtering
 * - Sorting by timestamp, severity, type, tenant, user
 * - Event acknowledgment (single and bulk)
 * - Auto-refresh with visual indicator
 * - Security event trend visualization
 *
 * Route: /admin/security
 *
 * @see Requirements 21.1-21.10 (Security Event Alerts)
 * @see SecurityEventsScreen for full feature documentation
 */

import type { Metadata } from 'next';
import { SecurityEventsScreen } from '@presentation/features/platform-admin';

/**
 * Page metadata for SEO and browser tab display.
 */
export const metadata: Metadata = {
  title: 'Security Events | SocieT RT Admin',
  description:
    'Monitor and manage security events across the platform including threat detection and acknowledgment.',
};

/**
 * SecurityEventsPage — App Router page component for security event monitoring.
 */
export default function SecurityEventsPage() {
  return <SecurityEventsScreen />;
}
