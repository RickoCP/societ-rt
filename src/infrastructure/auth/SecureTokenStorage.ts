/**
 * SecureTokenStorage — Infrastructure service for secure token storage patterns.
 *
 * Implements secure token storage best practices:
 * - Hash-only storage (never store plaintext tokens)
 * - Key rotation support for encryption keys
 * - Secure memory handling guidance
 * - Key versioning for rotation
 *
 * @see Task 40: Token Security Hardening
 * @see Design D2: SHA-256 hashed storage
 */

import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of hashing a token.
 */
export interface HashedTokenResult {
  /** The hash to store in the database */
  readonly hash: string;
  /** The hash algorithm used */
  readonly algorithm: string;
  /** Key version used (for encrypted hashes) */
  readonly keyVersion?: number;
}

/**
 * Configuration for a versioned encryption key.
 */
export interface EncryptionKeyConfig {
  /** Key version number (monotonically increasing) */
  readonly version: number;
  /** The key material (should be 256-bit / 32 bytes for AES-256) */
  readonly key: Buffer;
  /** Whether this key is active for new encryptions */
  readonly isActive: boolean;
  /** Key creation timestamp */
  readonly createdAt: Date;
  /** Key deprecation timestamp (null if not deprecated) */
  readonly deprecatedAt: Date | null;
}

/**
 * Result of encrypting data.
 */
export interface EncryptedDataResult {
  /** The encrypted data (base64 encoded) */
  readonly ciphertext: string;
  /** Initialization vector (base64 encoded) */
  readonly iv: string;
  /** Authentication tag (base64 encoded) for GCM mode */
  readonly authTag: string;
  /** Key version used for encryption */
  readonly keyVersion: number;
  /** Timestamp of encryption */
  readonly encryptedAt: Date;
}

/**
 * Combined encrypted payload for storage.
 */
export interface StoredEncryptedData {
  /** Version of the storage format */
  readonly formatVersion: number;
  /** Encrypted data with metadata */
  readonly data: EncryptedDataResult;
}

/**
 * Configuration for SecureTokenStorage.
 */
export interface SecureTokenStorageConfig {
  /** Hash algorithm for tokens (default: sha256) */
  readonly hashAlgorithm: 'sha256' | 'sha384' | 'sha512';
  /** Encryption algorithm (default: aes-256-gcm) */
  readonly encryptionAlgorithm: string;
  /** IV length in bytes (default: 12 for GCM) */
  readonly ivLength: number;
  /** Auth tag length in bytes (default: 16) */
  readonly authTagLength: number;
}

const DEFAULT_CONFIG: SecureTokenStorageConfig = {
  hashAlgorithm: 'sha256',
  encryptionAlgorithm: 'aes-256-gcm',
  ivLength: 12,
  authTagLength: 16,
};

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface SecureTokenStorage {
  /**
   * Hash a token for storage.
   * IMPORTANT: Always store only the hash, never the plaintext.
   * @param token - The plaintext token to hash
   * @returns The hash result to store
   */
  hashForStorage(token: string): HashedTokenResult;

  /**
   * Verify a token against a stored hash.
   * @param token - The plaintext token to verify
   * @param storedHash - The hash from storage
   * @returns True if the token matches the hash
   */
  verifyHash(token: string, storedHash: string): boolean;

  /**
   * Encrypt sensitive data with the active key.
   * Uses AES-256-GCM for authenticated encryption.
   * @param data - The data to encrypt
   * @returns Encrypted data with metadata
   */
  encrypt(data: string): EncryptedDataResult | null;

  /**
   * Decrypt data, supporting all key versions.
   * @param encrypted - The encrypted data with metadata
   * @returns Decrypted plaintext, or null if decryption fails
   */
  decrypt(encrypted: EncryptedDataResult): string | null;

  /**
   * Get the currently active key version.
   */
  getActiveKeyVersion(): number | null;

  /**
   * Add a new encryption key.
   * The new key becomes active by default.
   * @param key - 32-byte key material
   * @returns The new key version
   */
  addKey(key: Buffer): number;

  /**
   * Rotate to a new key.
   * Generates a new random key and makes it active.
   * @returns The new key version
   */
  rotateKey(): number;

  /**
   * Deprecate an old key version.
   * Deprecated keys can still decrypt but not encrypt.
   * @param version - Key version to deprecate
   */
  deprecateKey(version: number): boolean;

  /**
   * Re-encrypt data with the current active key.
   * Useful during key rotation to migrate old encrypted data.
   * @param encrypted - Data encrypted with an old key
   * @returns Data re-encrypted with the active key
   */
  reEncrypt(encrypted: EncryptedDataResult): EncryptedDataResult | null;

  /**
   * Securely clear sensitive data from a string.
   * Note: In JavaScript, true secure clearing is limited due to string immutability.
   * This provides best-effort clearing.
   */
  secureClear(data: string): void;

  /**
   * Generate a cryptographically secure HMAC for equality comparison.
   * Useful for indexed lookups (e.g., nik_hmac).
   * @param data - The data to HMAC
   * @returns HMAC string
   */
  hmacForLookup(data: string): string;
}

// ---------------------------------------------------------------------------
// Service Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function for SecureTokenStorage.
 * Follows DI pattern.
 */
