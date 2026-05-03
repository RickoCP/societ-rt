/**
 * Logging Container — Registers logger and analytics implementations.
 *
 * Registers the structured JSON logger as a singleton so all layers
 * share a single logger instance resolved via DI.
 *
 * @see Requirements 25.1, 25.2
 */

import { asFunction, type AwilixContainer } from 'awilix';
import { createLogger } from '@infrastructure/logging/Logger';

export function registerLogging(container: AwilixContainer): void {
  container.register({
    logger: asFunction(createLogger).singleton(),
  });
}
