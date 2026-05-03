/**
 * Password Utilities — Hash and compare passwords using bcrypt.
 *
 * Uses 12 salt rounds for a good balance between security and performance.
 *
 * @see Requirements 3.1
 */

import bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SALT_ROUNDS = 12;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Hashes a plain-text password using bcrypt.
 *
 * @param password - The plain-text password to hash
 * @returns The bcrypt hash string
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compares a plain-text password against a bcrypt hash.
 *
 * @param password - The plain-text password to check
 * @param hash - The bcrypt hash to compare against
 * @returns True if the password matches the hash
 */
export async function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
