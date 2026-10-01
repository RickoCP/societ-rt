/**
 * Audit Log Page — App Router page for audit trail viewing.
 *
 * This page provides access to the AuditLogScreen component for viewing
 * and filtering the audit log including:
 * - Filterable audit entries by date, event type, actor, and resource
 * - Expandable row details with full JSON payload
 * - Export functionality (CSV, JSON)
 * - Pagination and sorting
 *
 * Route: /admin/audit-log
 *
 * @see Requirements 22.1 (App Router pages for administration)
 * @see AuditLogScreen for full feature documentation
 */

import type { Metadata } from 'next';
import { AuditLogScreen } from '@features/audit/screens/AuditLogScreen';

/**
 * Page metadata for SEO and browser tab display.
 */
export const metadata: Metadata = {
  title: 'Audit Log | SocieT RT Admin',
  description:
    'View and filter audit trail entries, export logs, and track system activities.',
};

/**
 * AuditLogPage — App Router page component for audit log viewing.
 */
export default function AuditLogPage() {
  return <AuditLogScreen />;
}
