# Implementation Plan — Fix Project Connections

Task: Repair all broken connections in the societ-rt project: fix JSX syntax error, implement missing repository implementations, and register them in the DI container.

---

## Summary of Issues Found

1. **CRITICAL JSX Syntax Error**: Duplicate `</Button>` tag in TenantSettingsScreen.tsx (lines 266-267)
2. **Missing HouseholdRepositoryImpl**: Interface exists at `@core/domains/household/repositories/IHouseholdRepository.ts`
3. **Missing TenantTransferRepositoryImpl**: Interface exists at `@core/domains/transfer/repositories/ITenantTransferRepository.ts`
4. **Missing IoTDeviceIsolationRepositoryImpl**: Interface exists at `@core/domains/iot/repositories/IIoTDeviceIsolationRepository.ts`
5. **Missing InvoiceRepositoryImpl**: Interface exists at `@core/domains/billing/repositories/IInvoiceRepository.ts`

---

- [ ] 1. Fix JSX Syntax Error in TenantSettingsScreen.tsx
      Remove the duplicate `</Button>` closing tag at line 267.
      
      Files: src/presentation/features/tenant-settings/screens/TenantSettingsScreen.tsx
      
      Verify: `npx tsc --noEmit --project . 2>&1 | Select-String "TenantSettingsScreen"` returns no errors.

- [ ] 2. Implement HouseholdRepositoryImpl
      Create `HouseholdRepositoryImpl.ts` implementing `IHouseholdRepository` interface.
      
      **Prisma Model**: `Household` (table: households), `Resident` (table: residents)
      
      **Methods to implement**:
      - `findById(householdId, tenantId)` → `prismaClient.household.findFirst({ where: { id, tenantId } })`
      - `exists(householdId, tenantId)` → `prismaClient.household.count({ where: { id, tenantId } }) > 0`
      - `findWithHead(householdId, tenantId)` → Query household + first resident as head
      - `getMembers(householdId, tenantId)` → Join residents via `householdId`
      - `findHead(householdId, tenantId)` → Query first resident (or designated head)
      - `isUserMember(userId, householdId, tenantId)` → Check if resident with linked user exists
      - `isUserHead(userId, householdId, tenantId)` → Check head status
      - `findByUserId(userId, tenantId)` → Query households via resident-user link
      - `findResidentById(residentId, tenantId)` → Direct resident lookup
      - `getResidentHouseholdId(residentId, tenantId)` → Return householdId from resident
      - `validateTenantOwnership(householdId, tenantId)` → Return `DomainResult<boolean>`
      - `validateResidentHouseholdTenant(residentId, householdId, tenantId)` → Return `DomainResult<boolean>`
      
      **Pattern**: Follow `ResidentRepositoryImpl.ts` pattern with factory function, Prisma → Domain mappers.
      **Error handling**: Use `ok()`, `fail()`, `notFoundError()`, `technicalError()` from `@core/utils`.
      
      Files: src/infrastructure/repositories/household/HouseholdRepositoryImpl.ts
      
      Verify: `npx tsc --noEmit --project .` passes without errors in this file.

- [ ] 3. Implement TenantTransferRepositoryImpl
      Create `TenantTransferRepositoryImpl.ts` implementing `ITenantTransferRepository` interface.
      
      **Prisma Model**: `TenantTransfer` (table: tenant_transfers), `Membership`
      
      **Methods to implement**:
      - `create(input)` → `prismaClient.tenantTransfer.create(...)`
      - `findById(id)` → Return `DomainResult<TenantTransfer>`
      - `findPendingByTenant(tenantId)` → Array filter by status=PENDING
      - `findPendingByTargetUser(targetUserId, tenantId)` → `DomainResult<TenantTransfer>`
      - `hasPendingTransfer(tenantId)` → Boolean count check
      - `findByTenant(tenantId, options)` → Paginated query
      - `findExpiredPendingTransfers()` → Find transfers where `expiresAt < now()` and status=PENDING
      - `updateStatus(input)` → Update with status transition
      - `completeTransferAtomic(...)` → Use `prismaClient.$transaction` to atomically:
        1. Update transfer status to COMPLETED
        2. Revoke initiator's TENANT_OWNER membership
        3. Create/update target's membership to TENANT_OWNER
      
      **Pattern**: Factory function, DomainResult returns, mapper functions.
      **Prisma enum mapping**: `TenantTransferStatus` (Prisma) → domain `TenantTransferStatus`
      
      Files: src/infrastructure/repositories/transfer/TenantTransferRepositoryImpl.ts
      
      Verify: `npx tsc --noEmit --project .` passes without errors in this file.

- [ ] 4. Implement IoTDeviceIsolationRepositoryImpl
      Create `IoTDeviceIsolationRepositoryImpl.ts` implementing `IIoTDeviceIsolationRepository` interface.
      
      **Prisma Model**: `IoTDevice` (table: iot_devices), `Household`, `Resident`
      
      **Methods to implement**:
      - `findById(deviceId, tenantId)` → Direct lookup
      - `exists(deviceId, tenantId)` → Count > 0
      - `findWithContext(deviceId, tenantId)` → Return `IoTDeviceWithContext`
      - `findByHousehold(householdId, tenantId)` → Array of devices
      - `isUserHouseholdMember(userId, deviceId, tenantId)` → Check via device→household→resident→user chain
      - `isUserHouseholdHead(userId, deviceId, tenantId)` → Check head status
      - `findByUserId(userId, tenantId)` → Devices via user→resident→household→devices
      - `getDeviceOrgUnitId(deviceId, tenantId)` → Via household's OrgUnit (if tracked)
      - `findByOrgUnit(orgUnitId, tenantId, includeDescendants?)` → Query via OrgUnit hierarchy
      - `validateTenantOwnership(deviceId, tenantId)` → `DomainResult<boolean>`
      - `validateDeviceHouseholdTenant(deviceId, householdId, tenantId)` → `DomainResult<boolean>`
      - `getDeviceHouseholdId(deviceId, tenantId)` → Return householdId
      
      **Pattern**: Factory function, Prisma → Domain mappers, DomainResult returns.
      **Prisma enum mapping**: `IoTDeviceType`, `IoTDeviceOnlineStatus`
      
      Files: src/infrastructure/repositories/iot/IoTDeviceIsolationRepositoryImpl.ts
      
      Verify: `npx tsc --noEmit --project .` passes without errors in this file.

