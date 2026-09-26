/**
 * Household domain barrel export.
 *
 * This domain provides household data isolation enforcement implementing
 * INV-HOUSEHOLD-001: Household.tenantId == Resident.tenantId
 *
 * @see Task 55: Household Isolation Enforcement
 */

export * from './entities';
export * from './errors';
export * from './repositories';
export * from './services';
