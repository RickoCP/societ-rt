/**
 * Use Cases Container — Registers use case implementations.
 *
 * All use cases are registered as singletons (stateless factory functions).
 */

import { asFunction, type AwilixContainer } from 'awilix';
import {
  LoginUseCaseImpl,
  RegisterUseCaseImpl,
  LogoutUseCaseImpl,
  CreateInvitationUseCaseImpl,
} from '@core/domains/auth/usecases';
import {
  AssignRoleUseCaseImpl,
  CheckPermissionUseCaseImpl,
} from '@core/domains/rbac/usecases';
import {
  RegisterTenantUseCaseImpl,
  UpdateTenantBrandingUseCaseImpl,
  UpdateTenantSirenDeviceUseCaseImpl,
  ExportTenantSirenCsvUseCaseImpl,
  ImportTenantSirenCsvUseCaseImpl,
  SuspendTenantUseCaseImpl,
  ReactivateTenantUseCaseImpl,
} from '@core/domains/tenant/usecases';
import {
  CreateHouseholdUseCaseImpl,
  AddResidentUseCaseImpl,
  UpdateResidentStatusUseCaseImpl,
  ExportResidentCsvUseCaseImpl,
  ImportResidentCsvUseCaseImpl,
} from '@core/domains/resident/usecases';
import {
  RecordTransactionUseCaseImpl,
  GetBalanceUseCaseImpl,
  RecordIuranPaymentUseCaseImpl,
  GetFinancialReportUseCaseImpl,
  ExportFinancialReportUseCaseImpl,
} from '@core/domains/finance/usecases';
import {
  CreateVoteUseCaseImpl,
  CastVoteUseCaseImpl,
  GetVoteTallyUseCaseImpl,
} from '@core/domains/voting/usecases';
import {
  CreateAnnouncementUseCaseImpl,
} from '@core/domains/announcement/usecases';
import {
  TriggerEmergencyAlertUseCaseImpl,
  UpdateEmergencyStatusUseCaseImpl,
} from '@core/domains/emergency/usecases';
import {
  GetMapMarkersUseCaseImpl,
  UpdateHouseholdCoordinatesUseCaseImpl,
  GetSecurityMapDataUseCaseImpl,
  GetIncidentHeatmapUseCaseImpl,
  GetGeofenceVisualizationUseCaseImpl,
} from '@core/domains/map/usecases';
import {
  CreatePatrolScheduleUseCaseImpl,
  RecordPatrolAttendanceUseCaseImpl,
  CreateIncidentReportUseCaseImpl,
} from '@core/domains/security/usecases';
import {
  SubmitLetterRequestUseCaseImpl,
  ApproveLetterRequestUseCaseImpl,
  RejectLetterRequestUseCaseImpl,
} from '@core/domains/administration/usecases';
import {
  CreateEventUseCaseImpl,
  SubmitRsvpUseCaseImpl,
} from '@core/domains/event/usecases';
import {
  LogVisitorUseCaseImpl,
  LogPackageUseCaseImpl,
  RecordVisitorExitUseCaseImpl,
} from '@core/domains/visitor/usecases';
import {
  GenerateInvoiceUseCaseImpl,
  ProcessPaymentUseCaseImpl,
  HandlePaymentWebhookUseCaseImpl,
  RetryFailedPaymentUseCaseImpl,
  DowngradeTenantUseCaseImpl,
  EnforceUserLimitUseCaseImpl,
} from '@core/domains/billing/usecases';
import {
  CheckFeatureFlagUseCaseImpl,
  OverrideFeatureFlagUseCaseImpl,
} from '@core/domains/featureFlag/usecases';
import {
  DispatchNotificationUseCaseImpl,
  DispatchMultiChannelNotificationUseCaseImpl,
  ProcessNotificationEscalationUseCaseImpl,
  AcknowledgeNotificationUseCaseImpl,
} from '@core/domains/notification/usecases';
import {
  GetKetuaDashboardUseCaseImpl,
  GetPlatformDashboardUseCaseImpl,
} from '@core/domains/dashboard/usecases';
import {
  UploadFileUseCaseImpl,
} from '@core/domains/fileStorage/usecases';
import {
  MaskSensitiveDataUseCaseImpl,
  ExportPersonalDataUseCaseImpl,
  RequestDataDeletionUseCaseImpl,
} from '@core/domains/privacy/usecases';
import {
  ImpersonateUseCaseImpl,
  EndImpersonationUseCaseImpl,
  GetTenantHealthUseCaseImpl,
} from '@core/domains/operational/usecases';
import {
  PairDeviceUseCaseImpl,
  SendDeviceCommandUseCaseImpl,
  ProcessWebhookEventUseCaseImpl,
  SyncDeviceStatusUseCaseImpl,
  UnpairDeviceUseCaseImpl,
  MonitorDeviceHealthUseCaseImpl,
  EmitBatteryLowEventUseCaseImpl,
  GetDeviceHealthDashboardUseCaseImpl,
  CheckIoTHealthUseCaseImpl,
} from '@core/domains/iot/usecases';
import {
  CreateIncidentUseCaseImpl,
  UpdateIncidentStatusUseCaseImpl,
  EscalateIncidentUseCaseImpl,
  AttachEvidenceUseCaseImpl,
} from '@core/domains/incident/usecases';
import {
  RegisterGateUseCaseImpl,
  ProcessGateEventUseCaseImpl,
  CheckGateOpenDurationUseCaseImpl,
  GetGateAnalyticsUseCaseImpl,
} from '@core/domains/gate/usecases';
import {
  RegisterCameraUseCaseImpl,
  CaptureSnapshotUseCaseImpl,
  HandleMotionDetectionUseCaseImpl,
  GetCctvStorageUsageUseCaseImpl,
} from '@core/domains/cctv/usecases';
import {
  CreatePatrolRouteUseCaseImpl,
  StartPatrolUseCaseImpl,
  RecordCheckpointVisitUseCaseImpl,
  CompletePatrolUseCaseImpl,
  DetectPatrolDeviationUseCaseImpl,
  GetPatrolAnalyticsUseCaseImpl,
} from '@core/domains/patrol/usecases';
import {
  RegisterAlarmDeviceUseCaseImpl,
  ActivateSirenUseCaseImpl,
  ActivateZoneSirenUseCaseImpl,
  DeactivateSirenUseCaseImpl,
  ProcessAlarmScheduleUseCaseImpl,
} from '@core/domains/alarm/usecases';
import {
  CreateAutomationRuleUseCaseImpl,
  EvaluateRuleUseCaseImpl,
  ExecuteAutomationActionsUseCaseImpl,
  HandleRuleChainingUseCaseImpl,
  EnableDisableRuleUseCaseImpl,
} from '@core/domains/automation/usecases';
import {
  GetDeviceDashboardUseCaseImpl,
  ConfigureDeviceAlertsUseCaseImpl,
  TransferDeviceOwnershipUseCaseImpl,
} from '@core/domains/societHome/usecases';
import {
  GetSecurityDashboardUseCaseImpl,
  GetIncidentTimelineUseCaseImpl,
  BroadcastNeighborhoodAlertUseCaseImpl,
  GetSecurityAnalyticsUseCaseImpl,
} from '@core/domains/securityCenter/usecases';
import {
  ProcessDoorEventUseCaseImpl,
  RegisterDoorSensorUseCaseImpl,
  SetMonitoringWindowUseCaseImpl,
  RequestDoorSensorInstallationUseCaseImpl,
  ResolveDoorInstallationRequestUseCaseImpl,
  GetDoorStateDashboardUseCaseImpl,
} from '@core/domains/doorMonitoring/usecases';
import {
  ListEmergencyContactsUseCaseImpl,
  CreateEmergencyContactUseCaseImpl,
  UpdateEmergencyContactUseCaseImpl,
  DeleteEmergencyContactUseCaseImpl,
} from '@core/domains/emergencyContact/usecases';
import {
  createSubscriptionPlanService,
  createSubscriptionStatusService,
  createEntitlementService,
} from '@core/domains/subscription/services';
import { createBillingService } from '@core/domains/billing/services';
import {
  MembershipLifecycleServiceImpl,
  DelegationMatrixServiceImpl,
  MembershipInvitationServiceImpl,
  AdminMembershipServiceImpl,
} from '@core/domains/membership/services';
import {
  TenantTransferServiceImpl,
} from '@core/domains/transfer/services';
import {
  HouseholdIsolationServiceImpl,
} from '@core/domains/household/services';
import {
  TenantOnboardingServiceImpl,
} from '@core/domains/tenant/services';
import {
  OrgUnitManagementServiceImpl,
  OrgUnitHierarchyReaderImpl,
  OrgUnitCrudServiceImpl,
  MultiClusterServiceImpl,
} from '@core/domains/orgunit/services';
import {
  OrgUnitScopeAuthorizerImpl,
} from '@core/domains/authorization/services';
import {
  AuthorizationConcurrencyServiceImpl,
} from '@core/domains/authorization/services';
import {
  CacheInvalidationServiceImpl,
} from '@core/domains/authorization/services';
import {
  BatchOperationsServiceImpl,
} from '@core/domains/authorization/services';
import {
  PermissionSyncServiceImpl,
} from '@core/domains/authorization/services';
import {
  AuthorizationErrorHandlerServiceImpl,
} from '@core/domains/authorization/services';
import {
  CrossTenantPreventionServiceImpl,
} from '@core/domains/authorization/services';
import {
  LoggingMembershipEventEmitter,
  LoggingDelegationAuditEmitter,
  LoggingTransferAuditEmitter,
  LoggingInvitationEventEmitter,
  LoggingAdminMembershipAuditEmitter,
  LoggingHouseholdIsolationAuditEmitter,
  LoggingOnboardingEventEmitter,
  LoggingOrgUnitEventEmitter,
  LoggingIoTDeviceIsolationAuditEmitter,
} from '@infrastructure/events';
import {
  IoTDeviceIsolationServiceImpl,
} from '@core/domains/iot/services';
import {
  AuditTrailServiceImpl,
  AuditSecurityEventsServiceImpl,
  TenantDataIsolationAuditServiceImpl,
} from '@core/domains/audit/services';
import {
  NotificationSecurityServiceImpl,
} from '@core/domains/notification/services';
import {
  LoggingAuditTrailEmitter,
} from '@infrastructure/events';

