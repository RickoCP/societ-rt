/**
 * Platform Admin Dashboard Page — App Router page for platform-wide administration.
 *
 * This page provides access to the PlatformDashboardScreen component for viewing
 * system-wide metrics and managing tenants:
 * - System-wide metrics (tenant counts, member counts, active sessions)
 * - Tenant overview table with filtering and sorting
 * - Recent alerts and warnings
 * - System health indicators (API response time, database latency, error rate)
 * - Auto-refresh with visual indicator
 * - Provision new tenant action
 *
 * Route: /admin/platform
 *
 * @see Requirements 19.1-19.11 (Platform Admin Dashboard)
 * @see PlatformDashboardScreen for full feature documentation
 */

import type { Metadata } from 'next';
import { PlatformDashboardScreen } from '@presentation/features/platform-admin';

/**
 * Page metadata for SEO and browser tab display.
 */
export const metadata: Metadata = {
  title: 'Platform Dashboard | SocieT RT Admin',
  description:
    'Monitor system-wide metrics, manage tenants, and view platform health across all communities.',
};

/**
 * PlatformDashboardPage — App Router page component for platform administration.
 */
export default function PlatformDashboardPage() {
  return <PlatformDashboardScreen />;
}
