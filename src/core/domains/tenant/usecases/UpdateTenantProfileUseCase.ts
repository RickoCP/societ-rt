/**
 * UpdateTenantProfileUseCase — Updates tenant profile information.
 *
 * This use case orchestrates the update of tenant profile fields such as
 * name, address, contact person, logo, and brand colors. It validates
 * required fields and formats before persisting changes.
 *
 * **ORCHESTRATION FLOW:**
 * 1. Validate actor has tenant:manage permission
 * 2. Validate required fields are provided
 * 3. Validate field formats (RT/RW number, hex colors)
 * 4. Call repository to update profile
 * 5. Enqueue audit log (fire-and-forget)
 * 6. Return updated profile
 *
 * @see Requirements 11.5-11.10 (Tenant Settings Profile)
 * @see Design Components and Interfaces > 8.2 Profile Form
 */

import type { DomainResult } from '@core/utils';
import { ok, fail, validationError } from '@core/utils';
import type { AuditQueueProtocol } from '@core/protocols';
import type { TenantSettingsRepository } from '../repositories/TenantSettingsRepository';
import type {
  TenantProfile,
  UpdateTenantProfileInput,
} from '../entities/TenantProfile';
import {
  isValidRtRwNumber,
  isValidHexColor,
  PROFILE_LIMITS,
} from '../entities/TenantProfile';
import { tenantNotFound, tenantAccessDenied } from '../errors/tenantErrors';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * Input parameters for updating tenant profile.
 */
export interface UpdateTenantProfileUseCaseInput {
  /**
   * Tenant ID to update.
   */
  readonly tenantId: string;

  /**
   * Whether the actor has tenant:manage permission.
   */
  readonly hasManagePermission: boolean;

  /**
   * User ID of the actor (for audit).
   */
  readonly actorUserId: string;

  /**
   * IP address of the request (for audit).
   */
  readonly ipAddress?: string;

  /**
   * Profile fields to update. Only provided fields will be updated.
   */
  readonly profileData: Omit<UpdateTenantProfileInput, 'tenantId' | 'updatedBy'>;
}

/**
 * UpdateTenantProfileUseCase interface — updates tenant profile.
 */
export interface UpdateTenantProfileUseCase {
  /**
   * Execute the update tenant profile operation.
   *
   * @param input - The input parameters
   * @returns DomainResult with updated TenantProfile or error
   */
  execute(
    input: UpdateTenantProfileUseCaseInput,
  ): Promise<DomainResult<TenantProfile>>;
}

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/**
 * Validate profile update input fields.
 */
function validateProfileInput(
  data: Omit<UpdateTenantProfileInput, 'tenantId' | 'updatedBy'>,
): ValidationResult {
  const errors: Record<string, string> = {};

  // Validate name length
  if (data.name !== undefined) {
    if (data.name.trim().length === 0) {
      errors.name = 'Name is required';
    } else if (data.name.length > PROFILE_LIMITS.NAME_MAX_LENGTH) {
      errors.name = `Name must be at most ${PROFILE_LIMITS.NAME_MAX_LENGTH} characters`;
    }
  }

  // Validate RT/RW number format
  if (data.rtRwNumber !== undefined) {
    if (data.rtRwNumber.trim().length === 0) {
      errors.rtRwNumber = 'RT/RW number is required';
    } else if (!isValidRtRwNumber(data.rtRwNumber)) {
      errors.rtRwNumber = 'RT/RW number must be in format RT###/RW###';
    }
  }

  // Validate region
  if (data.region !== undefined && data.region.trim().length === 0) {
    errors.region = 'Region is required';
  }

  // Validate address length
  if (data.address !== undefined) {
    if (data.address.trim().length === 0) {
      errors.address = 'Address is required';
    } else if (data.address.length > PROFILE_LIMITS.ADDRESS_MAX_LENGTH) {
      errors.address = `Address must be at most ${PROFILE_LIMITS.ADDRESS_MAX_LENGTH} characters`;
    }
  }

  // Validate contact person length
  if (data.contactPerson !== undefined) {
    if (data.contactPerson.trim().length === 0) {
      errors.contactPerson = 'Contact person is required';
    } else if (
      data.contactPerson.length > PROFILE_LIMITS.CONTACT_PERSON_MAX_LENGTH
    ) {
      errors.contactPerson = `Contact person must be at most ${PROFILE_LIMITS.CONTACT_PERSON_MAX_LENGTH} characters`;
    }
  }

  // Validate primary color format (if provided and not null)
  if (
    data.primaryColor !== undefined &&
    data.primaryColor !== null &&
    !isValidHexColor(data.primaryColor)
  ) {
    errors.primaryColor = 'Primary color must be a valid hex color (e.g., #FF5733)';
  }

  // Validate secondary color format (if provided and not null)
  if (
    data.secondaryColor !== undefined &&
    data.secondaryColor !== null &&
    !isValidHexColor(data.secondaryColor)
  ) {
    errors.secondaryColor =
      'Secondary color must be a valid hex color (e.g., #FF5733)';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create an UpdateTenantProfileUseCase instance.
 *
 * @param dependencies - The use case dependencies
 * @returns An implementation of UpdateTenantProfileUseCase
 */
export const UpdateTenantProfileUseCaseImpl = ({
  tenantSettingsRepository,
  auditQueueProtocol,
}: {
  tenantSettingsRepository: TenantSettingsRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): UpdateTenantProfileUseCase => ({
  execute: async (
    input: UpdateTenantProfileUseCaseInput,
  ): Promise<DomainResult<TenantProfile>> => {
    const { tenantId, hasManagePermission, actorUserId, ipAddress, profileData } =
      input;

    // Step 1: Validate actor has tenant:manage permission
    if (!hasManagePermission) {
      return fail(tenantAccessDenied());
    }

    // Step 2: Check tenant exists
    const existsResult = await tenantSettingsRepository.exists(tenantId);
    if (!existsResult.success) {
      return fail(existsResult.error);
    }
    if (!existsResult.data) {
      return fail(tenantNotFound());
    }

    // Step 3: Validate profile input
    const validation = validateProfileInput(profileData);
    if (!validation.valid) {
      return fail(
        validationError(
          'TENANT_PROFILE_VALIDATION_FAILED',
          'Profile validation failed',
          { fields: validation.errors },
        ),
      );
    }

    // Step 4: Prepare update input
    const updateInput: UpdateTenantProfileInput = {
      tenantId,
      updatedBy: actorUserId,
      ...profileData,
    };

    // Step 5: Call repository to update profile
    const updateResult = await tenantSettingsRepository.updateProfile(updateInput);
    if (!updateResult.success) {
      return fail(updateResult.error);
    }

    // Step 6: Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId,
        actionType: 'tenant_profile_updated',
        resourceType: 'tenant',
        resourceId: tenantId,
        details: {
          updatedFields: Object.keys(profileData),
        },
        ipAddress,
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // Step 7: Return updated profile
    return ok(updateResult.data);
  },
});

/**
 * Type alias for cleaner DI registration.
 */
export type UpdateTenantProfileUseCaseType = UpdateTenantProfileUseCase;
