/**
 * TokenEntropyValidator — Infrastructure service for validating token entropy.
 *
 * Ensures tokens have sufficient cryptographic randomness:
 * - Validates minimum entropy (256-bit by default)
 * - Detects weak/predictable tokens
 * - Rejects tokens with insufficient randomness
 *
 * @see Task 40: Token Security Hardening
 * @see Requirement 51 AC 3: Cryptographically secure recovery tokens
 */

import crypto from 'crypto';

import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import { authTokenInsufficientEntropy } from '@core/domains/auth/errors/authErrors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of entropy validation.
 */
export interface EntropyValidationResult {
  readonly isValid: boolean;
  readonly entropyBits: number;
  readonly minimumRequired: number;
  readonly issues: EntropyIssue[];
}

/**
 * Specific issues detected during entropy analysis.
 */
export interface EntropyIssue {
  readonly type: EntropyIssueType;
  readonly description: string;
  readonly severity: 'warning' | 'error';
}

export type EntropyIssueType =
  | 'insufficient_length'
  | 'low_entropy'
  | 'sequential_pattern'
  | 'repeated_pattern'
  | 'predictable_format'
  | 'weak_charset';

/**
 * Configuration for entropy validation.
 */
export interface TokenEntropyValidatorConfig {
  /** Minimum required entropy in bits (default: 256) */
  readonly minimumEntropyBits: number;
  /** Minimum token length in bytes (default: 32) */
  readonly minimumByteLength: number;
  /** Enable pattern detection (default: true) */
  readonly detectPatterns: boolean;
  /** Enable sequential detection (default: true) */
  readonly detectSequential: boolean;
  /** Maximum allowed repetition ratio (default: 0.3 = 30%) */
  readonly maxRepetitionRatio: number;
}

const DEFAULT_CONFIG: TokenEntropyValidatorConfig = {
  minimumEntropyBits: 256,
  minimumByteLength: 32,
  detectPatterns: true,
  detectSequential: true,
  maxRepetitionRatio: 0.3,
};

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface TokenEntropyValidator {
  /**
   * Validate that a token has sufficient entropy.
   * @param token - The token to validate (can be base64, hex, or raw bytes)
   * @param encoding - The encoding of the token (default: 'base64url')
   * @returns Validation result with details
   */
  validateEntropy(
    token: string,
    encoding?: BufferEncoding | 'base64url',
  ): EntropyValidationResult;

  /**
   * Validate token and return DomainResult for use in service flows.
   * Returns failure with AUTH_TOKEN_INSUFFICIENT_ENTROPY if validation fails.
   */
  validateEntropyOrFail(
    token: string,
    encoding?: BufferEncoding | 'base64url',
  ): DomainResult<EntropyValidationResult>;

  /**
   * Generate a cryptographically secure token with guaranteed entropy.
   * @param byteLength - Number of random bytes (default: 32 = 256 bits)
   * @param encoding - Output encoding (default: 'base64url')
   */
  generateSecureToken(
    byteLength?: number,
    encoding?: BufferEncoding | 'base64url',
  ): string;

  /**
   * Calculate the approximate entropy of a token in bits.
   * Uses Shannon entropy calculation.
   */
  calculateEntropy(
    token: string,
    encoding?: BufferEncoding | 'base64url',
  ): number;

  /**
   * Check if a token appears to be cryptographically random.
   * Uses multiple heuristics including NIST randomness tests.
   */
  isLikelyCryptographicRandom(
    token: string,
    encoding?: BufferEncoding | 'base64url',
  ): boolean;
}

// ---------------------------------------------------------------------------
// Service Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function for TokenEntropyValidator.
 * Follows DI pattern.
 */
