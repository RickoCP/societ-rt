/**
 * Tenant Settings Page — App Router page for tenant configuration management.
 *
 * This page provides access to the TenantSettingsScreen component for managing
 * tenant profile, configuration, and lifecycle including:
 * - Profile: name, address, logo, branding colors
 * - Configuration: siren device, notifications, timezone, language
 * - Lifecycle: status management, suspend/reactivate/close
 *
 * Route: /admin/settings
 *
 * @see Requirements 22.1 (App Router pages for administration)
 * @see TenantSettingsScreen for full feature documentation
 */

import type { Metadata } from 'next';
import { TenantSettingsScreen } from '@features/tenant-settings/screens/TenantSettingsScreen';

/**
 * Page metadata for SEO and browser tab display.
 */
export const metadata: Metadata = {
  title: 'Tenant Settings | SocieT RT Admin',
  description:
    'Manage tenant profile, configuration, and lifecycle settings.',
};

/**
 * TenantSettingsPage — App Router page component for tenant settings management.
 */
export default function TenantSettingsPage() {
  return <TenantSettingsScreen />;
}
