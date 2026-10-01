/**
 * OrgUnit Hierarchy Page — App Router page for organizational unit management.
 *
 * This page provides access to the OrgUnitTreeScreen component for viewing
 * and managing the organizational hierarchy including creation, editing,
 * deletion, member assignment, and reparenting operations.
 *
 * Route: /admin/org-units
 *
 * @see Requirements 22.1 (App Router pages for administration)
 * @see OrgUnitTreeScreen for full feature documentation
 */

import type { Metadata } from 'next';
import { OrgUnitTreeScreen } from '@features/orgunit/screens/OrgUnitTreeScreen';

/**
 * Page metadata for SEO and browser tab display.
 */
export const metadata: Metadata = {
  title: 'Organizational Structure | SocieT RT Admin',
  description:
    'View and manage the organizational unit hierarchy, create new units, and assign members.',
};

/**
 * OrgUnitsPage — App Router page component for OrgUnit hierarchy management.
 */
export default function OrgUnitsPage() {
  return <OrgUnitTreeScreen />;
}