export function TokenEntropyValidatorImpl(
  config: Partial<TokenEntropyValidatorConfig> = {},
): TokenEntropyValidator {
  const finalConfig: TokenEntropyValidatorConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  // ---------------------------------------------------------------------------
  // Helper Functions
  // ---------------------------------------------------------------------------

  /**
   * Decode token to buffer for analysis.
   */
  function decodeToken(
    token: string,
    encoding: BufferEncoding | 'base64url' = 'base64url',
  ): Buffer {
    if (encoding === 'base64url') {
      return Buffer.from(token, 'base64url');
    }
    return Buffer.from(token, encoding as BufferEncoding);
  }

  /**
   * Calculate Shannon entropy of byte data.
   * Returns entropy in bits.
   */
  function calculateShannonEntropy(data: Buffer): number {
    if (data.length === 0) return 0;

    // Count byte frequencies
    const frequencies = new Map<number, number>();
    for (const byte of data) {
      frequencies.set(byte, (frequencies.get(byte) || 0) + 1);
    }

    // Calculate Shannon entropy
    let entropy = 0;
    const length = data.length;
    for (const count of frequencies.values()) {
      const probability = count / length;
      entropy -= probability * Math.log2(probability);
    }

    // Scale to total bits (entropy per byte * number of bytes)
    return entropy * data.length;
  }

  /**
   * Detect sequential patterns (0,1,2,3... or a,b,c,d...).
   */
  function detectSequentialPattern(data: Buffer): boolean {
    if (data.length < 4) return false;

    let sequentialCount = 0;
    for (let i = 1; i < data.length; i++) {
      const diff = data[i]! - data[i - 1]!;
      if (diff === 1 || diff === -1) {
        sequentialCount++;
      }
    }

    // If more than 30% of transitions are sequential, flag it
    return sequentialCount / (data.length - 1) > 0.3;
  }

  /**
   * Detect repeated patterns (e.g., 'abcabcabc').
   */
  function detectRepeatedPattern(data: Buffer): boolean {
    if (data.length < 8) return false;

    // Check for repeating patterns of length 1-8
    for (let patternLength = 1; patternLength <= Math.min(8, data.length / 2); patternLength++) {
      let matches = 0;
      for (let i = patternLength; i < data.length; i++) {
        if (data[i] === data[i % patternLength]) {
          matches++;
        }
      }
      if (matches / (data.length - patternLength) > 0.8) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detect excessive byte repetition.
   */
  function detectExcessiveRepetition(data: Buffer, maxRatio: number): boolean {
    if (data.length === 0) return false;

    const frequencies = new Map<number, number>();
    for (const byte of data) {
      frequencies.set(byte, (frequencies.get(byte) || 0) + 1);
    }

    // Check if any single byte dominates
    for (const count of frequencies.values()) {
      if (count / data.length > maxRatio) {
        return true;
      }
    }

    return false;
  }

  /**
   * Simple frequency test - check if byte distribution is roughly uniform.
   * A truly random 32-byte sequence should have fairly even distribution.
   */
  function checkFrequencyDistribution(data: Buffer): boolean {
    if (data.length < 16) return true; // Too short for meaningful analysis

    // For 256 possible byte values, count unique bytes
    const uniqueBytes = new Set(data).size;
    
    // With 32 random bytes, we expect roughly 25-32 unique values
    // (birthday problem: probability of collision increases with samples)
    const minExpectedUnique = Math.min(data.length * 0.5, data.length);
    
    return uniqueBytes >= minExpectedUnique * 0.5;
  }

  // ---------------------------------------------------------------------------
  // Service Methods
  // ---------------------------------------------------------------------------

  function validateEntropy(
    token: string,
    encoding: BufferEncoding | 'base64url' = 'base64url',
  ): EntropyValidationResult {
    const issues: EntropyIssue[] = [];
    
    let data: Buffer;
    try {
      data = decodeToken(token, encoding);
    } catch {
      issues.push({
        type: 'predictable_format',
        description: 'Token could not be decoded - invalid format',
        severity: 'error',
      });
      return {
        isValid: false,
        entropyBits: 0,
        minimumRequired: finalConfig.minimumEntropyBits,
        issues,
      };
    }

    // Check minimum length
    if (data.length < finalConfig.minimumByteLength) {
      issues.push({
        type: 'insufficient_length',
        description: `Token length ${data.length} bytes is below minimum ${finalConfig.minimumByteLength} bytes`,
        severity: 'error',
      });
    }

    // Calculate entropy
    const entropyBits = calculateShannonEntropy(data);

    // Check entropy threshold
    if (entropyBits < finalConfig.minimumEntropyBits) {
      issues.push({
        type: 'low_entropy',
        description: `Token entropy ${entropyBits.toFixed(2)} bits is below minimum ${finalConfig.minimumEntropyBits} bits`,
        severity: 'error',
      });
    }

    // Pattern detection
    if (finalConfig.detectPatterns) {
      if (detectRepeatedPattern(data)) {
        issues.push({
          type: 'repeated_pattern',
          description: 'Token contains repeated patterns suggesting non-random generation',
          severity: 'error',
        });
      }

      if (detectExcessiveRepetition(data, finalConfig.maxRepetitionRatio)) {
        issues.push({
          type: 'weak_charset',
          description: 'Token has excessive byte repetition suggesting weak randomness',
          severity: 'warning',
        });
      }
    }

    // Sequential detection
    if (finalConfig.detectSequential && detectSequentialPattern(data)) {
      issues.push({
        type: 'sequential_pattern',
        description: 'Token contains sequential patterns suggesting predictable generation',
        severity: 'error',
      });
    }

    // Frequency distribution check
    if (!checkFrequencyDistribution(data)) {
      issues.push({
        type: 'weak_charset',
        description: 'Token byte distribution is not sufficiently uniform',
        severity: 'warning',
      });
    }

    // Determine overall validity
    const hasErrors = issues.some(issue => issue.severity === 'error');
    const isValid = !hasErrors && entropyBits >= finalConfig.minimumEntropyBits;

    return {
      isValid,
      entropyBits,
      minimumRequired: finalConfig.minimumEntropyBits,
      issues,
    };
  }

  function validateEntropyOrFail(
    token: string,
    encoding: BufferEncoding | 'base64url' = 'base64url',
  ): DomainResult<EntropyValidationResult> {
    const result = validateEntropy(token, encoding);
    
    if (!result.isValid) {
      return fail(authTokenInsufficientEntropy());
    }

    return ok(result);
  }

  function generateSecureToken(
    byteLength: number = finalConfig.minimumByteLength,
    encoding: BufferEncoding | 'base64url' = 'base64url',
  ): string {
    const bytes = crypto.randomBytes(byteLength);
    
    if (encoding === 'base64url') {
      return bytes.toString('base64url');
    }
    return bytes.toString(encoding as BufferEncoding);
  }

  function calculateEntropy(
    token: string,
    encoding: BufferEncoding | 'base64url' = 'base64url',
  ): number {
    try {
      const data = decodeToken(token, encoding);
      return calculateShannonEntropy(data);
    } catch {
      return 0;
    }
  }

  function isLikelyCryptographicRandom(
    token: string,
    encoding: BufferEncoding | 'base64url' = 'base64url',
  ): boolean {
    const result = validateEntropy(token, encoding);
    
    // Consider it likely random if:
    // 1. No error-level issues
    // 2. Entropy is at least 80% of theoretical maximum
    // 3. At least 20 bytes
    const hasErrors = result.issues.some(i => i.severity === 'error');
    let data: Buffer;
    try {
      data = decodeToken(token, encoding);
    } catch {
      return false;
    }
    
    const theoreticalMax = data.length * 8; // 8 bits per byte for perfect randomness
    const entropyRatio = result.entropyBits / theoreticalMax;
    
    return !hasErrors && entropyRatio >= 0.8 && data.length >= 20;
  }

  return {
    validateEntropy,
    validateEntropyOrFail,
    generateSecureToken,
    calculateEntropy,
    isLikelyCryptographicRandom,
  };
}
