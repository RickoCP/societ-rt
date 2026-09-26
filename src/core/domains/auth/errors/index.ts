export {
  // Credential errors
  authInvalidCredentials,
  authAccountLocked,
  // Token errors
  authTokenInvalid,
  authTokenRevoked,
  // Refresh token errors
  authRefreshTokenInvalid,
  authRefreshTokenExpired,
  authTokenReuseDetected,
  authRefreshTokenAlreadyUsed,
  // Authorization errors
  authRoleEscalationDenied,
  authInsufficientRole,
  // Session management errors
  authSessionNotFound,
  authUserNotFound,
} from './authErrors';
