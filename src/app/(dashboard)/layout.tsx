'use client';

import { Sidebar, type NavItem } from '@components/organisms/Sidebar';
import { Header } from '@components/organisms/Header';

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Residents', href: '/residents', roles: ['Ketua_RT', 'Pengurus', 'Super_Admin'] },
  { label: 'Finance', href: '/finance', roles: ['Ketua_RT', 'Pengurus', 'Super_Admin'] },
  { label: 'Voting', href: '/voting' },
  { label: 'Announcements', href: '/announcements' },
  { label: 'Events', href: '/events' },
  { label: 'Map', href: '/map' },
  { label: 'Security', href: '/security', roles: ['Ketua_RT', 'Pengurus', 'Security_Guard', 'Super_Admin'] },
  { label: 'Visitors', href: '/visitors', roles: ['Ketua_RT', 'Pengurus', 'Security_Guard', 'Super_Admin'] },
  { label: 'Administration', href: '/administration' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // TODO: Replace with actual auth context from session
  const userRole = 'Warga';
  const userName = 'User';

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar items={navItems} userRole={userRole} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header userName={userName} />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6 dark:bg-gray-950">
          {children}
        </main>
      </div>
    </div>
  );
}
