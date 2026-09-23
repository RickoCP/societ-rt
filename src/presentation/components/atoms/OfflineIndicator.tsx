'use client';

import { useSyncExternalStore } from 'react';

/**
 * Subscribe to the browser's online/offline events.
 * Using useSyncExternalStore is the idiomatic way to read a browser/external
 * store without a setState-in-effect: React manages the subscription and
 * re-renders on change. The server snapshot is `true` (assume online) so SSR
 * output is stable and the indicator only appears once the client confirms
 * offline.
 */
function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

function getServerSnapshot(): boolean {
  // Assume online during SSR (navigator is unavailable on the server).
  return true;
}

export function OfflineIndicator() {
  const isOnline = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  if (isOnline) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-0 left-0 right-0 z-50 bg-yellow-500 px-4 py-2 text-center text-sm font-medium text-yellow-900">
      You are currently offline. Some features may be unavailable.
    </div>
  );
}
