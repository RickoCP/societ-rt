// Service worker registration (extracted from an inline script so that a
// Content-Security-Policy of `script-src 'self'` does not need 'unsafe-inline').
//
// In development mode, service workers can cause caching issues, so we only
// register in production or when explicitly enabled.
(function () {
  'use strict';

  // Skip service worker registration in development to avoid caching issues
  // and MIME type errors when Next.js dev server handles the request
  var isDev =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.startsWith('192.168.');

  if (isDev) {
    console.debug('[SW] Service worker registration skipped in development mode');
    return;
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker
        .register('/sw.js')
        .then(function (registration) {
          console.debug('[SW] Service worker registered:', registration.scope);
        })
        .catch(function (error) {
          console.debug('[SW] Service worker registration failed:', error.message);
        });
    });
  }
})();
