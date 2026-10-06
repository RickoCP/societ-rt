'use client';

/**
 * useAccessibility - Accessibility utilities for admin UI components.
 *
 * Provides:
 * - Focus trap management for modals/dialogs
 * - ARIA live region announcements
 * - Keyboard navigation helpers
 * - Focus management utilities
 *
 * @see Requirements 23.5-23.12 (Responsive and Accessible UI)
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

// ---------------------------------------------------------------------------
// Focus Trap Hook
// ---------------------------------------------------------------------------

/**
 * Focusable elements selector for focus trap.
 */
const FOCUSABLE_ELEMENTS_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable]',
].join(', ');

/**
 * Options for useFocusTrap hook.
 */
export interface UseFocusTrapOptions {
  /** Whether the focus trap is active */
  enabled?: boolean;
  /** Return focus to this element when trap is disabled */
  returnFocusOnDeactivate?: boolean;
  /** Initially focused element selector (defaults to first focusable) */
  initialFocusSelector?: string;
  /** Callback when user attempts to tab out of trap */
  onEscapeAttempt?: () => void;
}

/**
 * useFocusTrap - Traps focus within a container element.
 *
 * When enabled, Tab and Shift+Tab will cycle through focusable elements
 * within the container. Focus will not leave the container.
 *
 * @see Requirements 23.9 (Focus trapping for modals)
 *
 * @example
 * ```tsx
 * function Modal({ isOpen, onClose }) {
 *   const containerRef = useFocusTrap<HTMLDivElement>({
 *     enabled: isOpen,
 *     returnFocusOnDeactivate: true,
 *   });
 *
 *   return (
 *     <div ref={containerRef} role="dialog" aria-modal="true">
 *       ...
 *     </div>
 *   );
 * }
 * ```
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>(
  options: UseFocusTrapOptions = {},
): RefObject<T> {
  const {
    enabled = true,
    returnFocusOnDeactivate = true,
    initialFocusSelector,
    onEscapeAttempt,
  } = options;

  const containerRef = useRef<T>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Store previously focused element when trap activates
  useEffect(() => {
    if (enabled) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement;

      // Focus initial element
      const container = containerRef.current;
      if (container) {
        const focusTarget = initialFocusSelector
          ? container.querySelector<HTMLElement>(initialFocusSelector)
          : container.querySelectorAll<HTMLElement>(FOCUSABLE_ELEMENTS_SELECTOR)[0];

        if (focusTarget) {
          // Delay focus to ensure element is visible
          requestAnimationFrame(() => {
            focusTarget.focus();
          });
        }
      }
    }

    // Return focus when trap is deactivated
    return () => {
      if (returnFocusOnDeactivate && previouslyFocusedRef.current) {
        previouslyFocusedRef.current.focus();
      }
    };
  }, [enabled, returnFocusOnDeactivate, initialFocusSelector]);

  // Handle Tab key to trap focus
  useEffect(() => {
    if (!enabled) return;

    const container = containerRef.current;
    if (!container) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab') return;

      const focusableElements = container?.querySelectorAll<HTMLElement>(
        FOCUSABLE_ELEMENTS_SELECTOR,
      );

      if (!focusableElements || focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      // Shift + Tab from first element -> go to last
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement?.focus();
        onEscapeAttempt?.();
      }
      // Tab from last element -> go to first
      else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement?.focus();
        onEscapeAttempt?.();
      }
    }

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onEscapeAttempt]);

  return containerRef;
}

// ---------------------------------------------------------------------------
// ARIA Live Region Hook
// ---------------------------------------------------------------------------

/**
 * Live region politeness level.
 */
export type LiveRegionPoliteness = 'polite' | 'assertive' | 'off';

/**
 * Options for useAriaLive hook.
 */
export interface UseAriaLiveOptions {
  /** Politeness level for announcements */
  politeness?: LiveRegionPoliteness;
  /** Delay before announcement (ms) */
  delay?: number;
  /** Clear announcement after this duration (ms). 0 = don't clear */
  clearAfter?: number;
}

/**
 * useAriaLive - Announces dynamic content changes to screen readers.
 *
 * Returns a function to announce messages via an ARIA live region.
 *
 * @see Requirements 23.10 (ARIA live regions for dynamic content)
 *
 * @example
 * ```tsx
 * function ToastContainer() {
 *   const announce = useAriaLive({ politeness: 'polite' });
 *
 *   const showToast = (message: string) => {
 *     announce(message);
 *     // ... show visual toast
 *   };
 *
 *   return null;
 * }
 * ```
 */
