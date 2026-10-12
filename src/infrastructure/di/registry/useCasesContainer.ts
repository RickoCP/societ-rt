/**
 * Use Cases Container â€” Registers use case implementations.
 *
 * All use cases are registered as singletons (stateless factory functions).
 */

import { asFunction, type AwilixContainer } from 'awilix';
import {
  LoginUseCaseImpl,
  RegisterUseCaseImpl,
  LogoutUseCaseImpl,
  CreateInvitationUseCaseImpl,
  SwitchContextUseCaseImpl,
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
  // Multi-Tenant Admin UI â€” Tenant Settings Use Cases (Task 18.2, Requirements 11-13)
  GetTenantSettingsUseCaseImpl,
  UpdateTenantProfileUseCaseImpl,
  UpdateTenantConfigUseCaseImpl,
  ManageTenantLifecycleUseCaseImpl,
} from '@core/domains/tenant/usecases';
import {
  GetSubscriptionUseCaseImpl,
  ChangePlanUseCaseImpl,
  GetBillingHistoryUseCaseImpl,
  GetTenantSubscriptionUseCaseImpl,
} from '@core/domains/subscription/usecases';
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
  DeleteVisitorUseCaseImpl,
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
  GetPlatformMetricsUseCaseImpl,
  GetTenantsOverviewUseCaseImpl,
  GetSecurityEventsUseCaseImpl,
  ImpersonateTenantUseCaseImpl,
  EndTenantImpersonationUseCaseImpl,
} from '@core/domains/platform/usecases';
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
  ListMembersUseCaseImpl,
  ChangeMemberRoleUseCaseImpl,
  InviteMemberUseCaseImpl,
  BulkMemberOperationUseCaseImpl,
} from '@core/domains/membership/usecases';
import {
  GetOrgUnitTreeUseCaseImpl,
  CreateOrgUnitUseCaseImpl,
  UpdateOrgUnitUseCaseImpl,
  DeleteOrgUnitUseCaseImpl,
  MoveOrgUnitUseCaseImpl,
} from '@core/domains/orgunit/usecases';
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
  ContextSwitchServiceImpl,
} from '@core/domains/context';
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
  QueryAuditLogsUseCaseImpl,
  ExportAuditLogsUseCaseImpl,
} from '@core/domains/audit/usecases';
// Duplicate import removed - ImpersonateTenantUseCaseImpl already imported above
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
    // Multi-Tenant Admin UI â€” Context Switch UseCase (Task 3.5)
    switchContextUseCase: asFunction(SwitchContextUseCaseImpl).singleton(),
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
    deleteVisitorUseCase: asFunction(DeleteVisitorUseCaseImpl).singleton(),
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
    // FASE 1.17 â€” Subscription Management (Task 44)
    subscriptionPlanService: asFunction(createSubscriptionPlanService).singleton(),
    subscriptionStatusService: asFunction(createSubscriptionStatusService).singleton(),
    // FASE 1.17 â€” Entitlement Enforcement (Task 45)
    entitlementService: asFunction(createEntitlementService).singleton(),
    // FASE 1.17 â€” Billing and Payment Integration (Task 47)
    billingService: asFunction(createBillingService).singleton(),
    // FASE 1.18 â€” Membership Lifecycle Management (Task 50)
    membershipEventEmitter: asFunction(LoggingMembershipEventEmitter).singleton(),
    membershipLifecycleService: asFunction(MembershipLifecycleServiceImpl).singleton(),
    // FASE 1.18 â€” Delegation Matrix (Task 51)
    // NOTE: key must be `auditEmitter` to match the destructured parameter in
    // DelegationMatrixServiceImpl under Awilix PROXY injection mode.
    auditEmitter: asFunction(LoggingDelegationAuditEmitter).singleton(),
    delegationMatrixService: asFunction(DelegationMatrixServiceImpl).singleton(),
    // FASE 1.18 â€” Tenant Ownership Transfer (Task 52)
    // NOTE: transferAuditEmitter key used for TenantTransferService dependency
    transferAuditEmitter: asFunction(LoggingTransferAuditEmitter).singleton(),
    tenantTransferService: asFunction(TenantTransferServiceImpl).singleton(),
    // FASE 1.18 â€” Membership Invitation Flow (Task 53)
    invitationEventEmitter: asFunction(LoggingInvitationEventEmitter).singleton(),
    membershipInvitationService: asFunction(MembershipInvitationServiceImpl).singleton(),
    // FASE 1.18 â€” Admin Membership Management (Task 54)
    adminMembershipAuditEmitter: asFunction(LoggingAdminMembershipAuditEmitter).singleton(),
    adminMembershipService: asFunction(AdminMembershipServiceImpl).singleton(),
    // FASE 1.18 â€” Household Isolation Enforcement (Task 55, INV-HOUSEHOLD-001)
    householdIsolationAuditEmitter: asFunction(LoggingHouseholdIsolationAuditEmitter).singleton(),
    householdIsolationService: asFunction(HouseholdIsolationServiceImpl).singleton(),
    // FASE 1.18 â€” Tenant Onboarding Flow (Task 49)
    onboardingEventEmitter: asFunction(LoggingOnboardingEventEmitter).singleton(),
    tenantOnboardingService: asFunction(TenantOnboardingServiceImpl).singleton(),
    // FASE 1.19 â€” OrgUnit Management Service (Task 57)
    orgUnitEventEmitter: asFunction(LoggingOrgUnitEventEmitter).singleton(),
    orgUnitManagementService: asFunction(OrgUnitManagementServiceImpl).singleton(),
    // FASE 1.19 â€” OrgUnit Hierarchy and CRUD Services (Task 58)
    orgUnitHierarchyReader: asFunction(OrgUnitHierarchyReaderImpl).singleton(),
    orgUnitScopeAuthorizer: asFunction(OrgUnitScopeAuthorizerImpl).singleton(),
    orgUnitCrudService: asFunction(OrgUnitCrudServiceImpl).singleton(),
    // FASE 1.19 â€” Multi-Cluster Support (Task 59)
    multiClusterService: asFunction(MultiClusterServiceImpl).singleton(),
    // FASE 1.19 â€” IoT Device Isolation Enforcement (Task 60, INV-IOT-001)
    iotDeviceIsolationAuditEmitter: asFunction(LoggingIoTDeviceIsolationAuditEmitter).singleton(),
    iotDeviceIsolationService: asFunction(IoTDeviceIsolationServiceImpl).singleton(),
    // FASE 1.20 â€” Audit Trail Implementation (Task 62)
    auditTrailEmitter: asFunction(LoggingAuditTrailEmitter).singleton(),
    auditTrailService: asFunction(AuditTrailServiceImpl).singleton(),
    // FASE 1.20 â€” Authorization Concurrency Handling (Task 63, Req 28)
    authorizationConcurrencyService: asFunction(AuthorizationConcurrencyServiceImpl).singleton(),
    // FASE 1.20 â€” Cache Invalidation Strategy (Task 64, Req 29)
    cacheInvalidationService: asFunction(CacheInvalidationServiceImpl).singleton(),
    // FASE 1.20 â€” Audit Security Events (Task 65, Req 30)
    auditSecurityEventsService: asFunction(AuditSecurityEventsServiceImpl).singleton(),
    // FASE 1.20 â€” Batch Operations Support (Task 66, Req 33)
    batchOperationsService: asFunction(BatchOperationsServiceImpl).singleton(),
    // FASE 1.20 â€” Permission Sync Mechanism (Task 67, Req 35)
    permissionSyncService: asFunction(PermissionSyncServiceImpl).singleton(),
    // FASE 1.20 â€” Tenant Data Isolation Audit (Task 68, Req 38)
    tenantDataIsolationAuditService: asFunction(TenantDataIsolationAuditServiceImpl).singleton(),
    // FASE 1.20 â€” Authorization Error Handling (Task 69, Req 39)
    authorizationErrorHandler: asFunction(AuthorizationErrorHandlerServiceImpl).singleton(),
    // FASE 1.20 â€” Notification Security (Task 71, Req 56)
    notificationSecurityService: asFunction(NotificationSecurityServiceImpl).singleton(),
    // FASE 1.20 â€” Cross-Tenant Prevention (Task 72, Req 59, Tenant Isolation)
    crossTenantPreventionService: asFunction(CrossTenantPreventionServiceImpl).singleton(),
    // Multi-Tenant Admin UI â€” Context Switch (Task 3.3, Requirements 1.5-1.7)
    contextSwitchService: asFunction(ContextSwitchServiceImpl).singleton(),
    // Multi-Tenant Admin UI â€” Membership Use Cases (Task 5.2)
    listMembersUseCase: asFunction(ListMembersUseCaseImpl).singleton(),
    // Multi-Tenant Admin UI â€” Change Member Role Use Case (Requirements 5.6-5.10)
    changeMemberRoleUseCase: asFunction(ChangeMemberRoleUseCaseImpl).singleton(),
    // Multi-Tenant Admin UI â€” Invite Member Use Case (Task 6.1, Requirements 3.8-3.11)
    inviteMemberUseCase: asFunction(InviteMemberUseCaseImpl).singleton(),
    // Multi-Tenant Admin UI â€” Bulk Member Operation Use Case (Task 8.1, Requirements 6.6-6.7)
    bulkMemberOperationUseCase: asFunction(BulkMemberOperationUseCaseImpl).singleton(),
    // Multi-Tenant Admin UI â€” OrgUnit Use Cases (Task 10.2)
    getOrgUnitTreeUseCase: asFunction(GetOrgUnitTreeUseCaseImpl).singleton(),
    // Multi-Tenant Admin UI â€” Create OrgUnit Use Case (Task 11.1, Requirements 8.4)
    createOrgUnitUseCase: asFunction(CreateOrgUnitUseCaseImpl).singleton(),
    // Multi-Tenant Admin UI â€” Update OrgUnit Use Case (Task 11.1, Requirements 8.7, 8.8)
    updateOrgUnitUseCase: asFunction(UpdateOrgUnitUseCaseImpl).singleton(),
    // Multi-Tenant Admin UI â€” Delete OrgUnit Use Case (Task 11.4, Requirements 8.9, 8.10)
    deleteOrgUnitUseCase: asFunction(DeleteOrgUnitUseCaseImpl).singleton(),
    // Multi-Tenant Admin UI â€” Move OrgUnit Use Case (Task 13.1, Requirements 10.4, 10.7, 10.8)
    moveOrgUnitUseCase: asFunction(MoveOrgUnitUseCaseImpl).singleton(),
    // Multi-Tenant Admin UI â€” Tenant Settings Use Cases (Task 18.2)
    // @see Requirements 11.1-11.4 (Tenant Settings Screen)
    getTenantSettingsUseCase: asFunction(GetTenantSettingsUseCaseImpl).singleton(),
    // @see Requirements 11.5-11.10 (Tenant Profile)
    updateTenantProfileUseCase: asFunction(UpdateTenantProfileUseCaseImpl).singleton(),
    // @see Requirements 12.2-12.10 (Tenant Configuration)
    updateTenantConfigUseCase: asFunction(UpdateTenantConfigUseCaseImpl).singleton(),
    // @see Requirements 13.5-13.9 (Tenant Lifecycle Management)
    manageTenantLifecycleUseCase: asFunction(ManageTenantLifecycleUseCaseImpl).singleton(),
    // Multi-Tenant Admin UI â€” Subscription Use Cases (Task 20.2)
    // @see Requirements 14.1-14.9 (Subscription Overview)
    getSubscriptionUseCase: asFunction(GetSubscriptionUseCaseImpl).singleton(),
    // @see Requirements 15.5-15.9 (Plan Change - Upgrade/Downgrade/Trial Conversion)
    changePlanUseCase: asFunction(ChangePlanUseCaseImpl).singleton(),
    // @see Requirements 16.1-16.11 (Billing History)
    getBillingHistoryUseCase: asFunction(GetBillingHistoryUseCaseImpl).singleton(),
    // Multi-Tenant Admin UI — Tenant Subscription View (Requirement 18, Subscription Status Management)
    // Composes subscriptionRepository + subscriptionPlanRepository (Awilix PROXY injection).
    getTenantSubscriptionUseCase: asFunction(GetTenantSubscriptionUseCaseImpl).singleton(),
    // Multi-Tenant Admin UI â€” Audit Use Cases (Task 24.2)
    // @see Requirements 17.1-17.13 (Audit Log Viewer)
    queryAuditLogsUseCase: asFunction(QueryAuditLogsUseCaseImpl).singleton(),
    // Multi-Tenant Admin UI â€” Audit Export Use Case (Task 25.1)
    // @see Requirements 18.1-18.10 (Audit Log Export)
    exportAuditLogsUseCase: asFunction(ExportAuditLogsUseCaseImpl).singleton(),
    // Multi-Tenant Admin UI â€” Platform Admin Use Cases (Requirements 19-21)
    getPlatformMetricsUseCase: asFunction(GetPlatformMetricsUseCaseImpl).singleton(),
    getTenantsOverviewUseCase: asFunction(GetTenantsOverviewUseCaseImpl).singleton(),
    getSecurityEventsUseCase: asFunction(GetSecurityEventsUseCaseImpl).singleton(),
    // @see Requirements 20.3-20.5 (Tenant Impersonation)
    impersonateTenantUseCase: asFunction(ImpersonateTenantUseCaseImpl).singleton(),
    endTenantImpersonationUseCase: asFunction(EndTenantImpersonationUseCaseImpl).singleton(),
  });
}

