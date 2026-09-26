/**
 * Events infrastructure barrel export.
 *
 * @see FASE 1.18 — Membership Lifecycle Management
 * @see FASE 1.18 Task 53 — Membership Invitation Flow
 */

export type { MembershipEventHandler } from './MembershipEventEmitter';

export {
  LoggingMembershipEventEmitter,
  CompositeMembershipEventEmitter,
  NoOpMembershipEventEmitter,
  createLoggingHandler,
  createOutboxHandler,
} from './MembershipEventEmitter';

export type { DelegationAuditHandler } from './DelegationAuditEmitter';

export {
  LoggingDelegationAuditEmitter,
  CompositeDelegationAuditEmitter,
  NoOpDelegationAuditEmitter,
} from './DelegationAuditEmitter';

export type { TransferAuditHandler } from './TransferAuditEmitter';

export {
  LoggingTransferAuditEmitter,
  CompositeTransferAuditEmitter,
  NoOpTransferAuditEmitter,
} from './TransferAuditEmitter';

export type { InvitationEventHandler } from './InvitationEventEmitter';

export {
  LoggingInvitationEventEmitter,
  CompositeInvitationEventEmitter,
  NoOpInvitationEventEmitter,
  createInvitationLoggingHandler,
  createInvitationOutboxHandler,
} from './InvitationEventEmitter';

export type { AdminMembershipAuditHandler } from './AdminMembershipAuditEmitter';

export {
  LoggingAdminMembershipAuditEmitter,
  CompositeAdminMembershipAuditEmitter,
  NoOpAdminMembershipAuditEmitter,
  createPersistentAuditHandler,
} from './AdminMembershipAuditEmitter';

export type { HouseholdIsolationAuditHandler } from './HouseholdIsolationAuditEmitter';

export {
  LoggingHouseholdIsolationAuditEmitter,
  CompositeHouseholdIsolationAuditEmitter,
  NoOpHouseholdIsolationAuditEmitter,
  createPersistentHouseholdAuditHandler,
} from './HouseholdIsolationAuditEmitter';

export type { OnboardingEventHandler } from './OnboardingEventEmitter';

export {
  LoggingOnboardingEventEmitter,
  CompositeOnboardingEventEmitter,
  NoOpOnboardingEventEmitter,
  createOnboardingLoggingHandler,
} from './OnboardingEventEmitter';

export type { OrgUnitEventHandler } from './OrgUnitEventEmitter';

export {
  LoggingOrgUnitEventEmitter,
  CompositeOrgUnitEventEmitter,
  NoOpOrgUnitEventEmitter,
  createOrgUnitLoggingHandler,
  createOrgUnitOutboxHandler,
} from './OrgUnitEventEmitter';

export type { IoTDeviceIsolationAuditHandler } from './IoTDeviceIsolationAuditEmitter';

export {
  LoggingIoTDeviceIsolationAuditEmitter,
  CompositeIoTDeviceIsolationAuditEmitter,
  NoOpIoTDeviceIsolationAuditEmitter,
  createPersistentIoTDeviceAuditHandler,
} from './IoTDeviceIsolationAuditEmitter';

export type { AuditTrailHandler } from './AuditTrailEmitter';

export {
  LoggingAuditTrailEmitter,
  CompositeAuditTrailEmitter,
  NoOpAuditTrailEmitter,
  createPersistentAuditTrailHandler,
  createExternalAuditTrailHandler,
  createFilteredAuditTrailHandler,
  isSecurityEvent,
  isFailedEvent,
  isAdminEvent,
} from './AuditTrailEmitter';