export function registerUseCases(container: AwilixContainer): void {
  container.register({
    // Auth
    loginUseCase: asFunction(LoginUseCaseImpl).singleton(),
    registerUseCase: asFunction(RegisterUseCaseImpl).singleton(),
    logoutUseCase: asFunction(LogoutUseCaseImpl).singleton(),
    createInvitationUseCase: asFunction(CreateInvitationUseCaseImpl).singleton(),
    // RBAC
    assignRoleUseCase: asFunction(AssignRoleUseCaseImpl).singleton(),
    checkPermissionUseCase: asFunction(CheckPermissionUseCaseImpl).singleton(),
    // Tenant
    registerTenantUseCase: asFunction(RegisterTenantUseCaseImpl).singleton(),
    updateTenantBrandingUseCase: asFunction(UpdateTenantBrandingUseCaseImpl).singleton(),
    updateTenantSirenDeviceUseCase: asFunction(UpdateTenantSirenDeviceUseCaseImpl).singleton(),
    exportTenantSirenCsvUseCase: asFunction(ExportTenantSirenCsvUseCaseImpl).singleton(),
    importTenantSirenCsvUseCase: asFunction(ImportTenantSirenCsvUseCaseImpl).singleton(),
    suspendTenantUseCase: asFunction(SuspendTenantUseCaseImpl).singleton(),
    reactivateTenantUseCase: asFunction(ReactivateTenantUseCaseImpl).singleton(),
    // Resident
    createHouseholdUseCase: asFunction(CreateHouseholdUseCaseImpl).singleton(),
    addResidentUseCase: asFunction(AddResidentUseCaseImpl).singleton(),
    updateResidentStatusUseCase: asFunction(UpdateResidentStatusUseCaseImpl).singleton(),
    exportResidentCsvUseCase: asFunction(ExportResidentCsvUseCaseImpl).singleton(),
    importResidentCsvUseCase: asFunction(ImportResidentCsvUseCaseImpl).singleton(),
    // Finance
    recordTransactionUseCase: asFunction(RecordTransactionUseCaseImpl).singleton(),
    getBalanceUseCase: asFunction(GetBalanceUseCaseImpl).singleton(),
    recordIuranPaymentUseCase: asFunction(RecordIuranPaymentUseCaseImpl).singleton(),
    getFinancialReportUseCase: asFunction(GetFinancialReportUseCaseImpl).singleton(),
    exportFinancialReportUseCase: asFunction(ExportFinancialReportUseCaseImpl).singleton(),
    // Voting
    createVoteUseCase: asFunction(CreateVoteUseCaseImpl).singleton(),
    castVoteUseCase: asFunction(CastVoteUseCaseImpl).singleton(),
    getVoteTallyUseCase: asFunction(GetVoteTallyUseCaseImpl).singleton(),
    // Announcement
    createAnnouncementUseCase: asFunction(CreateAnnouncementUseCaseImpl).singleton(),
    // Emergency
    triggerEmergencyAlertUseCase: asFunction(TriggerEmergencyAlertUseCaseImpl).singleton(),
    updateEmergencyStatusUseCase: asFunction(UpdateEmergencyStatusUseCaseImpl).singleton(),
    // Map
    getMapMarkersUseCase: asFunction(GetMapMarkersUseCaseImpl).singleton(),
    updateHouseholdCoordinatesUseCase: asFunction(UpdateHouseholdCoordinatesUseCaseImpl).singleton(),
    getSecurityMapDataUseCase: asFunction(GetSecurityMapDataUseCaseImpl).singleton(),
    getIncidentHeatmapUseCase: asFunction(GetIncidentHeatmapUseCaseImpl).singleton(),
    getGeofenceVisualizationUseCase: asFunction(GetGeofenceVisualizationUseCaseImpl).singleton(),
    // Security
    createPatrolScheduleUseCase: asFunction(CreatePatrolScheduleUseCaseImpl).singleton(),
    recordPatrolAttendanceUseCase: asFunction(RecordPatrolAttendanceUseCaseImpl).singleton(),
    createIncidentReportUseCase: asFunction(CreateIncidentReportUseCaseImpl).singleton(),
    // Administration
    submitLetterRequestUseCase: asFunction(SubmitLetterRequestUseCaseImpl).singleton(),
    approveLetterRequestUseCase: asFunction(ApproveLetterRequestUseCaseImpl).singleton(),
    rejectLetterRequestUseCase: asFunction(RejectLetterRequestUseCaseImpl).singleton(),
    // Event
    createEventUseCase: asFunction(CreateEventUseCaseImpl).singleton(),
    submitRsvpUseCase: asFunction(SubmitRsvpUseCaseImpl).singleton(),
    // Visitor
    logVisitorUseCase: asFunction(LogVisitorUseCaseImpl).singleton(),
    logPackageUseCase: asFunction(LogPackageUseCaseImpl).singleton(),
    recordVisitorExitUseCase: asFunction(RecordVisitorExitUseCaseImpl).singleton(),
    // Billing
    generateInvoiceUseCase: asFunction(GenerateInvoiceUseCaseImpl).singleton(),
    processPaymentUseCase: asFunction(ProcessPaymentUseCaseImpl).singleton(),
    handlePaymentWebhookUseCase: asFunction(HandlePaymentWebhookUseCaseImpl).singleton(),
    retryFailedPaymentUseCase: asFunction(RetryFailedPaymentUseCaseImpl).singleton(),
    downgradeTenantUseCase: asFunction(DowngradeTenantUseCaseImpl).singleton(),
    enforceUserLimitUseCase: asFunction(EnforceUserLimitUseCaseImpl).singleton(),
    // Feature Flags
    checkFeatureFlagUseCase: asFunction(CheckFeatureFlagUseCaseImpl).singleton(),
    overrideFeatureFlagUseCase: asFunction(OverrideFeatureFlagUseCaseImpl).singleton(),
    // Notification
    dispatchNotificationUseCase: asFunction(DispatchNotificationUseCaseImpl).singleton(),
    dispatchMultiChannelNotificationUseCase: asFunction(DispatchMultiChannelNotificationUseCaseImpl).singleton(),
    processNotificationEscalationUseCase: asFunction(ProcessNotificationEscalationUseCaseImpl).singleton(),
    acknowledgeNotificationUseCase: asFunction(AcknowledgeNotificationUseCaseImpl).singleton(),
    // Dashboard
    getKetuaDashboardUseCase: asFunction(GetKetuaDashboardUseCaseImpl).singleton(),
    getPlatformDashboardUseCase: asFunction(GetPlatformDashboardUseCaseImpl).singleton(),
    // File Storage
    uploadFileUseCase: asFunction(UploadFileUseCaseImpl).singleton(),
    // Privacy
    maskSensitiveDataUseCase: asFunction(MaskSensitiveDataUseCaseImpl).singleton(),
    exportPersonalDataUseCase: asFunction(ExportPersonalDataUseCaseImpl).singleton(),
    requestDataDeletionUseCase: asFunction(RequestDataDeletionUseCaseImpl).singleton(),
    // Operational
    impersonateUseCase: asFunction(ImpersonateUseCaseImpl).singleton(),
    endImpersonationUseCase: asFunction(EndImpersonationUseCaseImpl).singleton(),
    getTenantHealthUseCase: asFunction(GetTenantHealthUseCaseImpl).singleton(),
    // IoT
    pairDeviceUseCase: asFunction(PairDeviceUseCaseImpl).singleton(),
    sendDeviceCommandUseCase: asFunction(SendDeviceCommandUseCaseImpl).singleton(),
    processWebhookEventUseCase: asFunction(ProcessWebhookEventUseCaseImpl).singleton(),
    syncDeviceStatusUseCase: asFunction(SyncDeviceStatusUseCaseImpl).singleton(),
    unpairDeviceUseCase: asFunction(UnpairDeviceUseCaseImpl).singleton(),
    monitorDeviceHealthUseCase: asFunction(MonitorDeviceHealthUseCaseImpl).singleton(),
    emitBatteryLowEventUseCase: asFunction(EmitBatteryLowEventUseCaseImpl).singleton(),
    getDeviceHealthDashboardUseCase: asFunction(GetDeviceHealthDashboardUseCaseImpl).singleton(),
    checkIoTHealthUseCase: asFunction(CheckIoTHealthUseCaseImpl).singleton(),
    // Incident
    createIncidentUseCase: asFunction(CreateIncidentUseCaseImpl).singleton(),
    updateIncidentStatusUseCase: asFunction(UpdateIncidentStatusUseCaseImpl).singleton(),
    escalateIncidentUseCase: asFunction(EscalateIncidentUseCaseImpl).singleton(),
    attachEvidenceUseCase: asFunction(AttachEvidenceUseCaseImpl).singleton(),
    // Gate
    registerGateUseCase: asFunction(RegisterGateUseCaseImpl).singleton(),
    processGateEventUseCase: asFunction(ProcessGateEventUseCaseImpl).singleton(),
    checkGateOpenDurationUseCase: asFunction(CheckGateOpenDurationUseCaseImpl).singleton(),
    getGateAnalyticsUseCase: asFunction(GetGateAnalyticsUseCaseImpl).singleton(),
    // CCTV
    registerCameraUseCase: asFunction(RegisterCameraUseCaseImpl).singleton(),
    captureSnapshotUseCase: asFunction(CaptureSnapshotUseCaseImpl).singleton(),
    handleMotionDetectionUseCase: asFunction(HandleMotionDetectionUseCaseImpl).singleton(),
    getCctvStorageUsageUseCase: asFunction(GetCctvStorageUsageUseCaseImpl).singleton(),
    // Patrol (Enhanced)
    createPatrolRouteUseCase: asFunction(CreatePatrolRouteUseCaseImpl).singleton(),
    startPatrolUseCase: asFunction(StartPatrolUseCaseImpl).singleton(),
    recordCheckpointVisitUseCase: asFunction(RecordCheckpointVisitUseCaseImpl).singleton(),
    completePatrolUseCase: asFunction(CompletePatrolUseCaseImpl).singleton(),
    detectPatrolDeviationUseCase: asFunction(DetectPatrolDeviationUseCaseImpl).singleton(),
    getPatrolAnalyticsUseCase: asFunction(GetPatrolAnalyticsUseCaseImpl).singleton(),
    // Alarm
    registerAlarmDeviceUseCase: asFunction(RegisterAlarmDeviceUseCaseImpl).singleton(),
    activateSirenUseCase: asFunction(ActivateSirenUseCaseImpl).singleton(),
    activateZoneSirenUseCase: asFunction(ActivateZoneSirenUseCaseImpl).singleton(),
    deactivateSirenUseCase: asFunction(DeactivateSirenUseCaseImpl).singleton(),
    processAlarmScheduleUseCase: asFunction(ProcessAlarmScheduleUseCaseImpl).singleton(),
    // Automation
    createAutomationRuleUseCase: asFunction(CreateAutomationRuleUseCaseImpl).singleton(),
    evaluateRuleUseCase: asFunction(EvaluateRuleUseCaseImpl).singleton(),
    executeAutomationActionsUseCase: asFunction(ExecuteAutomationActionsUseCaseImpl).singleton(),
    handleRuleChainingUseCase: asFunction(HandleRuleChainingUseCaseImpl).singleton(),
    enableDisableRuleUseCase: asFunction(EnableDisableRuleUseCaseImpl).singleton(),
    // SocieT-Home
    getDeviceDashboardUseCase: asFunction(GetDeviceDashboardUseCaseImpl).singleton(),
    configureDeviceAlertsUseCase: asFunction(ConfigureDeviceAlertsUseCaseImpl).singleton(),
    transferDeviceOwnershipUseCase: asFunction(TransferDeviceOwnershipUseCaseImpl).singleton(),
    // Security Center
    getSecurityDashboardUseCase: asFunction(GetSecurityDashboardUseCaseImpl).singleton(),
    getIncidentTimelineUseCase: asFunction(GetIncidentTimelineUseCaseImpl).singleton(),
    broadcastNeighborhoodAlertUseCase: asFunction(BroadcastNeighborhoodAlertUseCaseImpl).singleton(),
    getSecurityAnalyticsUseCase: asFunction(GetSecurityAnalyticsUseCaseImpl).singleton(),
    // Door Monitoring
    processDoorEventUseCase: asFunction(ProcessDoorEventUseCaseImpl).singleton(),
    registerDoorSensorUseCase: asFunction(RegisterDoorSensorUseCaseImpl).singleton(),
    setMonitoringWindowUseCase: asFunction(SetMonitoringWindowUseCaseImpl).singleton(),
    requestDoorSensorInstallationUseCase: asFunction(RequestDoorSensorInstallationUseCaseImpl).singleton(),
    resolveDoorInstallationRequestUseCase: asFunction(ResolveDoorInstallationRequestUseCaseImpl).singleton(),
    getDoorStateDashboardUseCase: asFunction(GetDoorStateDashboardUseCaseImpl).singleton(),
    // Emergency Contacts
    listEmergencyContactsUseCase: asFunction(ListEmergencyContactsUseCaseImpl).singleton(),
    createEmergencyContactUseCase: asFunction(CreateEmergencyContactUseCaseImpl).singleton(),
    updateEmergencyContactUseCase: asFunction(UpdateEmergencyContactUseCaseImpl).singleton(),
    deleteEmergencyContactUseCase: asFunction(DeleteEmergencyContactUseCaseImpl).singleton(),
    // FASE 1.17 — Subscription Management (Task 44)
    subscriptionPlanService: asFunction(createSubscriptionPlanService).singleton(),
    subscriptionStatusService: asFunction(createSubscriptionStatusService).singleton(),
    // FASE 1.17 — Entitlement Enforcement (Task 45)
    entitlementService: asFunction(createEntitlementService).singleton(),
    // FASE 1.17 — Billing and Payment Integration (Task 47)
    billingService: asFunction(createBillingService).singleton(),
    // FASE 1.18 — Membership Lifecycle Management (Task 50)
    membershipEventEmitter: asFunction(LoggingMembershipEventEmitter).singleton(),
    membershipLifecycleService: asFunction(MembershipLifecycleServiceImpl).singleton(),
    // FASE 1.18 — Delegation Matrix (Task 51)
    // NOTE: key must be `auditEmitter` to match the destructured parameter in
    // DelegationMatrixServiceImpl under Awilix PROXY injection mode.
    auditEmitter: asFunction(LoggingDelegationAuditEmitter).singleton(),
    delegationMatrixService: asFunction(DelegationMatrixServiceImpl).singleton(),
    // FASE 1.18 — Tenant Ownership Transfer (Task 52)
    // NOTE: transferAuditEmitter key used for TenantTransferService dependency
    transferAuditEmitter: asFunction(LoggingTransferAuditEmitter).singleton(),
    tenantTransferService: asFunction(TenantTransferServiceImpl).singleton(),
    // FASE 1.18 — Membership Invitation Flow (Task 53)
    invitationEventEmitter: asFunction(LoggingInvitationEventEmitter).singleton(),
    membershipInvitationService: asFunction(MembershipInvitationServiceImpl).singleton(),
    // FASE 1.18 — Admin Membership Management (Task 54)
    adminMembershipAuditEmitter: asFunction(LoggingAdminMembershipAuditEmitter).singleton(),
    adminMembershipService: asFunction(AdminMembershipServiceImpl).singleton(),
    // FASE 1.18 — Household Isolation Enforcement (Task 55, INV-HOUSEHOLD-001)
    householdIsolationAuditEmitter: asFunction(LoggingHouseholdIsolationAuditEmitter).singleton(),
    householdIsolationService: asFunction(HouseholdIsolationServiceImpl).singleton(),
    // FASE 1.18 — Tenant Onboarding Flow (Task 49)
    onboardingEventEmitter: asFunction(LoggingOnboardingEventEmitter).singleton(),
    tenantOnboardingService: asFunction(TenantOnboardingServiceImpl).singleton(),
    // FASE 1.19 — OrgUnit Management Service (Task 57)
    orgUnitEventEmitter: asFunction(LoggingOrgUnitEventEmitter).singleton(),
    orgUnitManagementService: asFunction(OrgUnitManagementServiceImpl).singleton(),
    // FASE 1.19 — OrgUnit Hierarchy and CRUD Services (Task 58)
    orgUnitHierarchyReader: asFunction(OrgUnitHierarchyReaderImpl).singleton(),
    orgUnitScopeAuthorizer: asFunction(OrgUnitScopeAuthorizerImpl).singleton(),
    orgUnitCrudService: asFunction(OrgUnitCrudServiceImpl).singleton(),
    // FASE 1.19 — Multi-Cluster Support (Task 59)
    multiClusterService: asFunction(MultiClusterServiceImpl).singleton(),
    // FASE 1.19 — IoT Device Isolation Enforcement (Task 60, INV-IOT-001)
    iotDeviceIsolationAuditEmitter: asFunction(LoggingIoTDeviceIsolationAuditEmitter).singleton(),
    iotDeviceIsolationService: asFunction(IoTDeviceIsolationServiceImpl).singleton(),
    // FASE 1.20 — Audit Trail Implementation (Task 62)
    auditTrailEmitter: asFunction(LoggingAuditTrailEmitter).singleton(),
    auditTrailService: asFunction(AuditTrailServiceImpl).singleton(),
    // FASE 1.20 — Authorization Concurrency Handling (Task 63, Req 28)
    authorizationConcurrencyService: asFunction(AuthorizationConcurrencyServiceImpl).singleton(),
    // FASE 1.20 — Cache Invalidation Strategy (Task 64, Req 29)
    cacheInvalidationService: asFunction(CacheInvalidationServiceImpl).singleton(),
    // FASE 1.20 — Audit Security Events (Task 65, Req 30)
    auditSecurityEventsService: asFunction(AuditSecurityEventsServiceImpl).singleton(),
    // FASE 1.20 — Batch Operations Support (Task 66, Req 33)
    batchOperationsService: asFunction(BatchOperationsServiceImpl).singleton(),
    // FASE 1.20 — Permission Sync Mechanism (Task 67, Req 35)
    permissionSyncService: asFunction(PermissionSyncServiceImpl).singleton(),
    // FASE 1.20 — Tenant Data Isolation Audit (Task 68, Req 38)
    tenantDataIsolationAuditService: asFunction(TenantDataIsolationAuditServiceImpl).singleton(),
    // FASE 1.20 — Authorization Error Handling (Task 69, Req 39)
    authorizationErrorHandler: asFunction(AuthorizationErrorHandlerServiceImpl).singleton(),
    // FASE 1.20 — Notification Security (Task 71, Req 56)
    notificationSecurityService: asFunction(NotificationSecurityServiceImpl).singleton(),
    // FASE 1.20 — Cross-Tenant Prevention (Task 72, Req 59, Tenant Isolation)
    crossTenantPreventionService: asFunction(CrossTenantPreventionServiceImpl).singleton(),
  });
}
