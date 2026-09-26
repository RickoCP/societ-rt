/**
 * Log Sanitizer — Ensures sensitive data never appears in logs.
 *
 * This module provides comprehensive sanitization for log payloads,
 * implementing security requirements for observability and audit logging.
 *
 * ## Sensitive Data Classification (MUST NEVER LOG)
 *
 * 1. **Authentication Credentials**
 *    - Passwords (password, pwd, pass, passwd)
 *    - Tokens (token, accessToken, refreshToken, access_token, refresh_token)
 *    - API keys (apiKey, api_key, apiSecret, api_secret)
 *    - Secrets (secret, privateKey, private_key)
 *
 * 2. **Authentication Codes**
 *    - OTP (otp, verificationCode, verification_code, pin)
 *    - MFA codes (mfaCode, mfa_code, twoFactorCode, 2fa)
 *
 * 3. **Financial Data**
 *    - CVV (cvv, cvc, securityCode, security_code)
 *    - Full credit card numbers (cardNumber, card_number, creditCard, credit_card)
 *    - Bank account numbers (accountNumber, account_number, bankAccount)
 *
 * 4. **Session Data**
 *    - Session IDs that could enable session hijacking
 *    - Cookie values (cookie, sessionId, session_id)
 *    - Authorization headers (authorization, auth)
 *
 * ## PII Masking (MASK, NOT EXCLUDE)
 *
 * 1. **Email addresses** → ri***@domain.com
 * 2. **Phone numbers** → 0812****1234
 * 3. **ID numbers** → ***1234 (last 4 digits visible)
 *
 * @see Requirements 15.5 — Ensure no sensitive data in logs
 * @see Security Guideline — Logging Aman section
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SanitizationConfig {
  /** Whether to enable deep object sanitization (default: true) */
  readonly deepSanitize: boolean;
  /** Maximum depth for recursive sanitization (default: 10) */
  readonly maxDepth: number;
  /** Whether to mask PII instead of redacting (default: true) */
  readonly maskPii: boolean;
  /** Custom sensitive keys to add (merged with defaults) */
  readonly additionalSensitiveKeys?: ReadonlySet<string>;
  /** Custom PII keys to add (merged with defaults) */
  readonly additionalPiiKeys?: ReadonlySet<string>;
}

export interface SanitizationResult {
  /** The sanitized payload */
  readonly sanitized: Record<string, unknown>;
  /** Whether any sensitive data was found and redacted */
  readonly hadSensitiveData: boolean;
  /** List of keys that were redacted (for audit purposes) */
  readonly redactedKeys: readonly string[];
  /** List of keys that were masked (for audit purposes) */
  readonly maskedKeys: readonly string[];
}

export interface LogSanitizer {
  /**
   * Sanitize a log payload, redacting sensitive data and masking PII.
   * Returns a new object — the original is never mutated.
   */
  sanitize(payload: Record<string, unknown>): SanitizationResult;

  /**
   * Quick sanitize method that returns only the sanitized payload.
   * Use when audit metadata is not needed.
   */
  sanitizePayload(payload: Record<string, unknown>): Record<string, unknown>;

  /**
   * Check if a string value contains sensitive patterns.
   * Useful for validating string values that might contain embedded secrets.
   */
  containsSensitivePattern(value: string): boolean;

  /**
   * Mask a PII value (email, phone, ID).
   * Returns masked version or original if not a recognized PII format.
   */
  maskPiiValue(value: string, type: 'email' | 'phone' | 'id'): string;

  /**
   * Get the list of sensitive keys being monitored.
   * Useful for audit and documentation purposes.
   */
  getSensitiveKeysList(): readonly string[];

  /**
   * Get the list of PII keys being monitored.
   * Useful for audit and documentation purposes.
   */
  getPiiKeysList(): readonly string[];
}

// ---------------------------------------------------------------------------
// Sensitive Data Keys — MUST NEVER LOG (complete redaction)
// ---------------------------------------------------------------------------

/**
 * Keys that contain authentication credentials.
 * Values for these keys are ALWAYS redacted.
 */
const CREDENTIAL_KEYS = new Set([
  // Passwords
  'password',
  'pwd',
  'pass',
  'passwd',
  'currentpassword',
  'current_password',
  'newpassword',
  'new_password',
  'oldpassword',
  'old_password',
  'confirmpassword',
  'confirm_password',
  'passwordhash',
  'password_hash',

  // Tokens
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'idtoken',
  'id_token',
  'bearertoken',
  'bearer_token',
  'jwttoken',
  'jwt_token',
  'authtoken',
  'auth_token',

  // API Keys and Secrets
  'apikey',
  'api_key',
  'apisecret',
  'api_secret',
  'secret',
  'secretkey',
  'secret_key',
  'privatekey',
  'private_key',
  'clientsecret',
  'client_secret',
  'appsecret',
  'app_secret',
]);

