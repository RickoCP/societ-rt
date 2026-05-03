/**
 * Awilix DI Container — Root container for the application.
 *
 * Uses PROXY injection mode so factory functions receive dependencies
 * via object destructuring.
 *
 * @see Requirements 23.1
 */

import { createContainer, InjectionMode, type AwilixContainer } from 'awilix';
import { registerAll } from './registry';

const container: AwilixContainer = createContainer({
  injectionMode: InjectionMode.PROXY,
});

registerAll(container);

export { container };
