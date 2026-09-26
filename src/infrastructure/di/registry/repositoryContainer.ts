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
import { RefreshTokenRepositoryImpl } from '@infrastructure/repositories/auth/RefreshTokenRepositoryImpl';
import { PrismaSubscriptionPlanRepositoryImpl } from '@infrastructure/repositories/subscription/PrismaSubscriptionPlanRepository';
import { PrismaSubscriptionRepositoryImpl } from '@infrastructure/repositories/subscription/PrismaSubscriptionRepository';
import { PrismaOrgUnitRepositoryImpl, PrismaOrgUnitWriteRepositoryImpl } from '@infrastructure/repositories/orgunit';
import { AuditTrailRepositoryImpl } from '@infrastructure/repositories/audit/AuditTrailRepositoryImpl';


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
    refreshTokenRepository: asFunction(RefreshTokenRepositoryImpl).singleton(),
    // FASE 1.17 — Subscription Management (Task 44)
    subscriptionPlanRepository: asFunction(PrismaSubscriptionPlanRepositoryImpl).singleton(),
    subscriptionRepository: asFunction(PrismaSubscriptionRepositoryImpl).singleton(),
    // FASE 1.19 — OrgUnit Management (Task 57-58)
    orgUnitRepository: asFunction(PrismaOrgUnitRepositoryImpl).singleton(),
    orgUnitWriteRepository: asFunction(PrismaOrgUnitWriteRepositoryImpl).singleton(),
    // FASE 1.20 — Audit Trail Implementation (Task 62)
    auditTrailRepository: asFunction(AuditTrailRepositoryImpl).singleton(),

  });
}
