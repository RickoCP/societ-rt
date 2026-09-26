/**
 * Transfer entities barrel export.
 *
 * @see Requirements 54 (Ownership Transfer)
 * @see Task 52: Tenant Transfer Flow
 */

export type {
  TenantTransfer,
  InitiateTransferInput,
  AcceptTransferInput,
  CancelTransferInput,
  OwnershipStateSnapshot,
  TransferAuditRecord,
} from './TenantTransfer';

export { DEFAULT_TRANSFER_EXPIRY_MS } from './TenantTransfer';
