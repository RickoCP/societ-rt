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
  });
}
