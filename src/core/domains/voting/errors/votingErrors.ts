/**
 * Voting-specific error factory functions.
 *
 * Each function returns a typed AppError with a stable, searchable code.
 * Uses the factory helpers from AppError.ts to ensure consistency.
 *
 * @see Requirements 8.3, 8.4, 8.5
 */

import type { AppError } from '@core/utils';
import { businessError, validationError } from '@core/utils';

/** Vote must have at least 2 options. */
export function votingInsufficientOptions(): AppError {
  return validationError(
    'VOTING_INSUFFICIENT_OPTIONS',
    'At least 2 options are required to create a vote',
  );
}

/** The vote deadline has already passed — no more ballots accepted. */
export function votingDeadlinePassed(): AppError {
  return businessError(
    'VOTING_DEADLINE_PASSED',
    'The voting deadline has passed',
  );
}

/** The user has already cast a ballot on this vote. */
export function votingAlreadyVoted(): AppError {
  return businessError(
    'VOTING_ALREADY_VOTED',
    'User has already voted on this vote',
  );
}
