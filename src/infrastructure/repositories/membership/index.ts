/**
 * Membership Repository Module Barrel Export
 *
 * This module provides the Prisma-based implementation of IMembershipRepository,
 * MembershipWriteRepository, and IMembershipInvitationRepository for membership operations.
 *
 * **Primary Exports:**
 * - `PrismaMembershipRepositoryImpl` — Factory function for read operations (FASE 1.6)
 * - `PrismaMembershipWriteRepositoryImpl` — Factory function for write operations (FASE 1.18)
 * - `PrismaMembershipInvitationRepositoryImpl` — Factory function for invitation operations (FASE 1.18)
 * - `MembershipAdminRepositoryImpl` — Factory function for Admin UI operations (Multi-Tenant Admin UI)
 *
 * **Usage:**
 * ```typescript
 * // DI Registration
 * import {
 *   PrismaMembershipRepositoryImpl,
 *   PrismaMembershipWriteRepositoryImpl,
 *   PrismaMembershipInvitationRepositoryImpl,
 *   MembershipAdminRepositoryImpl,
 * } from '@infrastructure/repositories/membership';
 *
 * container.register({
 *   membershipRepository: asFunction(PrismaMembershipRepositoryImpl).singleton(),
 *   membershipWriteRepository: asFunction(PrismaMembershipWriteRepositoryImpl).singleton(),
 *   membershipInvitationRepository: asFunction(PrismaMembershipInvitationRepositoryImpl).singleton(),
 *   membershipAdminRepository: asFunction(MembershipAdminRepositoryImpl).singleton(),
 * });
 * ```
 *
 * @see FASE 1.6 Task 4: Membership Repository Prisma Adapter
 * @see FASE 1.18 Task 50: Membership Lifecycle Management
 * @see FASE 1.18 Task 53: Membership Invitation Flow
 * @see Requirements 1 (AC 1-7), 22 (AC 1-7), 25 (AC 1-9)
 * @see Requirements 2.2-2.8 (Member List Screen - Admin UI)
 */

export { PrismaMembershipRepositoryImpl } from './PrismaMembershipRepository';
export { PrismaMembershipWriteRepositoryImpl } from './PrismaMembershipWriteRepository';
export { PrismaMembershipInvitationRepositoryImpl } from './PrismaMembershipInvitationRepository';
export { PrismaAdminMembershipRepositoryImpl } from './PrismaAdminMembershipRepository';
export { MembershipAdminRepositoryImpl } from './MembershipAdminRepositoryImpl';