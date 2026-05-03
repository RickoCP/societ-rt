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
  });
}
