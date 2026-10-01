'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Standard responsive breakpoints following Tailwind CSS defaults.
 * These match the standard viewport widths for common device categories.
 *
 * @see https://tailwindcss.com/docs/responsive-design
 */
export const BREAKPOINTS = {
  /** Extra small devices (portrait phones): < 640px */
  xs: 0,
  /** Small devices (landscape phones, small tablets): >= 640px */
  sm: 640,
  /** Medium devices (tablets): >= 768px */
  md: 768,
  /** Large devices (laptops, desktops): >= 1024px */
  lg: 1024,
  /** Extra large devices (large desktops): >= 1280px */
  xl: 1280,
  /** 2X large devices (wide screens): >= 1536px */
  '2xl': 1536,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

/**
 * Hook that tracks a CSS media query.
 *
 * @param query - CSS media query string (e.g., '(min-width: 768px)')
 * @returns boolean indicating if the query matches
 *
 * @example
 * ```tsx
 * const isMobile = useMediaQuery('(max-width: 639px)');
 * const isDesktop = useMediaQuery('(min-width: 1024px)');
 * ```
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    // SSR safety: default to false on server
    if (typeof window === 'undefined') {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia(query);

    // Set initial value
    setMatches(mediaQuery.matches);

    // Create event listener
    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Modern browsers: addEventListener
    // Legacy browsers: addListener (deprecated but wider support)
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handler);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handler);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handler);
      } else {
        mediaQuery.removeListener(handler);
      }
    };
  }, [query]);

  return matches;
}

/**
 * Result interface for useBreakpoint hook.
 */
export interface BreakpointResult {
  /** Current breakpoint name */
  breakpoint: Breakpoint;
  /** Current viewport width in pixels */
  width: number;
  /** Whether viewport is mobile sized (< md) */
  isMobile: boolean;
  /** Whether viewport is tablet sized (>= md && < lg) */
  isTablet: boolean;
  /** Whether viewport is desktop sized (>= lg) */
  isDesktop: boolean;
  /** Whether viewport is at or above a specific breakpoint */
  isAbove: (bp: Breakpoint) => boolean;
  /** Whether viewport is below a specific breakpoint */
  isBelow: (bp: Breakpoint) => boolean;
  /** Whether viewport is between two breakpoints (inclusive) */
  isBetween: (minBp: Breakpoint, maxBp: Breakpoint) => boolean;
}

/**
 * Hook that provides comprehensive responsive breakpoint information.
 *
 * Uses Tailwind CSS standard breakpoints and provides convenient
 * helpers for conditional rendering and styling.
 *
 * @returns BreakpointResult with breakpoint info and helper functions
 *
 * @example
 * ```tsx
 * const { isMobile, isDesktop, isAbove } = useBreakpoint();
 *
 * // Conditional rendering
 * if (isMobile) {
 *   return <MobileView />;
 * }
 *
 * // Fine-grained control
 * const showSidebar = isAbove('lg');
 * ```
 */
export function useBreakpoint(): BreakpointResult {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === 'undefined') {
      return BREAKPOINTS.lg; // Default to desktop for SSR
    }
    return window.innerWidth;
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      setWidth(window.innerWidth);
    };

    // Debounce resize handler for performance
    let timeoutId: ReturnType<typeof setTimeout>;
    const debouncedResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(handleResize, 100);
    };

    window.addEventListener('resize', debouncedResize);
    handleResize(); // Set initial value

    return () => {
      window.removeEventListener('resize', debouncedResize);
      clearTimeout(timeoutId);
    };
  }, []);

  // Determine current breakpoint
  const breakpoint: Breakpoint = (() => {
    if (width >= BREAKPOINTS['2xl']) return '2xl';
    if (width >= BREAKPOINTS.xl) return 'xl';
    if (width >= BREAKPOINTS.lg) return 'lg';
    if (width >= BREAKPOINTS.md) return 'md';
    if (width >= BREAKPOINTS.sm) return 'sm';
    return 'xs';
  })();

  // Helper functions
  const isAbove = useCallback(
    (bp: Breakpoint): boolean => width >= BREAKPOINTS[bp],
    [width],
  );

  const isBelow = useCallback(
    (bp: Breakpoint): boolean => width < BREAKPOINTS[bp],
    [width],
  );

  const isBetween = useCallback(
    (minBp: Breakpoint, maxBp: Breakpoint): boolean =>
      width >= BREAKPOINTS[minBp] && width < BREAKPOINTS[maxBp],
    [width],
  );

  return {
    breakpoint,
    width,
    isMobile: width < BREAKPOINTS.md, // < 768px
    isTablet: width >= BREAKPOINTS.md && width < BREAKPOINTS.lg, // 768px - 1023px
    isDesktop: width >= BREAKPOINTS.lg, // >= 1024px
    isAbove,
    isBelow,
    isBetween,
  };
}

/**
 * Minimum touch target size in pixels per WCAG 2.1 AA guidelines.
 * Interactive elements should be at least 44x44px for accessibility.
 *
 * @see Requirements 23.6 (44x44px minimum touch targets)
 */
export const MIN_TOUCH_TARGET_SIZE = 44;

/**
 * CSS classes for ensuring minimum touch target sizes.
 * Apply to interactive elements for accessibility compliance.
 */
export const TOUCH_TARGET_CLASSES = {
  /** Minimum 44px square touch target */
  base: 'min-h-[44px] min-w-[44px]',
  /** Circular touch target (e.g., icon buttons) */
  circular: 'min-h-[44px] min-w-[44px] rounded-full',
  /** Full width with minimum height (e.g., list items) */
  fullWidth: 'min-h-[44px] w-full',
  /** Inline element with minimum touch area */
  inline: 'min-h-[44px] px-3 py-2',
} as const;

export default useMediaQuery;
