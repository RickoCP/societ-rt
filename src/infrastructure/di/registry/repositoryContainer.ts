/**
 * Repository Container — Registers repository implementations.
 *
 * Binds core repository interfaces to their infrastructure implementations.
 * All repositories are registered as singletons (stateless).
 */

import { asFunction, type AwilixContainer } from 'awilix';
import { AuthRepositoryImpl } from '@infrastructure/repositories/auth/AuthRepositoryImpl';
import { RbacRepositoryImpl } from '@infrastructure/repositories/rbac/RbacRepositoryImpl';
import { TenantRepositoryImpl } from '@infrastructure/repositories/tenant/TenantRepositoryImpl';
import { ResidentRepositoryImpl } from '@infrastructure/repositories/resident/ResidentRepositoryImpl';
import { FinanceRepositoryImpl } from '@infrastructure/repositories/finance/FinanceRepositoryImpl';
import { VotingRepositoryImpl } from '@infrastructure/repositories/voting/VotingRepositoryImpl';
import { AnnouncementRepositoryImpl } from '@infrastructure/repositories/announcement/AnnouncementRepositoryImpl';
import { EmergencyRepositoryImpl } from '@infrastructure/repositories/emergency/EmergencyRepositoryImpl';
import { MapRepositoryImpl } from '@infrastructure/repositories/map/MapRepositoryImpl';
import { SecurityRepositoryImpl } from '@infrastructure/repositories/security/SecurityRepositoryImpl';
import { AdministrationRepositoryImpl } from '@infrastructure/repositories/administration/AdministrationRepositoryImpl';
import { EventRepositoryImpl } from '@infrastructure/repositories/event/EventRepositoryImpl';
import { VisitorRepositoryImpl } from '@infrastructure/repositories/visitor/VisitorRepositoryImpl';
import { BillingRepositoryImpl } from '@infrastructure/repositories/billing/BillingRepositoryImpl';
import { FeatureFlagRepositoryImpl } from '@infrastructure/repositories/featureFlag/FeatureFlagRepositoryImpl';
import { NotificationRepositoryImpl } from '@infrastructure/repositories/notification/NotificationRepositoryImpl';
import { AuditRepositoryImpl } from '@infrastructure/repositories/audit/AuditRepositoryImpl';
import { AuditAdminRepositoryImpl } from '@infrastructure/repositories/audit/AuditAdminRepositoryImpl';
import { DashboardRepositoryImpl } from '@infrastructure/repositories/dashboard/DashboardRepositoryImpl';
import { FileStorageRepositoryImpl } from '@infrastructure/repositories/fileStorage/FileStorageRepositoryImpl';
import { PrivacyRepositoryImpl } from '@infrastructure/repositories/privacy/PrivacyRepositoryImpl';
import { OperationalRepositoryImpl } from '@infrastructure/repositories/operational/OperationalRepositoryImpl';
import { IoTRepositoryImpl } from '@infrastructure/repositories/iot/IoTRepositoryImpl';
import { IncidentRepositoryImpl } from '@infrastructure/repositories/incident/IncidentRepositoryImpl';
import { GateRepositoryImpl } from '@infrastructure/repositories/gate/GateRepositoryImpl';
import { CctvRepositoryImpl } from '@infrastructure/repositories/cctv/CctvRepositoryImpl';
import { PatrolRepositoryImpl } from '@infrastructure/repositories/patrol/PatrolRepositoryImpl';
import { AlarmRepositoryImpl } from '@infrastructure/repositories/alarm/AlarmRepositoryImpl';
import { AutomationRepositoryImpl } from '@infrastructure/repositories/automation/AutomationRepositoryImpl';
import { HomeRepositoryImpl } from '@infrastructure/repositories/societHome/HomeRepositoryImpl';
import { SecurityCenterRepositoryImpl } from '@infrastructure/repositories/securityCenter/SecurityCenterRepositoryImpl';
import { DoorMonitoringRepositoryImpl } from '@infrastructure/repositories/doorMonitoring/DoorMonitoringRepositoryImpl';
import { EmergencyContactRepositoryImpl } from '@infrastructure/repositories/emergencyContact/EmergencyContactRepositoryImpl';
import { PrismaMembershipRepositoryImpl } from '@infrastructure/repositories/membership/PrismaMembershipRepository';
import { PrismaMembershipWriteRepositoryImpl } from '@infrastructure/repositories/membership/PrismaMembershipWriteRepository';
import { PrismaMembershipInvitationRepositoryImpl } from '@infrastructure/repositories/membership/PrismaMembershipInvitationRepository';
import { PrismaAdminMembershipRepositoryImpl } from '@infrastructure/repositories/membership/PrismaAdminMembershipRepository';
import { MembershipAdminRepositoryImpl } from '@infrastructure/repositories/membership/MembershipAdminRepositoryImpl';
import { RefreshTokenRepositoryImpl } from '@infrastructure/repositories/auth/RefreshTokenRepositoryImpl';
import { ContextSwitchRepositoryImpl } from '@infrastructure/repositories/auth/ContextSwitchRepositoryImpl';
import { PrismaSubscriptionPlanRepositoryImpl } from '@infrastructure/repositories/subscription/PrismaSubscriptionPlanRepository';
import { PrismaSubscriptionRepositoryImpl } from '@infrastructure/repositories/subscription/PrismaSubscriptionRepository';
import { SubscriptionAdminRepositoryImpl } from '@infrastructure/repositories/subscription/SubscriptionAdminRepositoryImpl';
import { PrismaOrgUnitRepositoryImpl, PrismaOrgUnitWriteRepositoryImpl, OrgUnitRepositoryImpl } from '@infrastructure/repositories/orgunit';
import { AuditTrailRepositoryImpl } from '@infrastructure/repositories/audit/AuditTrailRepositoryImpl';
import { TenantSettingsRepositoryImpl } from '@infrastructure/repositories/tenant/TenantSettingsRepositoryImpl';
import { PlatformRepositoryImpl } from '@infrastructure/repositories/platform/PlatformRepositoryImpl';


