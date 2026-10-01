'use client';

/**
 * ContextMenu — A reusable context menu component for right-click menus.
 *
 * Provides an accessible dropdown menu that appears on right-click (or long-press on touch).
 * Supports keyboard navigation and focus management.
 *
 * Features:
 * - Right-click trigger
 * - Keyboard accessible (opens with Shift+F10 or context menu key)
 * - Focus trapping while open
 * - Arrow key navigation
 * - Escape to close
 * - Click outside to close
 * - Disabled items support
 * - Icons for menu items
 *
 * @see Requirements 10.11 (Context menu as alternative to drag-and-drop)
 * @see WCAG 2.1 for accessibility requirements
 */

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Individual menu item configuration.
 */
export interface ContextMenuItem {
  /**
   * Unique identifier for the menu item.
   */
  id: string;

  /**
   * Display label for the menu item.
   */
  label: string;

  /**
   * Optional icon to display before the label.
   */
  icon?: ReactNode;

  /**
   * Whether the item is disabled.
   */
  disabled?: boolean;

  /**
   * Optional tooltip for disabled state.
   */
  disabledTooltip?: string;

  /**
   * Whether this is a destructive action (styled differently).
   */
  destructive?: boolean;

  /**
   * Callback when the item is selected.
   */
  onClick: () => void;
}

/**
 * A separator between menu items.
 */
export interface ContextMenuSeparator {
  type: 'separator';
}

/**
 * Union type for menu content.
 */
export type ContextMenuContent = ContextMenuItem | ContextMenuSeparator;

/**
 * Props for the ContextMenu component.
 */
export interface ContextMenuProps {
  /**
   * Menu items to display.
   */
  items: ContextMenuContent[];

  /**
   * Children to wrap with context menu trigger.
   */
  children: ReactNode;

  /**
   * Whether the context menu is enabled.
   */
  enabled?: boolean;

  /**
   * Additional CSS classes for the trigger wrapper.
   */
  className?: string;

  /**
   * Aria label for accessibility.
   */
  ariaLabel?: string;

  /**
   * Callback when the menu opens.
   */
  onOpen?: () => void;

  /**
   * Callback when the menu closes.
   */
  onClose?: () => void;
}

/**
 * Context menu position state.
 */
interface MenuPosition {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Type guard to check if content is a separator.
 */
function isSeparator(
  content: ContextMenuContent,
): content is ContextMenuSeparator {
  return 'type' in content && content.type === 'separator';
}

/**
 * Get all non-disabled, non-separator items.
 */
function getSelectableItems(items: ContextMenuContent[]): ContextMenuItem[] {
  return items.filter(
    (item): item is ContextMenuItem => !isSeparator(item) && !item.disabled,
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ContextMenu — A context menu component triggered by right-click.
 *
 * @example
 * ```tsx
 * <ContextMenu
 *   items={[
 *     { id: 'move', label: 'Move to...', icon: <MoveIcon />, onClick: handleMove },
 *     { type: 'separator' },
 *     { id: 'delete', label: 'Delete', destructive: true, onClick: handleDelete },
 *   ]}
 * >
 *   <TreeItem>...</TreeItem>
 * </ContextMenu>
 * ```
 */
export function ContextMenu({
  items,
  children,
  enabled = true,
  className = '',
  ariaLabel = 'Context menu',
  onOpen,
  onClose,
}: ContextMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition>({ x: 0, y: 0 });
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectableItems = getSelectableItems(items);

  // ---------------------------------------------------------------------------
  // Menu Position Calculation
  // ---------------------------------------------------------------------------

  const calculatePosition = useCallback(
    (clientX: number, clientY: number): MenuPosition => {
      // Get viewport dimensions
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Estimated menu dimensions (will be updated after render)
      const menuWidth = 200;
      const menuHeight = items.length * 40;

      // Calculate position, ensuring menu stays within viewport
      let x = clientX;
      let y = clientY;

      // Adjust if menu would overflow right
      if (x + menuWidth > viewportWidth) {
        x = viewportWidth - menuWidth - 8;
      }

      // Adjust if menu would overflow bottom
      if (y + menuHeight > viewportHeight) {
        y = viewportHeight - menuHeight - 8;
      }

      // Ensure not negative
      x = Math.max(8, x);
      y = Math.max(8, y);

      return { x, y };
    },
    [items.length],
  );

  // ---------------------------------------------------------------------------
  // Event Handlers
  // ---------------------------------------------------------------------------

  const openMenu = useCallback(
    (clientX: number, clientY: number) => {
      if (!enabled) return;

      const pos = calculatePosition(clientX, clientY);
      setPosition(pos);
      setIsOpen(true);
      setFocusedIndex(0);
      onOpen?.();
    },
    [enabled, calculatePosition, onOpen],
  );

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setFocusedIndex(-1);
    onClose?.();
  }, [onClose]);

  const handleContextMenu = useCallback(
    (event: MouseEvent) => {
      if (!enabled) return;

      event.preventDefault();
      event.stopPropagation();
      openMenu(event.clientX, event.clientY);
    },
    [enabled, openMenu],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Shift+F10 or context menu key opens the menu
      if (
        event.key === 'ContextMenu' ||
        (event.shiftKey && event.key === 'F10')
      ) {
        event.preventDefault();
        const rect = triggerRef.current?.getBoundingClientRect();
        if (rect) {
          openMenu(rect.left + rect.width / 2, rect.top + rect.height / 2);
        }
      }
    },
    [enabled, openMenu],
  );

