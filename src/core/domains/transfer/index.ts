/**
 * Transfer domain barrel export.
 *
 * This domain handles secure tenant ownership transfer, which is the ONLY way
 * to assign TENANT_OWNER role (delegation matrix prohibits it).
 *
 * @see Requirements 54 (Ownership Transfer & Last-Admin Protection)
 * @see Task 52: Tenant Transfer Flow
 */

// Types
export {
  TenantTransferStatus,
  TERMINAL_TRANSFER_STATUSES,
  CANCELLABLE_STATUSES,
  TRANSFER_STATUS_TRANSITIONS,
  isValidTransferStatusTransition,
  isTerminalTransferStatus,
  isCancellableStatus,
  ALL_TRANSFER_STATUSES,
} from './types';

// Entities
export type {
  TenantTransfer,
  InitiateTransferInput,
  AcceptTransferInput,
  CancelTransferInput,
  OwnershipStateSnapshot,
  TransferAuditRecord,
} from './entities';
export { DEFAULT_TRANSFER_EXPIRY_MS } from './entities';

// Repositories
export type {
  ITenantTransferRepository,
  CreateTransferInput,
  UpdateTransferStatusInput,
  TransferQueryOptions,
} from './repositories';

// Services
export {
  TenantTransferServiceImpl,
  TransferAuditEventType,
} from './services';
export type {
  ITenantTransferService,
  TenantTransferService,
  TransferAuditEvent,
  ITransferAuditEmitter,
  IReauthenticationService,
  IMembershipQueryService,
} from './services';

// Errors
export {
  transferNotInitiatedByOwner,
  transferTargetNotFound,
  transferTargetQuarantined,
  transferTargetAlreadyOwner,
  transferTargetNoMembership,
  transferAlreadyPending,
  transferExpired,
  transferAlreadyCompleted,
  transferCancelled,
  reAuthenticationRequired,
  transferNotTargetUser,
  transferNotInitiator,
  transferCannotBeCancelled,
  transferNotFound,
  invalidTransferStatusTransition,
  transferToSelfNotAllowed,
  invalidReauthToken,
} from './errors';
