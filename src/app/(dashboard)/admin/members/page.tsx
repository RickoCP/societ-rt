/**
 * Members Management Page — App Router page for tenant member management.
 *
 * This page provides access to the MemberListScreen component for managing
 * tenant members including invitations, role changes, and status management.
 *
 * Route: /admin/members
 *
 * @see Requirements 22.1 (App Router pages for administration)
 * @see MemberListScreen for full feature documentation
 */

import type { Metadata } from 'next';
import { MemberListScreen } from '@features/membership/screens/MemberListScreen';

/**
 * Page metadata for SEO and browser tab display.
 */
export const metadata: Metadata = {
  title: 'Members Management | SocieT RT Admin',
  description:
    'Manage tenant members, invitations, roles, and membership status.',
};

/**
 * MembersPage — App Router page component for members management.
 */
export default function MembersPage() {
  return <MemberListScreen />;
}