export function useAriaLive(options: UseAriaLiveOptions = {}): (message: string) => void {
  const { politeness = 'polite', delay = 100, clearAfter = 3000 } = options;
  const [message, setMessage] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const announce = useCallback(
    (newMessage: string) => {
      // Clear any pending operations
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Delay announcement slightly to ensure screen readers pick it up
      timeoutRef.current = setTimeout(() => {
        setMessage(newMessage);

        // Optionally clear the message after some time
        if (clearAfter > 0) {
          timeoutRef.current = setTimeout(() => {
            setMessage('');
          }, clearAfter);
        }
      }, delay);
    },
    [delay, clearAfter],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Render the live region (invisible but announced)
  useEffect(() => {
    // Ensure live region element exists
    let liveRegion = document.getElementById('aria-live-region');
    if (!liveRegion) {
      liveRegion = document.createElement('div');
      liveRegion.id = 'aria-live-region';
      liveRegion.setAttribute('aria-live', politeness);
      liveRegion.setAttribute('aria-atomic', 'true');
      liveRegion.className = 'sr-only';
      liveRegion.style.cssText = `
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      `;
      document.body.appendChild(liveRegion);
    }

    liveRegion.textContent = message;
    liveRegion.setAttribute('aria-live', politeness);

    return () => {
      // Don't remove the element on unmount - it might be used by other hooks
    };
  }, [message, politeness]);

  return announce;
}

// ---------------------------------------------------------------------------
// Focus Management Utilities
// ---------------------------------------------------------------------------

/**
 * Returns to a stored element after an operation.
 *
 * @example
 * ```tsx
 * function Dropdown() {
 *   const { returnFocus, storeFocus } = useFocusReturn();
 *
 *   const openDropdown = () => {
 *     storeFocus();
 *     // ... open dropdown
 *   };
 *
 *   const closeDropdown = () => {
 *     returnFocus();
 *     // ... close dropdown
 *   };
 * }
 * ```
 */
export function useFocusReturn() {
  const previousElementRef = useRef<HTMLElement | null>(null);

  const storeFocus = useCallback(() => {
    previousElementRef.current = document.activeElement as HTMLElement;
  }, []);

  const returnFocus = useCallback(() => {
    if (previousElementRef.current && document.body.contains(previousElementRef.current)) {
      previousElementRef.current.focus();
    }
    previousElementRef.current = null;
  }, []);

  return { storeFocus, returnFocus };
}

/**
 * Manages a roving tabindex for a group of elements.
 *
 * @see Requirements 23.8 (Keyboard navigation)
 *
 * @example
 * ```tsx
 * function Toolbar() {
 *   const { handleKeyDown, getTabIndex, setFocused, focusedIndex } =
 *     useRovingTabIndex(5);
 *
 *   return (
 *     <div role="toolbar" onKeyDown={handleKeyDown}>
 *       {buttons.map((btn, i) => (
 *         <button
 *           key={i}
 *           tabIndex={getTabIndex(i)}
 *           onFocus={() => setFocused(i)}
 *         >
 *           {btn.label}
 *         </button>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useRovingTabIndex(
  itemCount: number,
  options: {
    initialIndex?: number;
    orientation?: 'horizontal' | 'vertical' | 'both';
    loop?: boolean;
  } = {},
) {
  const { initialIndex = 0, orientation = 'horizontal', loop = true } = options;
  const [focusedIndex, setFocusedIndex] = useState(initialIndex);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  const setRef = useCallback((index: number, element: HTMLElement | null) => {
    itemRefs.current[index] = element;
  }, []);

  const getTabIndex = useCallback(
    (index: number) => (index === focusedIndex ? 0 : -1),
    [focusedIndex],
  );

  const focusItem = useCallback((index: number) => {
    const element = itemRefs.current[index];
    if (element) {
      element.focus();
    }
    setFocusedIndex(index);
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      let newIndex = focusedIndex;
      const prevKeys =
        orientation === 'horizontal' ? ['ArrowLeft'] : ['ArrowUp'];
      const nextKeys =
        orientation === 'horizontal' ? ['ArrowRight'] : ['ArrowDown'];

      if (orientation === 'both') {
        prevKeys.push('ArrowUp', 'ArrowLeft');
        nextKeys.push('ArrowDown', 'ArrowRight');
      }

      if (prevKeys.includes(event.key)) {
        event.preventDefault();
        newIndex = focusedIndex - 1;
        if (newIndex < 0) {
          newIndex = loop ? itemCount - 1 : 0;
        }
      } else if (nextKeys.includes(event.key)) {
        event.preventDefault();
        newIndex = focusedIndex + 1;
        if (newIndex >= itemCount) {
          newIndex = loop ? 0 : itemCount - 1;
        }
      } else if (event.key === 'Home') {
        event.preventDefault();
        newIndex = 0;
      } else if (event.key === 'End') {
        event.preventDefault();
        newIndex = itemCount - 1;
      }

      if (newIndex !== focusedIndex) {
        focusItem(newIndex);
      }
    },
    [focusedIndex, itemCount, orientation, loop, focusItem],
  );

  return {
    focusedIndex,
    setFocused: setFocusedIndex,
    getTabIndex,
    handleKeyDown,
    setRef,
    focusItem,
  };
}

// ---------------------------------------------------------------------------
// Skip Link Hook
// ---------------------------------------------------------------------------

/**
 * Creates a skip link for keyboard users to bypass navigation.
 *
 * @example
 * ```tsx
 * function Layout() {
 *   const skipLink = useSkipLink('main-content');
 *
 *   return (
 *     <>
 *       {skipLink}
 *       <nav>...</nav>
 *       <main id="main-content">...</main>
 *     </>
 *   );
 * }
 * ```
 */
export function useSkipLink(targetId: string, label = 'Skip to main content') {
  const handleClick = useCallback(
    (event: React.MouseEvent | React.KeyboardEvent) => {
      event.preventDefault();
      const target = document.getElementById(targetId);
      if (target) {
        target.tabIndex = -1;
        target.focus();
        target.removeAttribute('tabindex');
      }
    },
    [targetId],
  );

  return {
    href: `#${targetId}`,
    onClick: handleClick,
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        handleClick(event);
      }
    },
    label,
  };
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Generates unique IDs for accessibility attributes.
 */
