/**
 * Registry Index — Orchestrates all DI registrations in the correct order.
 *
 * Registration order:
 * 1. Logging (needed by other services)
 * 2. Modules (protocol implementations / adapters)
 * 3. Repositories
 * 4. Use Cases
 * 5. ViewModels
 */

import type { AwilixContainer } from 'awilix';
import { registerModules } from './moduleContainer';
import { registerRepositories } from './repositoryContainer';
import { registerUseCases } from './useCasesContainer';
import { registerViewModels } from './viewModelContainer';
import { registerLogging } from './loggingContainer';

export function registerAll(container: AwilixContainer): void {
  registerLogging(container);
  registerModules(container);
  registerRepositories(container);
  registerUseCases(container);
  registerViewModels(container);
}
