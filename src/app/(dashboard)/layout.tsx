'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@components/organisms/Sidebar';
import { Header } from '@components/organisms/Header';
import { BottomNav } from '@components/organisms/BottomNav';
import { NAV_ITEMS } from '@components/organisms/navItems';
import { usePermissions, invalidatePermissionsCache } from '@presentation/hooks/usePermissions';

const navItems = NAV_ITEMS;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Use shared permission hook with caching (calls /api/auth/me only once)
  const { userContext, isLoading, isError } = usePermissions();

  // On mobile, the home screen renders its own app-style header, so the shared
  // top Header is hidden there. Other pages keep it for the hamburger menu.
  const isHome = pathname === '/';

  // Redirect to login if not authenticated (after loading completes)
  useEffect(() => {
    if (!isLoading && !userContext && isError) {
      router.push('/login');
    }
  }, [isLoading, userContext, isError, router]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    // Invalidate the permissions cache on logout
    invalidatePermissionsCache();
    router.push('/login');
  };

  // Show minimal loading state while checking auth
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const userRole = userContext?.role ?? 'Warga';
  const userName = userContext?.name ?? 'User';

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