/**
 * Keys that contain authentication codes.
 * Values for these keys are ALWAYS redacted.
 */
const AUTH_CODE_KEYS = new Set([
  // OTP
  'otp',
  'otpcode',
  'otp_code',
  'verificationcode',
  'verification_code',
  'pin',
  'pincode',
  'pin_code',
  'securitycode',

  // MFA
  'mfacode',
  'mfa_code',
  'twofactorcode',
  'two_factor_code',
  '2fa',
  '2facode',
  '2fa_code',
  'totpcode',
  'totp_code',
  'backupcode',
  'backup_code',
  'recoverycode',
  'recovery_code',
]);

/**
 * Keys that contain financial sensitive data.
 * Values for these keys are ALWAYS redacted.
 */
const FINANCIAL_KEYS = new Set([
  // Card security
  'cvv',
  'cvc',
  'cvv2',
  'cvc2',
  'cardsecuritycode',
  'card_security_code',

  // Full card numbers
  'cardnumber',
  'card_number',
  'creditcard',
  'credit_card',
  'creditcardnumber',
  'credit_card_number',
  'debitcard',
  'debit_card',
  'pan',

  // Bank accounts
  'accountnumber',
  'account_number',
  'bankaccount',
  'bank_account',
  'routingnumber',
  'routing_number',
  'iban',
  'swiftcode',
  'swift_code',
]);

/**
 * Keys that contain session/cookie data.
 * Values for these keys are ALWAYS redacted.
 */
const SESSION_KEYS = new Set([
  'cookie',
  'cookies',
  'sessionid',
  'session_id',
  'sessiontoken',
  'session_token',
  'authorization',
  'auth',
  'authheader',
  'auth_header',
  'xauthtoken',
  'x_auth_token',
]);

/**
 * Combined set of all sensitive keys — COMPLETE REDACTION.
 */
const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  ...CREDENTIAL_KEYS,
  ...AUTH_CODE_KEYS,
  ...FINANCIAL_KEYS,
  ...SESSION_KEYS,
]);

// ---------------------------------------------------------------------------
// PII Keys — MASKED (not fully redacted)
// ---------------------------------------------------------------------------

/**
 * Keys that contain PII requiring masking.
 * Values are masked to show partial information.
 */
const PII_KEYS = new Set([
  // Email
  'email',
  'emailaddress',
  'email_address',
  'useremail',
  'user_email',

  // Phone
  'phone',
  'phonenumber',
  'phone_number',
  'mobile',
  'mobilenumber',
  'mobile_number',
  'cellphone',
  'cell_phone',
  'telephone',

  // ID numbers
  'ssn',
  'socialsecuritynumber',
  'social_security_number',
  'nationalid',
  'national_id',
  'idnumber',
  'id_number',
  'passportnumber',
  'passport_number',
  'driverlicense',
  'driver_license',
  'ktp',
  'nik',
]);

// ---------------------------------------------------------------------------
// Sensitive Patterns — For detecting embedded secrets in string values
// ---------------------------------------------------------------------------

/**
 * Patterns that indicate a string value might contain sensitive data.
 * Used to detect Bearer tokens, API keys embedded in URLs, etc.
 */
const SENSITIVE_VALUE_PATTERNS: readonly RegExp[] = [
  // Bearer tokens
  /bearer\s+[a-zA-Z0-9._-]+/i,
  // JWT tokens (header.payload.signature)
  /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/,
  // API keys (common formats)
  /api[_-]?key[=:]\s*['"]?[a-zA-Z0-9_-]{20,}/i,
  // Secret patterns
  /secret[=:]\s*['"]?[a-zA-Z0-9_-]{10,}/i,
  // Password in URLs
  /password[=:][^&\s]+/i,
  // Basic auth in URLs
  /https?:\/\/[^:]+:[^@]+@/i,
];

// ---------------------------------------------------------------------------
// Masking Utilities
// ---------------------------------------------------------------------------

/**
 * Mask an email address.
 * Example: "john.doe@example.com" → "jo***@example.com"
 */
function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex === -1) return '***@***.***';

  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex);

  if (localPart.length <= 2) {
    return `${localPart[0] ?? '*'}***${domain}`;
  }

  const visibleChars = Math.min(2, Math.floor(localPart.length / 3));
  return `${localPart.slice(0, visibleChars)}***${domain}`;
}

