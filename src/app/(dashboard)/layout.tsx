'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar, type NavItem } from '@components/organisms/Sidebar';
import { Header } from '@components/organisms/Header';

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/' },
  { label: 'Residents', href: '/residents', roles: ['Ketua_RT', 'Pengurus', 'Super_Admin'] },
  { label: 'Users', href: '/users', roles: ['Ketua_RT', 'Super_Admin'] },
  { label: 'Tenants', href: '/admin/tenants', roles: ['Super_Admin'] },
  { label: 'Finance', href: '/finance', roles: ['Ketua_RT', 'Pengurus', 'Super_Admin'] },
  { label: 'Voting', href: '/voting' },
  { label: 'Announcements', href: '/announcements' },
  { label: 'Events', href: '/events' },
  { label: 'Map', href: '/map' },
  { label: 'Security', href: '/security/patrols', roles: ['Ketua_RT', 'Pengurus', 'Security_Guard', 'Super_Admin'] },
  { label: 'Incidents', href: '/security/incidents', roles: ['Ketua_RT', 'Pengurus', 'Security_Guard', 'Super_Admin'] },
  { label: 'Visitors', href: '/visitors', roles: ['Ketua_RT', 'Pengurus', 'Security_Guard', 'Super_Admin'] },
  { label: 'Packages', href: '/packages', roles: ['Ketua_RT', 'Pengurus', 'Security_Guard', 'Super_Admin'] },
  { label: 'Administration', href: '/administration/letters' },
  { label: 'Emergency', href: '/emergency' },
  { label: 'Notifications', href: '/notifications' },
  { label: 'Audit Log', href: '/audit', roles: ['Ketua_RT', 'Super_Admin'] },
];

interface CurrentUser {
  userId: string;
  name: string;
  email: string;
  role: string;
  tenantId: string;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => {
        if (!res.ok) {
          router.push('/login');
          return null;
        }
        return res.json();
      })
      .then(json => {
        if (json?.data) {
          setCurrentUser(json.data);
        }
      })
      .catch(() => {
        router.push('/login');
      });
  }, [router]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const userRole = currentUser?.role ?? 'Warga';
  const userName = currentUser?.name ?? 'User';

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar items={navItems} userRole={userRole} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header userName={userName} onLogout={handleLogout} />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6 dark:bg-gray-950">
          {children}
        </main>
      </div>
    </div>
  );
}
