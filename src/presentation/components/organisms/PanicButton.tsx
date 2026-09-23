'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEmergencyTriggerViewModel } from '@features/dashboard/viewModel/useEmergencyTriggerViewModel';

/** Milliseconds the user must keep the button held before the alert fires. */
const HOLD_DURATION_MS = 3000;
/** Progress-ring geometry. */
const RING_RADIUS = 30;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Center panic/SOS button for the mobile bottom navigation.
 *
 * Activates only on a press-and-hold longer than 3 seconds to prevent
 * accidental triggers. A progress ring fills while held and the alert is
 * dispatched via {@link useEmergencyTriggerViewModel} once the threshold is
 * reached. Releasing early cancels without sending anything.
 */
export function PanicButton() {
  const { trigger, isTriggering, isSuccess, error, reset } =
    useEmergencyTriggerViewModel();

  const [progress, setProgress] = useState(0); // 0 → 1 while held
  const [holding, setHolding] = useState(false);

  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const firedRef = useRef(false);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const cancelHold = useCallback(() => {
    stopLoop();
    setHolding(false);
    setProgress(0);
    firedRef.current = false;
  }, [stopLoop]);

  const beginHold = useCallback(() => {
    if (isTriggering) return;
    reset();
    firedRef.current = false;
    startRef.current = performance.now();
    setHolding(true);

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const ratio = Math.min(elapsed / HOLD_DURATION_MS, 1);
      setProgress(ratio);

      if (ratio >= 1) {
        if (!firedRef.current) {
          firedRef.current = true;
          trigger();
          // Haptic feedback where supported.
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate?.(200);
          }
        }
        setHolding(false);
        setProgress(0);
        stopLoop();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [isTriggering, reset, stopLoop, trigger]);

  // Auto-dismiss the success / error feedback bubble.
  useEffect(() => {
    if (!isSuccess && !error) return;
    const timer = setTimeout(reset, 4000);
    return () => clearTimeout(timer);
  }, [isSuccess, error, reset]);

  // Clean up the animation frame on unmount.
  useEffect(() => stopLoop, [stopLoop]);

  const strokeOffset = RING_CIRCUMFERENCE * (1 - progress);
  const secondsLeft = Math.ceil((1 - progress) * (HOLD_DURATION_MS / 1000));

  return (
    <div className="pointer-events-none absolute -top-8 left-1/2 z-50 -translate-x-1/2">
      {/* Feedback bubble */}
      {(isSuccess || error) && (
        <div
          role={error ? 'alert' : 'status'}
          className={`pointer-events-none absolute -top-11 left-1/2 w-56 -translate-x-1/2 rounded-xl px-3 py-2 text-center text-[11px] font-semibold shadow-lg ${
            error
              ? 'bg-red-600 text-white'
              : 'bg-emerald-600 text-white'
          }`}>
          {error ? error.message : '✅ Peringatan darurat terkirim'}
        </div>
      )}

      <button
        type="button"
        aria-label="Tahan 3 detik untuk mengirim peringatan darurat"
        disabled={isTriggering}
        onPointerDown={e => {
          e.preventDefault();
          e.currentTarget.setPointerCapture?.(e.pointerId);
          beginHold();
        }}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        onContextMenu={e => e.preventDefault()}
        className="pointer-events-auto relative flex h-[76px] w-[76px] touch-none select-none items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-rose-600 shadow-lg shadow-red-600/40 outline-none transition-transform active:scale-95 disabled:opacity-70">
        {/* Pulsing ring while idle to draw attention */}
        {!holding && !isTriggering && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-30" />
        )}

        {/* Progress ring while held */}
        <svg
          className="absolute inset-0 h-full w-full -rotate-90"
          viewBox="0 0 76 76"
          aria-hidden="true">
          <circle
            cx="38"
            cy="38"
            r={RING_RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="5"
          />
          {holding && (
            <circle
              cx="38"
              cy="38"
              r={RING_RADIUS}
              fill="none"
              stroke="white"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={strokeOffset}
            />
          )}
        </svg>

        <span className="relative flex flex-col items-center leading-none text-white">
          {isTriggering ? (
            <span className="text-[10px] font-bold">Mengirim…</span>
          ) : holding ? (
            <span className="text-xl font-extrabold tabular-nums">
              {secondsLeft}
            </span>
          ) : (
            <>
              <span className="text-2xl" aria-hidden="true">
                🆘
              </span>
            </>
          )}
        </span>
      </button>
    </div>
  );
}
