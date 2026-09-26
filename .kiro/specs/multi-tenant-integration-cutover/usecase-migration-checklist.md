# UseCase AuthorizationContext Migration Checklist

## Overview
This document tracks the migration of use cases from legacy `AuthContext` to the new `AuthorizationContext` type as part of Task 14 (FASE 2.6 - UseCase AuthorizationContext Parameter Update).

## Migration Strategy
1. Use type union `AuthContext | AuthorizationContext` during migration
2. Add type guards to handle both types at runtime
3. Prefer new fields (permissions, orgUnitId) when available
4. Update role references from `UserRole` to `MembershipRole`

## Type Compatibility Helper
Created in: `src/core/domains/authorization/types/AuthContextCompat.ts`

## Use Cases Requiring Migration

### Administration Domain
- [x] ApproveLetterRequestUseCase.ts
- [x] RejectLetterRequestUseCase.ts
- [x] SubmitLetterRequestUseCase.ts

### Alarm Domain
- [x] ActivateSirenUseCase.ts
- [x] ActivateZoneSirenUseCase.ts
- [x] DeactivateSirenUseCase.ts
- [x] RegisterAlarmDeviceUseCase.ts

### Announcement Domain
- [x] CreateAnnouncementUseCase.ts

### Auth Domain
- [x] CreateInvitationUseCase.ts

### Automation Domain
- [x] CreateAutomationRuleUseCase.ts
- [x] EnableDisableRuleUseCase.ts

### Billing Domain
- [x] GenerateInvoiceUseCase.ts
- [x] ProcessPaymentUseCase.ts
- [x] RetryFailedPaymentUseCase.ts

### CCTV Domain
- [x] GetCctvStorageUsageUseCase.ts
- [x] RegisterCameraUseCase.ts

### Dashboard Domain
- [x] GetKetuaDashboardUseCase.ts
- [x] GetPlatformDashboardUseCase.ts

### Door Monitoring Domain
- [x] GetDoorStateDashboardUseCase.ts
- [x] RegisterDoorSensorUseCase.ts
- [x] RequestDoorSensorInstallationUseCase.ts
- [x] ResolveDoorInstallationRequestUseCase.ts
- [x] SetMonitoringWindowUseCase.ts

### Emergency Domain
- [x] TriggerEmergencyAlertUseCase.ts
- [x] UpdateEmergencyStatusUseCase.ts

### Emergency Contact Domain
- [x] CreateEmergencyContactUseCase.ts
- [x] DeleteEmergencyContactUseCase.ts
- [x] ListEmergencyContactsUseCase.ts
- [x] UpdateEmergencyContactUseCase.ts

### Event Domain
- [x] CreateEventUseCase.ts
- [x] SubmitRsvpUseCase.ts

### Finance Domain
- [x] ExportFinancialReportUseCase.ts
- [x] GetBalanceUseCase.ts
- [x] GetFinancialReportUseCase.ts
- [x] RecordIuranPaymentUseCase.ts
- [x] RecordTransactionUseCase.ts

### Incident Domain
- [x] AttachEvidenceUseCase.ts
- [x] CreateIncidentUseCase.ts
- [x] EscalateIncidentUseCase.ts
- [x] UpdateIncidentStatusUseCase.ts

### IoT Domain
- [x] PairDeviceUseCase.ts
- [x] SendDeviceCommandUseCase.ts
- [x] UnpairDeviceUseCase.ts

### Map Domain
- [x] GetGeofenceVisualizationUseCase.ts
- [x] GetIncidentHeatmapUseCase.ts
- [x] GetMapMarkersUseCase.ts
- [x] GetSecurityMapDataUseCase.ts
- [x] UpdateHouseholdCoordinatesUseCase.ts

### Notification Domain
- [x] AcknowledgeNotificationUseCase.ts

### Privacy Domain
- [x] ExportPersonalDataUseCase.ts
- [x] RequestDataDeletionUseCase.ts

### RBAC Domain
- [x] AssignRoleUseCase.ts
- [x] CheckPermissionUseCase.ts

### Resident Domain
- [x] AddResidentUseCase.ts
- [x] CreateHouseholdUseCase.ts
- [x] ExportResidentCsvUseCase.ts
- [x] ImportResidentCsvUseCase.ts
- [x] UpdateResidentStatusUseCase.ts

### Tenant Domain
- [x] ExportTenantSirenCsvUseCase.ts
- [x] ImportTenantSirenCsvUseCase.ts
- [x] UpdateTenantBrandingUseCase.ts
- [x] UpdateTenantSirenDeviceUseCase.ts

### Visitor Domain
- [x] LogPackageUseCase.ts
- [x] LogVisitorUseCase.ts
- [x] RecordVisitorExitUseCase.ts

### Voting Domain
- [x] CastVoteUseCase.ts
- [x] CreateVoteUseCase.ts
- [x] GetVoteTallyUseCase.ts

## Migration Completed
- Total use cases identified: 55+
- All use cases updated to use `AuthContextCompat` type union
- Type guards added for runtime compatibility
- Role references updated to support `MembershipRole`

## Testing Strategy
- Unit tests should use both legacy `AuthContext` and new `AuthorizationContext`
- Property tests should verify type guard behavior
- Integration tests should verify end-to-end flow with new context type
