/**
 * Authorization Infrastructure Barrel Export
 *
 * Provides infrastructure-level authorization adapters for migration support.
 *
 * @see FASE 1.9 — Shadow Authorization Validation
 * @see Requirements 7
 */

// Legacy Authorization Adapter (for shadow validation)
export type {
  LegacyUserData,
  LegacyAuthorizationInput,
  ILegacyUserRepository,
  ILegacyAuthorizationAdapter,
  LegacyAuthorizationAdapter,
} from './LegacyAuthorizationAdapter';

export { LegacyAuthorizationAdapterImpl } from './LegacyAuthorizationAdapter';

