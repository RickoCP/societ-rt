/**
 * TenantProfile — Domain entity representing a tenant's profile information.
 *
 * Contains all editable profile fields for the Tenant Settings Profile tab,
 * including branding customization (logo, colors) and contact information.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 11.5-11.10 (Tenant Settings Profile)
 * @see Design Components and Interfaces > 8. Tenant Settings > 8.2 Profile Form
 */

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/**
 * TenantProfile entity — editable profile information for a tenant.
 *
 * INVARIANTS:
 * - name is required and max 100 characters
 * - rtRwNumber is required and follows validated format (e.g., RT001/RW001)
 * - region is required from dropdown of valid regions
 * - address is required and max 500 characters
 * - contactPerson is required and max 100 characters
 * - logoUrl is optional, max 2MB, jpg/png only
 * - primaryColor and secondaryColor are optional hex color codes
 *
 * SECURITY CONSIDERATIONS:
 * - All text fields should be sanitized on input
 * - File upload restrictions enforced on logo
 * - Profile changes require `tenant:manage` permission
 */
export interface TenantProfile {
  /**
   * Unique identifier for this tenant.
   */
  readonly id: string;

  /**
   * Display name of the tenant/community.
   * Required, max 100 characters.
   */
  readonly name: string;

  /**
   * RT/RW number identifier.
   * Required, validated format (e.g., RT001/RW001).
   */
  readonly rtRwNumber: string;

  /**
   * Geographic region of the tenant.
   * Required, from dropdown of valid regions.
   */
  readonly region: string;

  /**
   * Physical address of the community.
   * Required, max 500 characters.
   */
  readonly address: string;

  /**
   * Name of the primary contact person.
   * Required, max 100 characters.
   */
  readonly contactPerson: string;

  /**
   * URL to the tenant's logo image.
   * Optional, max 2MB, jpg/png only.
   */
  readonly logoUrl: string | null;

  /**
   * Primary brand color in hex format (e.g., #FFFFFF).
   * Optional, used for UI customization.
   */
  readonly primaryColor: string | null;

  /**
   * Secondary brand color in hex format (e.g., #000000).
   * Optional, used for UI customization.
   */
  readonly secondaryColor: string | null;

  /**
   * Contact email for the tenant.
   * Optional.
   */
  readonly contactEmail: string | null;

  /**
   * Contact phone number for the tenant.
   * Optional.
   */
  readonly contactPhone: string | null;

  /**
   * When the profile was last updated.
   */
  readonly updatedAt: Date;

  /**
   * Who last updated the profile.
   */
  readonly updatedBy: string | null;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/**
 * Data required to update a tenant's profile.
 * All fields are optional - only provided fields will be updated.
 *
 * @see Requirements 11.7 (Profile update)
 */
export interface UpdateTenantProfileInput {
  readonly name?: string;
  readonly rtRwNumber?: string;
  readonly region?: string;
  readonly address?: string;
  readonly contactPerson?: string;
  readonly logoUrl?: string | null;
  readonly primaryColor?: string | null;
  readonly secondaryColor?: string | null;
  readonly contactEmail?: string | null;
  readonly contactPhone?: string | null;
}

// ---------------------------------------------------------------------------
// Validation Rules
// ---------------------------------------------------------------------------

/**
 * Profile validation rules for client-side and server-side validation.
 *
 * @see Requirements 11.9 (Profile validation)
 */
export const PROFILE_VALIDATION_RULES = {
  name: {
    required: true,
    maxLength: 100,
  },
  rtRwNumber: {
    required: true,
    // Pattern: RT followed by 3 digits, slash, RW followed by 3 digits
    pattern: /^RT\d{3}\/RW\d{3}$/,
  },
  region: {
    required: true,
  },
  address: {
    required: true,
    maxLength: 500,
  },
  contactPerson: {
    required: true,
    maxLength: 100,
  },
  logo: {
    maxSizeBytes: 2 * 1024 * 1024, // 2MB
    allowedTypes: ['image/jpeg', 'image/png'],
  },
  primaryColor: {
    pattern: /^#[0-9A-Fa-f]{6}$/,
  },
  secondaryColor: {
    pattern: /^#[0-9A-Fa-f]{6}$/,
  },
  contactEmail: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    maxLength: 254,
  },
  contactPhone: {
    maxLength: 20,
  },
} as const;

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

/**
 * Profile limits for validation.
 */
export const PROFILE_LIMITS = {
  NAME_MAX_LENGTH: 100,
  ADDRESS_MAX_LENGTH: 500,
  CONTACT_PERSON_MAX_LENGTH: 100,
  CONTACT_EMAIL_MAX_LENGTH: 254,
  CONTACT_PHONE_MAX_LENGTH: 20,
  LOGO_MAX_SIZE_BYTES: 2 * 1024 * 1024, // 2MB
} as const;

/**
 * Allowed logo MIME types.
 */
export type AllowedLogoType = 'image/jpeg' | 'image/png';

/**
 * Pattern for validating RT/RW number format.
 */
export const RT_RW_NUMBER_PATTERN = /^RT\d{3}\/RW\d{3}$/;

/**
 * Pattern for validating hex color codes.
 */
export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/**
 * Validates RT/RW number format.
 * @param value The RT/RW number to validate
 * @returns true if valid
 */
export function isValidRtRwNumber(value: string): boolean {
  return RT_RW_NUMBER_PATTERN.test(value);
}

/**
 * Validates hex color code format.
 * @param value The hex color to validate (e.g., #FFFFFF)
 * @returns true if valid
 */
export function isValidHexColor(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  return HEX_COLOR_PATTERN.test(value);
}