export function SecureTokenStorageImpl(
  config: Partial<SecureTokenStorageConfig> = {},
): SecureTokenStorage {
  const finalConfig: SecureTokenStorageConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  // Key storage (in production, this should be backed by a secure key store)
  const keys = new Map<number, EncryptionKeyConfig>();
  let nextKeyVersion = 1;
  let activeKeyVersion: number | null = null;

  // HMAC key (should be separate from encryption keys)
  const hmacKey = crypto.randomBytes(32);

  // ---------------------------------------------------------------------------
  // Helper Functions
  // ---------------------------------------------------------------------------

  /**
   * Get key config by version.
   */
  function getKey(version: number): EncryptionKeyConfig | undefined {
    return keys.get(version);
  }

  /**
   * Get the active key config.
   */
  function getActiveKey(): EncryptionKeyConfig | undefined {
    if (activeKeyVersion === null) return undefined;
    return keys.get(activeKeyVersion);
  }

  // ---------------------------------------------------------------------------
  // Service Methods
  // ---------------------------------------------------------------------------

  function hashForStorage(token: string): HashedTokenResult {
    const hash = crypto
      .createHash(finalConfig.hashAlgorithm)
      .update(token)
      .digest('hex');

    return {
      hash,
      algorithm: finalConfig.hashAlgorithm,
    };
  }

  function verifyHash(token: string, storedHash: string): boolean {
    const computedHash = crypto
      .createHash(finalConfig.hashAlgorithm)
      .update(token)
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(computedHash, 'hex'),
        Buffer.from(storedHash, 'hex'),
      );
    } catch {
      // Different lengths or invalid hex
      return false;
    }
  }

  function encrypt(data: string): EncryptedDataResult | null {
    const key = getActiveKey();
    if (!key) {
      console.error('SecureTokenStorage: No active encryption key');
      return null;
    }

    try {
      // Generate random IV
      const iv = crypto.randomBytes(finalConfig.ivLength);

      // Create cipher
      const cipher = crypto.createCipheriv(
        finalConfig.encryptionAlgorithm as crypto.CipherGCMTypes,
        key.key,
        iv,
        { authTagLength: finalConfig.authTagLength },
      );

      // Encrypt
      const encrypted = Buffer.concat([
        cipher.update(data, 'utf8'),
        cipher.final(),
      ]);

      // Get auth tag
      const authTag = cipher.getAuthTag();

      return {
        ciphertext: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        keyVersion: key.version,
        encryptedAt: new Date(),
      };
    } catch (error) {
      console.error('SecureTokenStorage: Encryption failed', error);
      return null;
    }
  }

  function decrypt(encrypted: EncryptedDataResult): string | null {
    const key = getKey(encrypted.keyVersion);
    if (!key) {
      console.error(
        `SecureTokenStorage: Key version ${encrypted.keyVersion} not found`,
      );
      return null;
    }

    try {
      // Decode from base64
      const ciphertext = Buffer.from(encrypted.ciphertext, 'base64');
      const iv = Buffer.from(encrypted.iv, 'base64');
      const authTag = Buffer.from(encrypted.authTag, 'base64');

      // Create decipher
      const decipher = crypto.createDecipheriv(
        finalConfig.encryptionAlgorithm as crypto.CipherGCMTypes,
        key.key,
        iv,
        { authTagLength: finalConfig.authTagLength },
      );

      // Set auth tag
      decipher.setAuthTag(authTag);

      // Decrypt
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch (error) {
      console.error('SecureTokenStorage: Decryption failed', error);
      return null;
    }
  }

  function getActiveKeyVersion(): number | null {
    return activeKeyVersion;
  }

  function addKey(key: Buffer): number {
    if (key.length !== 32) {
      throw new Error('Encryption key must be 32 bytes (256 bits)');
    }

    const version = nextKeyVersion++;
    
    // Mark previous active key as non-active (but not deprecated)
    if (activeKeyVersion !== null) {
      const prevKey = keys.get(activeKeyVersion);
      if (prevKey) {
        keys.set(activeKeyVersion, { ...prevKey, isActive: false });
      }
    }

    keys.set(version, {
      version,
      key,
      isActive: true,
      createdAt: new Date(),
      deprecatedAt: null,
    });

    activeKeyVersion = version;
    return version;
  }

  function rotateKey(): number {
    const newKey = crypto.randomBytes(32);
    return addKey(newKey);
  }

  function deprecateKey(version: number): boolean {
    const key = keys.get(version);
    if (!key) {
      return false;
    }

    keys.set(version, {
      ...key,
      isActive: false,
      deprecatedAt: new Date(),
    });

    // If this was the active key, there's no active key now
    if (activeKeyVersion === version) {
      activeKeyVersion = null;
    }

    return true;
  }

  function reEncrypt(encrypted: EncryptedDataResult): EncryptedDataResult | null {
    // Decrypt with old key
    const plaintext = decrypt(encrypted);
    if (plaintext === null) {
      return null;
    }

    // Encrypt with new active key
    return encrypt(plaintext);
  }

  function secureClear(_data: string): void {
    // Note: In JavaScript, strings are immutable and we cannot truly
    // overwrite them in memory. This function exists to:
    // 1. Document the intent for secure clearing
    // 2. Allow for future improvements if V8 provides such capability
    // 3. In production, consider using Buffer for sensitive data which
    //    can be explicitly zeroed: buffer.fill(0)
    //
    // For sensitive operations, prefer using Buffer instead of strings
    // and call buffer.fill(0) when done.
    
    // Best effort: set to empty string to allow GC
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _data = '';
  }

  function hmacForLookup(data: string): string {
    return crypto
      .createHmac(finalConfig.hashAlgorithm, hmacKey)
      .update(data)
      .digest('hex');
  }

  return {
    hashForStorage,
    verifyHash,
    encrypt,
    decrypt,
    getActiveKeyVersion,
    addKey,
    rotateKey,
    deprecateKey,
    reEncrypt,
    secureClear,
    hmacForLookup,
  };
}
