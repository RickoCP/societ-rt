// Service worker registration (extracted from an inline script so that a
// Content-Security-Policy of `script-src 'self'` does not need 'unsafe-inline').
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}
