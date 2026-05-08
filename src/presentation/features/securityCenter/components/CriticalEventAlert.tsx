'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@components/atoms/Button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CriticalEvent {
  id: string;
  eventType: string;
  severity: string;
  message: string;
  timestamp: string;
}

interface CriticalEventAlertProps {
  event: CriticalEvent;
  onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getEventLabel(eventType: string): string {
  switch (eventType) {
    case 'panic_button_pressed':
      return '🚨 PANIC BUTTON';
    case 'smoke_detected':
      return '🔥 SMOKE DETECTED';
    case 'emergency_alert':
      return '⚠️ EMERGENCY ALERT';
    default:
      return '🚨 CRITICAL EVENT';
  }
}

/**
 * Plays a short beep sound using the Web Audio API.
 * Falls back silently if AudioContext is unavailable.
 */
function playAlertBeep(): void {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.5);

    // Cleanup
    oscillator.onended = () => {
      ctx.close().catch(() => { /* ignore */ });
    };
  } catch {
    // Audio not available — fail silently
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CriticalEventAlert({ event, onDismiss }: CriticalEventAlertProps) {
  const hasPlayedRef = useRef(false);

  useEffect(() => {
    if (!hasPlayedRef.current) {
      hasPlayedRef.current = true;
      playAlertBeep();
    }
  }, [event.id]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="animate-pulse rounded-lg border-2 border-red-500 bg-red-50 p-4 shadow-lg dark:border-red-400 dark:bg-red-900/30"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-lg font-bold text-red-700 dark:text-red-300">
            {getEventLabel(event.eventType)}
          </p>
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
            {event.message}
          </p>
          <p className="mt-1 text-xs text-red-500 dark:text-red-500">
            {new Date(event.timestamp).toLocaleString()}
          </p>
        </div>
        <Button
          onClick={onDismiss}
          aria-label="Dismiss critical alert"
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