/**
 * Mask a phone number.
 * Example: "081234567890" → "0812****7890"
 */
function maskPhone(phone: string): string {
  // Remove non-digit characters for processing
  const digits = phone.replace(/\D/g, '');

  if (digits.length < 8) {
    return '****' + digits.slice(-4);
  }

  const prefix = digits.slice(0, 4);
  const suffix = digits.slice(-4);
  return `${prefix}****${suffix}`;
}

/**
 * Mask an ID number.
 * Example: "1234567890123456" → "************3456"
 */
function maskId(id: string): string {
  if (id.length <= 4) {
    return '***' + id.slice(-1);
  }

  const masked = '*'.repeat(id.length - 4);
  return masked + id.slice(-4);
}

// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: SanitizationConfig = {
  deepSanitize: true,
  maxDepth: 10,
  maskPii: true,
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a LogSanitizer instance with optional custom configuration.
 *
 * @param config - Optional configuration to customize sanitization behavior
 * @returns A LogSanitizer instance
 *
 * @example
 * ```typescript
 * const sanitizer = createLogSanitizer();
 * const result = sanitizer.sanitize({ password: 'secret123', email: 'test@example.com' });
 * // result.sanitized = { password: '[REDACTED]', email: 'te***@example.com' }
 * ```
 */
export const createLogSanitizer = (config?: Partial<SanitizationConfig>): LogSanitizer => {
  const mergedConfig: SanitizationConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  // Merge custom sensitive keys if provided
  const sensitiveKeys = config?.additionalSensitiveKeys
    ? new Set([...SENSITIVE_KEYS, ...config.additionalSensitiveKeys])
    : SENSITIVE_KEYS;

  // Merge custom PII keys if provided
  const piiKeys = config?.additionalPiiKeys
    ? new Set([...PII_KEYS, ...config.additionalPiiKeys])
    : PII_KEYS;

  /**
   * Detect PII type from key name.
   */
  const detectPiiType = (key: string): 'email' | 'phone' | 'id' | null => {
    const lowerKey = key.toLowerCase();

    if (lowerKey.includes('email')) return 'email';
    if (
      lowerKey.includes('phone') ||
      lowerKey.includes('mobile') ||
      lowerKey.includes('cell') ||
      lowerKey.includes('telephone')
    ) {
      return 'phone';
    }
    if (
      lowerKey.includes('ssn') ||
      lowerKey.includes('national') ||
      lowerKey.includes('passport') ||
      lowerKey.includes('license') ||
      lowerKey.includes('ktp') ||
      lowerKey.includes('nik') ||
      lowerKey === 'id_number' ||
      lowerKey === 'idnumber'
    ) {
      return 'id';
    }

    return null;
  };

  /**
   * Recursively sanitize an object.
   */
  const sanitizeObject = (
    obj: Record<string, unknown>,
    depth: number,
    redactedKeys: string[],
    maskedKeys: string[],
    path: string = '',
  ): Record<string, unknown> => {
    if (depth > mergedConfig.maxDepth) {
      return { _truncated: '[MAX_DEPTH_EXCEEDED]' };
    }

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      const lowerKey = key.toLowerCase().replace(/[-_]/g, '');

      // Check if key is sensitive (complete redaction)
      if (sensitiveKeys.has(lowerKey) || sensitiveKeys.has(key.toLowerCase())) {
        result[key] = '[REDACTED]';
        redactedKeys.push(currentPath);
        continue;
      }

      // Check if key is PII (masking)
      if (piiKeys.has(lowerKey) || piiKeys.has(key.toLowerCase())) {
        if (mergedConfig.maskPii && typeof value === 'string') {
          const piiType = detectPiiType(key);
          if (piiType === 'email') {
            result[key] = maskEmail(value);
          } else if (piiType === 'phone') {
            result[key] = maskPhone(value);
          } else if (piiType === 'id') {
            result[key] = maskId(value);
          } else {
            result[key] = maskId(value); // Default to ID masking
          }
          maskedKeys.push(currentPath);
        } else {
          result[key] = '[PII_MASKED]';
          maskedKeys.push(currentPath);
        }
        continue;
      }

      // Handle nested objects
      if (mergedConfig.deepSanitize && value !== null && typeof value === 'object') {
        if (Array.isArray(value)) {
          result[key] = value.map((item, index) => {
            if (item !== null && typeof item === 'object') {
              return sanitizeObject(
                item as Record<string, unknown>,
                depth + 1,
                redactedKeys,
                maskedKeys,
                `${currentPath}[${index}]`,
              );
            }
            // Check string items in arrays for sensitive patterns
            if (typeof item === 'string' && containsSensitivePatternInternal(item)) {
              redactedKeys.push(`${currentPath}[${index}]`);
              return '[REDACTED]';
            }
            return item;
          });
        } else {
          result[key] = sanitizeObject(
            value as Record<string, unknown>,
            depth + 1,
            redactedKeys,
            maskedKeys,
            currentPath,
          );
        }
        continue;
      }

      // Check string values for embedded sensitive patterns
      if (typeof value === 'string' && containsSensitivePatternInternal(value)) {
        result[key] = '[REDACTED_PATTERN]';
        redactedKeys.push(currentPath);
        continue;
      }

      // Value is safe, keep as-is
      result[key] = value;
    }

    return result;
  };

  /**
   * Internal helper to check for sensitive patterns.
   */
  const containsSensitivePatternInternal = (value: string): boolean => {
    return SENSITIVE_VALUE_PATTERNS.some(pattern => pattern.test(value));
  };

  return {
    sanitize(payload: Record<string, unknown>): SanitizationResult {
      const redactedKeys: string[] = [];
      const maskedKeys: string[] = [];

      const sanitized = sanitizeObject(payload, 0, redactedKeys, maskedKeys);

      return {
        sanitized,
        hadSensitiveData: redactedKeys.length > 0 || maskedKeys.length > 0,
        redactedKeys: Object.freeze(redactedKeys),
        maskedKeys: Object.freeze(maskedKeys),
      };
    },

    sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
      return this.sanitize(payload).sanitized;
    },

    containsSensitivePattern(value: string): boolean {
      return containsSensitivePatternInternal(value);
    },

    maskPiiValue(value: string, type: 'email' | 'phone' | 'id'): string {
      switch (type) {
        case 'email':
          return maskEmail(value);
        case 'phone':
          return maskPhone(value);
        case 'id':
          return maskId(value);
        default:
          return maskId(value);
      }
    },

    getSensitiveKeysList(): readonly string[] {
      return Object.freeze(Array.from(sensitiveKeys).sort());
    },

    getPiiKeysList(): readonly string[] {
      return Object.freeze(Array.from(piiKeys).sort());
    },
  };
};