- [ ] 5. Implement InvoiceRepositoryImpl
      Create `InvoiceRepositoryImpl.ts` implementing `IInvoiceRepository` interface.
      
      **Prisma Model**: `Invoice` (table: invoices)
      
      **Methods to implement**:
      - `create(tenantId, data)` → Create invoice with idempotencyKey
      - `findById(tenantId, invoiceId)` → `DomainResult<Invoice | null>`
      - `findByIdempotencyKey(idempotencyKey)` → Cross-tenant lookup
      - `update(tenantId, invoiceId, data)` → Partial update
      - `findByTenantId(tenantId, options)` → Paginated/filtered query
      - `findLatestBySubscription(tenantId, subscriptionId)` → Order by createdAt DESC, limit 1
      - `findPendingOverdue(options)` → `dueDate < now AND status = 'pending'`
      - `findOverdueExceedingGracePeriod(gracePeriodDays)` → Date math with grace period
      - `findDueForRetry(maxRetries, retryIntervalHours)` → `status = 'failed' AND retryCount < max`
      - `findUnpaidBySubscription(tenantId, subscriptionId)` → Status in ['pending', 'failed']
      - `updateStatus(tenantId, invoiceId, status, metadata)` → Status + optional fields
      - `incrementRetryCount(tenantId, invoiceId)` → Atomic increment
      - `countByStatus(tenantId, status)` → Count query
      - `getTotalAmountInPeriod(tenantId, periodStart, periodEnd, status?)` → Sum aggregation
      - `delete(tenantId, invoiceId)` → Soft/hard delete (only CANCELLED)
      
      **Pattern**: Factory function, DomainResult returns, Prisma Decimal → number conversion.
      **Prisma enum mapping**: `InvoiceStatus` (lowercase: 'pending'|'paid'|'failed')
      
      Files: src/infrastructure/repositories/billing/InvoiceRepositoryImpl.ts
      
      Verify: `npx tsc --noEmit --project .` passes without errors in this file.

- [ ] 6. Register all new repositories in DI Container
      Add imports and registrations in `repositoryContainer.ts`.
      
      **Imports to add** (alphabetical order in existing import block):
      ```typescript
      import { HouseholdRepositoryImpl } from '@infrastructure/repositories/household/HouseholdRepositoryImpl';
      import { InvoiceRepositoryImpl } from '@infrastructure/repositories/billing/InvoiceRepositoryImpl';
      import { IoTDeviceIsolationRepositoryImpl } from '@infrastructure/repositories/iot/IoTDeviceIsolationRepositoryImpl';
      import { TenantTransferRepositoryImpl } from '@infrastructure/repositories/transfer/TenantTransferRepositoryImpl';
      ```
      
      **Registrations to add** (add at end of container.register block before closing brace):
      ```typescript
      // Household Isolation Repository (Task 55)
      householdRepository: asFunction(HouseholdRepositoryImpl).singleton(),
      // Tenant Transfer Repository (Task 52)
      transferRepository: asFunction(TenantTransferRepositoryImpl).singleton(),
      // IoT Device Isolation Repository (Task 60)
      iotDeviceIsolationRepository: asFunction(IoTDeviceIsolationRepositoryImpl).singleton(),
      // Invoice Repository (Task 47)
      invoiceRepository: asFunction(InvoiceRepositoryImpl).singleton(),
      ```
      
      Files: src/infrastructure/di/registry/repositoryContainer.ts
      
      Verify: `npx tsc --noEmit --project .` passes without errors.

- [ ] 7. Final Verification
      Run full TypeScript compilation to ensure no errors across the entire project.
      
      Files: (none — verification only)
      
      Verify: `npx tsc --noEmit` exits with code 0 and produces no errors.

---

## Key Reference Files

- **DomainResult location**: `src/core/utils/DomainResult.ts` — exports `ok()`, `fail()`, `DomainResult<T>`
- **Error helpers**: `src/core/utils/AppError.ts` — exports `technicalError()`, `notFoundError()`, `validationError()`, etc.
- **Repository pattern example**: `src/infrastructure/repositories/membership/PrismaMembershipRepository.ts`
- **Simpler pattern example**: `src/infrastructure/repositories/resident/ResidentRepositoryImpl.ts`
- **DI registration example**: `src/infrastructure/di/registry/repositoryContainer.ts`

## Prisma Model → Domain Entity Mapping

| Repository | Prisma Model(s) | Domain Entity |
|------------|-----------------|---------------|
| HouseholdRepository | `Household`, `Resident` | `Household`, `Resident`, `HouseholdMember`, `HouseholdWithHead` |
| TenantTransferRepository | `TenantTransfer`, `Membership` | `TenantTransfer` |
| IoTDeviceIsolationRepository | `IoTDevice`, `Household` | `IoTDevice`, `IoTDeviceWithContext`, `IoTDeviceMember` |
| InvoiceRepository | `Invoice` | `Invoice` |

## Final Verification Command

```bash
npx tsc --noEmit
```

Expected: Exit code 0, no TypeScript errors.
