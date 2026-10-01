/**
 * Tenant Detail Page — App Router page for comprehensive tenant information.
 *
 * This page provides access to the TenantDetailScreen component for viewing
 * detailed tenant information:
 * - Profile: Full tenant profile including contact information
 * - Subscription: Plan details, features, limits, and usage
 * - Members: Member count and distribution by role
 * - Audit: Recent audit logs (last 100 entries)
 * - Lifecycle: Status history and state transitions
 * - Operations: Impersonate, suspend, close, reset token version
 *
 * Route: /admin/tenants/[id]
 *
 * @see Requirements 20.1 (Platform Admin Tenant Operations)
 * @see TenantDetailScreen for full feature documentation
 */

import type { Metadata } from 'next';
import { TenantDetailScreen } from '@presentation/features/platform-admin';

/**
 * Page metadata for SEO and browser tab display.
 */
export const metadata: Metadata = {
  title: 'Tenant Detail | SocieT RT Admin',
  description:
    'View comprehensive tenant information including profile, subscription, members, and audit logs.',
};

/**
 * Tenant Detail Page Props
 */
interface TenantDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * TenantDetailPage — App Router page component for tenant detail viewing.
 */
export default async function TenantDetailPage({
  params,
}: TenantDetailPageProps) {
  const { id: tenantId } = await params;

  return <TenantDetailScreen tenantId={tenantId} />;
}
