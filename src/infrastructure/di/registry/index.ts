/**
 * Registry Index — Orchestrates all DI registrations in the correct order.
 *
 * Registration order:
 * 1. Modules (protocol implementations / adapters)
 * 2. Repositories
 * 3. Use Cases
 * 4. ViewModels
 * 5. Logging
 */

import type { AwilixContainer } from 'awilix';
import { registerModules } from './moduleContainer';
import { registerRepositories } from './repositoryContainer';
import { registerUseCases } from './useCasesContainer';
import { registerViewModels } from './viewModelContainer';
import { registerLogging } from './loggingContainer';

export function registerAll(container: AwilixContainer): void {
  registerModules(container);
  registerRepositories(container);
  registerUseCases(container);
  registerViewModels(container);
  registerLogging(container);
}
