'use client';

/**
 * Admin section layout — wraps all /admin/* pages.
 *
 * Renders the PLATFORM_ADMIN tenant selector above the page content so a
 * platform admin can choose which tenant's data to view across the admin
 * pages (members, org-units, settings, subscription). The selector renders
 * nothing for non-platform-admins.
 *
 * Thin composition layer only — no business logic (per App Router convention).
 */

import type { ReactNode } from 'react';
import { TenantSelector } from '@components/organisms/TenantSelector';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <TenantSelector />
      {children}
    </div>
  );
}
