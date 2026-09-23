/**
 * Shared validation + role helpers for emergency-contact mutations.
 * Pure functions — no external dependencies.
 */

import { UserRole } from '@core/protocols';

/** Roles allowed to create/update/delete emergency contacts. */
export const EMERGENCY_CONTACT_ADMIN_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.Ketua_RT,
  UserRole.Pengurus,
  UserRole.Super_Admin,
]);

/** True when the label is a non-empty trimmed string. */
export function isValidLabel(label: string | undefined): boolean {
  return typeof label === 'string' && label.trim().length > 0;
}

/**
 * True when the phone is a plausible dialable value: digits, spaces, dashes,
 * parentheses and an optional leading '+', with at least 3 digits.
 */
export function isValidPhone(phone: string | undefined): boolean {
  if (typeof phone !== 'string') return false;
  const trimmed = phone.trim();
  if (!/^\+?[\d\s()-]+$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 3;
}
