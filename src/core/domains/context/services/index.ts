/**
 * Context services barrel export.
 *
 * @see FASE 1.8 Task 18: Context Switch Service
 * @see Requirements 4 (AC 1-8)
 */

export type {
  IContextSwitchService,
  ContextSwitchService,
  ContextSwitchServiceDependencies,
  ITenantNameResolver,
  IOrgUnitNameResolver,
} from './ContextSwitchService';

export { ContextSwitchServiceImpl } from './ContextSwitchService';