let idCounter = 0;
export function generateA11yId(prefix = 'a11y'): string {
  return `${prefix}-${++idCounter}`;
}

/**
 * Gets the accessible name for an element.
 */
export function getAccessibleName(element: HTMLElement): string | null {
  // Check aria-labelledby
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labels = labelledBy
      .split(' ')
      .map(id => document.getElementById(id)?.textContent)
      .filter(Boolean);
    if (labels.length > 0) {
      return labels.join(' ');
    }
  }

  // Check aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    return ariaLabel;
  }

  // Check label element (for form controls)
  if (element.id) {
    const label = document.querySelector<HTMLLabelElement>(
      `label[for="${element.id}"]`,
    );
    if (label) {
      return label.textContent;
    }
  }

  // Check inner text for buttons
  if (
    element.tagName === 'BUTTON' ||
    element.getAttribute('role') === 'button'
  ) {
    return element.textContent;
  }

  return null;
}

/**
 * Checks if an element has sufficient color contrast.
 * Note: This is a simplified check. For full WCAG compliance,
 * use a dedicated accessibility testing tool.
 */
export function hasMinimumContrast(
  foreground: string,
  background: string,
  minRatio = 4.5,
): boolean {
  // Parse hex colors to RGB
  const parseHex = (hex: string): [number, number, number] | null => {
    const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!match) return null;
    return [
      parseInt(match[1]!, 16),
      parseInt(match[2]!, 16),
      parseInt(match[3]!, 16),
    ];
  };

  // Calculate relative luminance
  const getLuminance = ([r, g, b]: [number, number, number]): number => {
    const [rs, gs, bs] = [r, g, b].map(c => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs! + 0.7152 * gs! + 0.0722 * bs!;
  };

  const fg = parseHex(foreground);
  const bg = parseHex(background);

  if (!fg || !bg) return true; // Can't verify, assume OK

  const l1 = getLuminance(fg);
  const l2 = getLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  const ratio = (lighter + 0.05) / (darker + 0.05);

  return ratio >= minRatio;
}
