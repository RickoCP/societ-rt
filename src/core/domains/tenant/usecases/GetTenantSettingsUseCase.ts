/**
 * GetTenantSettingsUseCase — Retrieves combined tenant settings for Admin UI.
 *
 * This use case orchestrates the retrieval of tenant profile, configuration,
 * and lifecycle status for the Tenant Settings screen. It validates that the
 * actor has the required `tenant:manage` permission.
 *
 * **ORCHESTRATION FLOW:**
 * 1. Validate actor has tenant:manage permission
 * 2. Fetch combined settings from repository
 * 3. Determine available lifecycle actions based on status and actor role
 * 4. Return combined settings
 *
 * @see Requirements 11.1-11.4 (Tenant Settings Screen)
 * @see Design Components and Interfaces > 8. Tenant Settings
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type {
  TenantSettingsRepository,
  TenantSettings,
} from '../repositories/TenantSettingsRepository';
import type { LifecycleActionValue } from '../entities/TenantLifecycleStatus';
import { getAvailableActions } from '../entities/TenantLifecycleStatus';
import { tenantNotFound, tenantAccessDenied } from '../errors/tenantErrors';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * Input parameters for getting tenant settings.
 */
export interface GetTenantSettingsInput {
  /**
   * The tenant ID to get settings for.
   */
  readonly tenantId: string;

  /**
   * Whether the actor has tenant:manage permission.
   * Should be validated from the authorization context before calling.
   */
  readonly hasManagePermission: boolean;

  /**
   * Whether the actor is a PLATFORM_ADMIN.
   * Required to determine if CLOSE action is available in lifecycle.
   */
  readonly isPlatformAdmin: boolean;
}

/**
 * Output with settings and computed available actions.
 */
export interface GetTenantSettingsOutput extends TenantSettings {
  /**
   * Available lifecycle actions based on current status and actor permissions.
   */
  readonly availableLifecycleActions: readonly LifecycleActionValue[];
}

/**
 * GetTenantSettingsUseCase interface — retrieves combined tenant settings.
 */
export interface GetTenantSettingsUseCase {
  /**
   * Execute the get tenant settings operation.
   *
   * @param input - The input parameters
   * @returns DomainResult with tenant settings or error
   */
  execute(input: GetTenantSettingsInput): Promise<DomainResult<GetTenantSettingsOutput>>;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a GetTenantSettingsUseCase instance.
 *
 * @param dependencies - The use case dependencies
 * @returns An implementation of GetTenantSettingsUseCase
 */
export const GetTenantSettingsUseCaseImpl = ({
  tenantSettingsRepository,
}: {
  tenantSettingsRepository: TenantSettingsRepository;
}): GetTenantSettingsUseCase => ({
  execute: async (
    input: GetTenantSettingsInput,
  ): Promise<DomainResult<GetTenantSettingsOutput>> => {
    const { tenantId, hasManagePermission, isPlatformAdmin } = input;

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

    // Step 3: Fetch combined settings from repository
    const settingsResult = await tenantSettingsRepository.getSettings(tenantId);
    if (!settingsResult.success) {
      return fail(settingsResult.error);
    }

    const settings = settingsResult.data;

    // Step 4: Compute available lifecycle actions based on status and actor role
    const availableLifecycleActions = getAvailableActions(
      settings.lifecycle.currentStatus,
      isPlatformAdmin,
    );

    // Step 5: Return combined settings with available actions
    return ok({
      profile: settings.profile,
      configuration: settings.configuration,
      lifecycle: {
        ...settings.lifecycle,
        availableActions: availableLifecycleActions,
      },
      availableLifecycleActions,
    });
  },
});

/**
 * Type alias for cleaner DI registration.
 */
export type GetTenantSettingsUseCaseType = GetTenantSettingsUseCase;