// ---------------------------------------------------------------------------
// Singleton Export for Convenience
// ---------------------------------------------------------------------------

/**
 * Default LogSanitizer instance with standard configuration.
 * Use `createLogSanitizer()` if custom configuration is needed.
 */
export const logSanitizer = createLogSanitizer();

// ---------------------------------------------------------------------------
// Documentation Constants (for audit purposes)
// ---------------------------------------------------------------------------

/**
 * Documentation of all sensitive fields that should NEVER be logged.
 * This is exported for audit and compliance documentation.
 */
export const SENSITIVE_FIELDS_DOCUMENTATION = {
  credentials: {
    description: 'Authentication credentials that grant access to systems',
    examples: ['password', 'accessToken', 'refreshToken', 'apiKey', 'secret', 'privateKey'],
    treatment: 'COMPLETE_REDACTION',
  },
  authenticationCodes: {
    description: 'One-time codes used for verification and multi-factor authentication',
    examples: ['otp', 'verificationCode', 'mfaCode', '2fa', 'pin', 'recoveryCode'],
    treatment: 'COMPLETE_REDACTION',
  },
  financialData: {
    description: 'Sensitive financial information that could enable fraud',
    examples: ['cvv', 'cardNumber', 'accountNumber', 'iban'],
    treatment: 'COMPLETE_REDACTION',
  },
  sessionData: {
    description: 'Session identifiers that could enable session hijacking',
    examples: ['cookie', 'sessionId', 'authorization'],
    treatment: 'COMPLETE_REDACTION',
  },
  pii: {
    description: 'Personally identifiable information requiring privacy protection',
    examples: ['email', 'phone', 'ssn', 'nationalId', 'passportNumber'],
    treatment: 'MASKED',
    maskingRules: {
      email: 'Show first 2 characters + *** + domain (e.g., jo***@example.com)',
      phone: 'Show first 4 and last 4 digits (e.g., 0812****7890)',
      id: 'Show only last 4 characters (e.g., ************3456)',
    },
  },
} as const;

/**
 * Export type for the documentation constant.
 */
export type SensitiveFieldsDocumentation = typeof SENSITIVE_FIELDS_DOCUMENTATION;
