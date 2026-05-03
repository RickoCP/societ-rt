export type { AppError, AppErrorType } from './AppError';
export {
  validationError,
  businessError,
  authenticationError,
  authorizationError,
  notFoundError,
  technicalError,
  unexpectedError,
} from './AppError';

export type { DomainResult } from './DomainResult';
export {
  ok,
  fail,
  unwrapOrThrow,
  unwrapOr,
  mapResult,
  isOk,
  isFail,
} from './DomainResult';