  const handleMenuKeyDown = useCallback(
    (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          closeMenu();
          triggerRef.current?.focus();
          break;

        case 'ArrowDown':
          event.preventDefault();
          setFocusedIndex(prev => {
            const next = prev + 1;
            return next >= selectableItems.length ? 0 : next;
          });
          break;

        case 'ArrowUp':
          event.preventDefault();
          setFocusedIndex(prev => {
            const next = prev - 1;
            return next < 0 ? selectableItems.length - 1 : next;
          });
          break;

        case 'Home':
          event.preventDefault();
          setFocusedIndex(0);
          break;

        case 'End':
          event.preventDefault();
          setFocusedIndex(selectableItems.length - 1);
          break;

        case 'Enter':
        case ' ':
          event.preventDefault();
          if (focusedIndex >= 0 && selectableItems[focusedIndex]) {
            selectableItems[focusedIndex].onClick();
            closeMenu();
          }
          break;

        case 'Tab':
          // Close menu on tab
          closeMenu();
          break;
      }
    },
    [closeMenu, focusedIndex, selectableItems],
  );

  const handleItemClick = useCallback(
    (item: ContextMenuItem) => {
      if (item.disabled) return;
      item.onClick();
      closeMenu();
    },
    [closeMenu],
  );

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  // Focus management
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && itemRefs.current[focusedIndex]) {
      itemRefs.current[focusedIndex]?.focus();
    }
  }, [isOpen, focusedIndex]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: Event) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        closeMenu();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen, closeMenu]);

  // Close on scroll
  useEffect(() => {
    if (!isOpen) return;

    const handleScroll = () => {
      closeMenu();
    };

    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen, closeMenu]);

  // Close on resize
  useEffect(() => {
    if (!isOpen) return;

    const handleResize = () => {
      closeMenu();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, closeMenu]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Reset item refs array
  itemRefs.current = [];

  // Calculate selectable item index for focus management
  let selectableIndex = -1;

  return (
    <>
      {/* Trigger wrapper */}
      <div
        ref={triggerRef}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
        className={className}
        tabIndex={enabled ? 0 : undefined}
        aria-haspopup="menu"
        aria-expanded={isOpen}>
        {children}
      </div>

      {/* Menu portal */}
      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={ariaLabel}
          onKeyDown={handleMenuKeyDown}
          className="fixed z-50 min-w-[180px] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
          }}>
          {items.map((item, index) => {
            if (isSeparator(item)) {
              return (
                <div
                  key={`separator-${index}`}
                  role="separator"
                  className="my-1 border-t border-gray-200 dark:border-gray-700"
                />
              );
            }

            // Track selectable index for focus
            if (!item.disabled) {
              selectableIndex++;
            }
            const currentSelectableIndex = selectableIndex;
            const isFocused =
              !item.disabled && focusedIndex === currentSelectableIndex;

            return (
              <button
                key={item.id}
                ref={el => {
                  if (!item.disabled) {
                    itemRefs.current[currentSelectableIndex] = el;
                  }
                }}
                role="menuitem"
                disabled={item.disabled}
                tabIndex={isFocused ? 0 : -1}
                onClick={() => handleItemClick(item)}
                onMouseEnter={() => {
                  if (!item.disabled) {
                    setFocusedIndex(currentSelectableIndex);
                  }
                }}
                title={item.disabled ? item.disabledTooltip : undefined}
                className={`
                  flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors
                  ${
                    item.disabled
                      ? 'cursor-not-allowed text-gray-400 dark:text-gray-500'
                      : item.destructive
                        ? 'text-red-600 hover:bg-red-50 focus:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 dark:focus:bg-red-900/20'
                        : 'text-gray-700 hover:bg-gray-100 focus:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700 dark:focus:bg-gray-700'
                  }
                  ${isFocused ? 'bg-gray-100 dark:bg-gray-700' : ''}
                  outline-none
                `}>
                {/* Icon */}
                {item.icon && (
                  <span className="flex-shrink-0 text-current opacity-70">
                    {item.icon}
                  </span>
                )}

                {/* Label */}
                <span className="flex-1">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

export default ContextMenu;
