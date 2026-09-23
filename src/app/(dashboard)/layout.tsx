'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@components/organisms/Sidebar';
import { Header } from '@components/organisms/Header';
import { BottomNav } from '@components/organisms/BottomNav';
import { NAV_ITEMS } from '@components/organisms/navItems';

const navItems = NAV_ITEMS;

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
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // On mobile, the home screen renders its own app-style header, so the shared
  // top Header is hidden there. Other pages keep it for the hamburger menu.
  const isHome = pathname === '/';

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
      {/* Desktop Sidebar */}
      <div className="relative z-30 hidden md:block">
        <Sidebar items={navItems} userRole={userRole} />
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-[9998] bg-black/50 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 z-[9999] md:hidden">
            <Sidebar
              items={navItems}
              userRole={userRole}
              onNavigate={() => setMobileMenuOpen(false)}
            />
          </div>
        </>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Desktop header (always) + mobile header (hidden on the app home) */}
        <div className={isHome ? 'hidden md:block' : 'block'}>
          <Header
            userName={userName}
            onLogout={handleLogout}
            onMenuToggle={() => setMobileMenuOpen(prev => !prev)}
          />
        </div>
        <main className="flex-1 overflow-y-auto bg-gray-50 px-4 pb-28 sm:p-6 md:pb-6 dark:bg-gray-950">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <BottomNav userRole={userRole} />
    </div>
  );
}