export function registerRepositories(container: AwilixContainer): void {
  container.register({
    authRepository: asFunction(AuthRepositoryImpl).singleton(),
    rbacRepository: asFunction(RbacRepositoryImpl).singleton(),
    tenantRepository: asFunction(TenantRepositoryImpl).singleton(),
    residentRepository: asFunction(ResidentRepositoryImpl).singleton(),
    financeRepository: asFunction(FinanceRepositoryImpl).singleton(),
    votingRepository: asFunction(VotingRepositoryImpl).singleton(),
    announcementRepository: asFunction(AnnouncementRepositoryImpl).singleton(),
    emergencyRepository: asFunction(EmergencyRepositoryImpl).singleton(),
    mapRepository: asFunction(MapRepositoryImpl).singleton(),
    securityRepository: asFunction(SecurityRepositoryImpl).singleton(),
    administrationRepository: asFunction(AdministrationRepositoryImpl).singleton(),
    eventRepository: asFunction(EventRepositoryImpl).singleton(),
    visitorRepository: asFunction(VisitorRepositoryImpl).singleton(),
    billingRepository: asFunction(BillingRepositoryImpl).singleton(),
    featureFlagRepository: asFunction(FeatureFlagRepositoryImpl).singleton(),
    notificationRepository: asFunction(NotificationRepositoryImpl).singleton(),
    auditRepository: asFunction(AuditRepositoryImpl).singleton(),
    dashboardRepository: asFunction(DashboardRepositoryImpl).singleton(),
    fileStorageRepository: asFunction(FileStorageRepositoryImpl).singleton(),
    privacyRepository: asFunction(PrivacyRepositoryImpl).singleton(),
    operationalRepository: asFunction(OperationalRepositoryImpl).singleton(),
    iotRepository: asFunction(IoTRepositoryImpl).singleton(),
    incidentRepository: asFunction(IncidentRepositoryImpl).singleton(),
    gateRepository: asFunction(GateRepositoryImpl).singleton(),
    cctvRepository: asFunction(CctvRepositoryImpl).singleton(),
    patrolRepository: asFunction(PatrolRepositoryImpl).singleton(),
    alarmRepository: asFunction(AlarmRepositoryImpl).singleton(),
    automationRepository: asFunction(AutomationRepositoryImpl).singleton(),
    homeRepository: asFunction(HomeRepositoryImpl).singleton(),
    securityCenterRepository: asFunction(SecurityCenterRepositoryImpl).singleton(),
    doorMonitoringRepository: asFunction(DoorMonitoringRepositoryImpl).singleton(),
    emergencyContactRepository: asFunction(EmergencyContactRepositoryImpl).singleton(),
    membershipRepository: asFunction(PrismaMembershipRepositoryImpl).singleton(),
    membershipWriteRepository: asFunction(PrismaMembershipWriteRepositoryImpl).singleton(),
    membershipInvitationRepository: asFunction(PrismaMembershipInvitationRepositoryImpl).singleton(),
    adminMembershipRepository: asFunction(PrismaAdminMembershipRepositoryImpl).singleton(),
    // Admin UI Membership Repository (Multi-Tenant Admin UI)
    membershipAdminRepository: asFunction(MembershipAdminRepositoryImpl).singleton(),
    refreshTokenRepository: asFunction(RefreshTokenRepositoryImpl).singleton(),
    // Multi-Tenant Admin UI — Context Switch Repository (Task 3.5)
    contextSwitchRepository: asFunction(ContextSwitchRepositoryImpl).singleton(),
    // FASE 1.17 — Subscription Management (Task 44)
    subscriptionPlanRepository: asFunction(PrismaSubscriptionPlanRepositoryImpl).singleton(),
    subscriptionRepository: asFunction(PrismaSubscriptionRepositoryImpl).singleton(),
    // Multi-Tenant Admin UI — Subscription Admin Repository (overview, plans, billing history)
    subscriptionAdminRepository: asFunction(SubscriptionAdminRepositoryImpl).singleton(),
    // FASE 1.19 — OrgUnit Management (Task 57-58)
    orgUnitRepository: asFunction(PrismaOrgUnitRepositoryImpl).singleton(),
    orgUnitWriteRepository: asFunction(PrismaOrgUnitWriteRepositoryImpl).singleton(),
    // Multi-Tenant Admin UI — OrgUnit Admin Repository (Task 10.2)
    orgUnitAdminRepository: asFunction(OrgUnitRepositoryImpl).singleton(),
    // FASE 1.20 — Audit Trail Implementation (Task 62)
    auditTrailRepository: asFunction(AuditTrailRepositoryImpl).singleton(),
    // Multi-Tenant Admin UI — Tenant Settings Repository (Profile, Configuration, Lifecycle)
    tenantSettingsRepository: asFunction(TenantSettingsRepositoryImpl).singleton(),
    // Multi-Tenant Admin UI — Audit Admin Repository (Task 24.2, Requirements 17.4-17.7)
    auditAdminRepository: asFunction(AuditAdminRepositoryImpl).singleton(),
    // Multi-Tenant Admin UI — Platform Admin Repository (Requirements 19.1-19.11, 21.1-21.10)
    platformRepository: asFunction(PlatformRepositoryImpl).singleton(),

  });
}
