/**
 * UpdateTenantConfigUseCase — Updates tenant configuration settings.
 *
 * This use case orchestrates the update of tenant configuration including
 * notification channels, timezone, language, and escalation timeout. It
 * validates all input values against allowed ranges and formats.
 *
 * **ORCHESTRATION FLOW:**
 * 1. Validate actor has tenant:manage permission
 * 2. Validate escalation timeout range (1-10)
 * 3. Validate timezone format (IANA)
 * 4. Validate language code
 * 5. Call repository to update configuration
 * 6. Enqueue audit log (fire-and-forget)
 * 7. Return updated configuration
 *
 * @see Requirements 12.2-12.10 (Tenant Configuration Settings)
 * @see Design Components and Interfaces > 8.3 Configuration Form
 */

import type { DomainResult } from '@core/utils';
import { ok, fail, validationError } from '@core/utils';
import type { AuditQueueProtocol } from '@core/protocols';
import type { TenantSettingsRepository } from '../repositories/TenantSettingsRepository';
import type {
  TenantConfiguration,
  UpdateTenantConfigInput,
} from '../entities/TenantConfiguration';
import {
  isValidEscalationTimeout,
  isValidTimezone,
  isSupportedLanguage,
  ESCALATION_TIMEOUT_BOUNDS,
} from '../entities/TenantConfiguration';
import { tenantNotFound, tenantAccessDenied } from '../errors/tenantErrors';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * Input parameters for updating tenant configuration.
 */
export interface UpdateTenantConfigUseCaseInput {
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
   * Configuration fields to update. Only provided fields will be updated.
   */
  readonly configData: Omit<UpdateTenantConfigInput, 'tenantId' | 'updatedBy'>;
}

/**
 * UpdateTenantConfigUseCase interface — updates tenant configuration.
 */
export interface UpdateTenantConfigUseCase {
  /**
   * Execute the update tenant configuration operation.
   *
   * @param input - The input parameters
   * @returns DomainResult with updated TenantConfiguration or error
   */
  execute(
    input: UpdateTenantConfigUseCaseInput,
  ): Promise<DomainResult<TenantConfiguration>>;
}

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/**
 * Validate configuration update input fields.
 */
function validateConfigInput(
  data: Omit<UpdateTenantConfigInput, 'tenantId' | 'updatedBy'>,
): ValidationResult {
  const errors: Record<string, string> = {};

  // Validate escalation timeout range
  if (data.emergencyEscalationTimeout !== undefined) {
    if (!isValidEscalationTimeout(data.emergencyEscalationTimeout)) {
      errors.emergencyEscalationTimeout = `Escalation timeout must be between ${ESCALATION_TIMEOUT_BOUNDS.MIN} and ${ESCALATION_TIMEOUT_BOUNDS.MAX} minutes`;
    }
  }

  // Validate timezone format (IANA)
  if (data.timezone !== undefined) {
    if (data.timezone.trim().length === 0) {
      errors.timezone = 'Timezone is required';
    } else if (!isValidTimezone(data.timezone)) {
      errors.timezone = 'Invalid timezone format. Must be a valid IANA timezone (e.g., Asia/Jakarta)';
    }
  }

  // Validate language code
  if (data.language !== undefined) {
    if (data.language.trim().length === 0) {
      errors.language = 'Language is required';
    } else if (!isSupportedLanguage(data.language)) {
      errors.language = 'Unsupported language. Supported languages: id, en';
    }
  }

  // Validate notification channels (if provided)
  if (data.notificationChannels !== undefined) {
    const channels = data.notificationChannels;
    if (
      channels.telegram !== undefined &&
      typeof channels.telegram !== 'boolean'
    ) {
      errors['notificationChannels.telegram'] = 'Telegram must be a boolean';
    }
    if (
      channels.whatsapp !== undefined &&
      typeof channels.whatsapp !== 'boolean'
    ) {
      errors['notificationChannels.whatsapp'] = 'WhatsApp must be a boolean';
    }
    if (channels.email !== undefined && typeof channels.email !== 'boolean') {
      errors['notificationChannels.email'] = 'Email must be a boolean';
    }
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
 * Factory function to create an UpdateTenantConfigUseCase instance.
 *
 * @param dependencies - The use case dependencies
 * @returns An implementation of UpdateTenantConfigUseCase
 */
export const UpdateTenantConfigUseCaseImpl = ({
  tenantSettingsRepository,
  auditQueueProtocol,
}: {
  tenantSettingsRepository: TenantSettingsRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): UpdateTenantConfigUseCase => ({
  execute: async (
    input: UpdateTenantConfigUseCaseInput,
  ): Promise<DomainResult<TenantConfiguration>> => {
    const { tenantId, hasManagePermission, actorUserId, ipAddress, configData } =
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

    // Step 3: Validate configuration input
    const validation = validateConfigInput(configData);
    if (!validation.valid) {
      return fail(
        validationError(
          'TENANT_CONFIG_VALIDATION_FAILED',
          'Configuration validation failed',
          { fields: validation.errors },
        ),
      );
    }

    // Step 4: Prepare update input
    const updateInput: UpdateTenantConfigInput = {
      tenantId,
      updatedBy: actorUserId,
      ...configData,
    };

    // Step 5: Call repository to update configuration
    const updateResult =
      await tenantSettingsRepository.updateConfiguration(updateInput);
    if (!updateResult.success) {
      return fail(updateResult.error);
    }

    // Step 6: Enqueue audit log (fire-and-forget)
    const updatedFields = Object.keys(configData).filter(
      key => configData[key as keyof typeof configData] !== undefined,
    );

    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId,
        actionType: 'tenant_config_updated',
        resourceType: 'tenant',
        resourceId: tenantId,
        details: {
          updatedFields,
          // Log specific changes (excluding sensitive data)
          ...(configData.timezone && { newTimezone: configData.timezone }),
          ...(configData.language && { newLanguage: configData.language }),
          ...(configData.emergencyEscalationTimeout && {
            newEscalationTimeout: configData.emergencyEscalationTimeout,
          }),
        },
        ipAddress,
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // Step 7: Return updated configuration
    return ok(updateResult.data);
  },
});

/**
 * Type alias for cleaner DI registration.
 */
export type UpdateTenantConfigUseCaseType = UpdateTenantConfigUseCase;
