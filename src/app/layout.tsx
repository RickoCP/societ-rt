import type { Metadata, Viewport } from 'next';
import { QueryProvider } from '@presentation/providers/QueryProvider';
import { OfflineIndicator } from '@components/atoms/OfflineIndicator';
import './globals.css';

export const metadata: Metadata = {
  title: 'SocieT-RT — Community Management Platform',
  description:
    'Multi-tenant SaaS platform for managing RT/RW communities. Manage residents, finances, voting, announcements, and more.',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/icon-192x192.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SocieT-RT',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="h-full antialiased">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.svg" />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <QueryProvider>
          {children}
          <OfflineIndicator />
        </QueryProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function() {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
