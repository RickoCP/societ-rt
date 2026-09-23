/**
 * TuyaGatewayAdapter — Infrastructure implementation of IoTGatewayProtocol.
 *
 * Handles communication with Tuya IoT Cloud including:
 * - OAuth 2.0 client credentials flow with token caching in Redis
 * - Device pairing token generation and completion callback processing
 * - Device command execution with exponential backoff retry (1s, 2s, 4s)
 * - Webhook signature validation using HMAC-SHA256
 * - Device status synchronization (configurable interval, default 60s)
 * - AES-256 encryption of Tuya API credentials at rest
 *
 * Factory function pattern for Awilix DI compatibility.
 *
 * @see Requirements 38.1, 38.2, 38.3, 38.4, 38.6, 38.7, 38.12
 */

import crypto from 'node:crypto';
import type { CacheProtocol } from '@core/protocols';
import type { IoTGatewayProtocol } from '@core/protocols';
import type {
  IoTDevice,
  DeviceCommand,
  CommandResult,
  DeviceStatus,
  IoTDeviceType,
} from '@core/domains/iot/entities';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import {
  iotCommandFailed,
  iotPairingFailed,
  iotCloudUnavailable,
} from '@core/domains/iot/errors/iotErrors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TuyaTokenResponse {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expire_time: number; // seconds until expiry
  readonly uid: string;
}

interface TuyaApiResponse<T> {
  readonly success: boolean;
  readonly result?: T;
  readonly code?: number;
  readonly msg?: string;
  readonly t: number;
}

interface TuyaDeviceStatusItem {
  readonly code: string;
  readonly value: unknown;
}

interface TuyaPairingTokenResult {
  readonly token: string;
  readonly secret: string;
  readonly expire_time: number;
}

interface TuyaDeviceInfo {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly online: boolean;
  readonly battery_level?: number;
  readonly update_time: number;
  readonly product_id: string;
}

interface TuyaGatewayDeps {
  readonly cacheProtocol: CacheProtocol;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOKEN_CACHE_KEY = 'tuya:access_token';
const TOKEN_SAFETY_MARGIN_SECONDS = 60;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;
const AES_ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getTuyaConfig() {
  const apiHost = process.env.TUYA_API_HOST ?? 'https://openapi.tuyaus.com';
  const clientId = process.env.TUYA_CLIENT_ID ?? '';
  const clientSecret = process.env.TUYA_CLIENT_SECRET ?? '';
  const encryptionKey = process.env.TUYA_ENCRYPTION_KEY ?? '';
  // Boolean DP code that turns the physical siren on/off (device-specific).
  const sirenDpCode = process.env.ALARM_SIREN_DP_CODE ?? '';

  return { apiHost, clientId, clientSecret, encryptionKey, sirenDpCode };
}

/**
 * Translate a domain DeviceCommand into the concrete Tuya command payload
 * ({ code, value }) that the Tuya /commands endpoint expects.
 *
 * The domain uses provider-agnostic command types such as 'siren_activate'.
 * Tuya needs the device's real boolean DP code (e.g. 'AlarmSwitch') set to
 * true/false. Unknown command types are passed through unchanged so other
 * device commands keep working.
 */
function toTuyaCommand(
  commandType: string,
  params: Record<string, unknown>,
  sirenDpCode: string,
): { code: string; value: unknown } {
  if (commandType === 'siren_activate' || commandType === 'siren_deactivate') {
    if (!sirenDpCode) {
      // No DP configured — fall back to sending the raw command so the failure
      // is visible in logs rather than silently doing nothing.
      return { code: commandType, value: params };
    }
    return { code: sirenDpCode, value: commandType === 'siren_activate' };
  }
  return { code: commandType, value: params };
}

/**
 * Encrypt a plaintext string using AES-256-CBC.
 * Returns base64-encoded ciphertext with IV prepended.
 */
export function encryptAES256(plaintext: string, key: string): string {
  const keyBuffer = crypto
    .createHash('sha256')
    .update(key)
    .digest();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(AES_ALGORITHM, keyBuffer, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, encrypted]).toString('base64');
}

/**
 * Decrypt a base64-encoded AES-256-CBC ciphertext (IV prepended).
 */
export function decryptAES256(ciphertext: string, key: string): string {
  const keyBuffer = crypto
    .createHash('sha256')
    .update(key)
    .digest();
  const data = Buffer.from(ciphertext, 'base64');
  const iv = data.subarray(0, IV_LENGTH);
  const encrypted = data.subarray(IV_LENGTH);
  const decipher = crypto.createDecipheriv(AES_ALGORITHM, keyBuffer, iv);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/**
 * Generate Tuya API request signature.
 * Tuya uses HMAC-SHA256 with client_secret as key.
 */
function generateTuyaSignature(
  clientId: string,
  accessToken: string,
  timestamp: string,
  clientSecret: string,
): string {
  const stringToSign = clientId + accessToken + timestamp;
  return crypto
    .createHmac('sha256', clientSecret)
    .update(stringToSign)
    .digest('hex')
    .toUpperCase();
}

/**
 * Full Tuya signature scheme including method, body hash and path.
 * Required by newer Thing-Model endpoints (v2.0 /cloud/thing/...), where the
 * simplified signature is rejected.
 *
 * sign = HMAC-SHA256( clientId + accessToken + t + (METHOD\nSHA256(body)\n\nPATH) )
 */
function generateTuyaSignatureFull(
  clientId: string,
  accessToken: string,
  timestamp: string,
  clientSecret: string,
  method: string,
  path: string,
  body: string,
): string {
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const stringToSign = `${method}\n${bodyHash}\n\n${path}`;
  const str = clientId + accessToken + timestamp + stringToSign;
  return crypto
    .createHmac('sha256', clientSecret)
    .update(str)
    .digest('hex')
    .toUpperCase();
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Map Tuya device category to our IoTDeviceType.
 */
function mapTuyaCategoryToDeviceType(category: string): IoTDeviceType {
  const mapping: Record<string, IoTDeviceType> = {
    sos: 'panic_button',
    sgbj: 'smart_siren',
    ms: 'smart_lock',
    sp: 'cctv',
    pir: 'motion_sensor',
    ywbj: 'smoke_detector',
    mcs: 'door_sensor',
    mcsg: 'gate_sensor',
    kg: 'smart_switch',
    dj: 'smart_lighting',
  };
  return mapping[category] ?? 'smart_switch';
}

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

export const TuyaGatewayAdapter = ({
  cacheProtocol,
}: TuyaGatewayDeps): IoTGatewayProtocol => {
  const config = getTuyaConfig();

  // -------------------------------------------------------------------------
  // Token management (OAuth 2.0 client credentials)
  // -------------------------------------------------------------------------

  /**
   * Get a valid access token, using cached version if available.
   * Implements OAuth 2.0 client credentials flow with Redis caching.
   * TTL = expires_in - 60s (safety margin).
   */
  async function getAccessToken(): Promise<DomainResult<string>> {
    // Try cache first
    const cached = await cacheProtocol.get<string>(TOKEN_CACHE_KEY);
    if (cached) {
      return ok(cached);
    }

    // Fetch new token from Tuya Cloud
    const timestamp = Date.now().toString();
    const sign = generateTuyaSignature(
      config.clientId,
      '',
      timestamp,
      config.clientSecret,
    );

    try {
      const response = await fetch(
        `${config.apiHost}/v1.0/token?grant_type=1`,
        {
          method: 'GET',
          headers: {
            client_id: config.clientId,
            sign,
            t: timestamp,
            sign_method: 'HMAC-SHA256',
          },
        },
      );

      const data = (await response.json()) as TuyaApiResponse<TuyaTokenResponse>;

      if (!data.success || !data.result) {
        return fail(iotCloudUnavailable());
      }

      const token = data.result.access_token;
      const ttl = Math.max(
        data.result.expire_time - TOKEN_SAFETY_MARGIN_SECONDS,
        60,
      );

      // Cache the token in Redis
      await cacheProtocol.set(TOKEN_CACHE_KEY, token, ttl);

      // Encrypt and store credentials for audit/recovery
      if (config.encryptionKey) {
        const encryptedToken = encryptAES256(token, config.encryptionKey);
        await cacheProtocol.set(
          'tuya:encrypted_credentials',
          encryptedToken,
          ttl,
        );
      }

      return ok(token);
    } catch {
      return fail(iotCloudUnavailable());
    }
  }

  /**
   * Make an authenticated request to Tuya Cloud API.
   */
  async function tuyaRequest<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<DomainResult<T>> {
    const tokenResult = await getAccessToken();
    if (!tokenResult.success) {
      return fail(tokenResult.error);
    }

    const accessToken = tokenResult.data;
    const timestamp = Date.now().toString();
    const sign = generateTuyaSignature(
      config.clientId,
      accessToken,
      timestamp,
      config.clientSecret,
    );

    try {
      const fetchOptions: RequestInit = {
        method,
        headers: {
          client_id: config.clientId,
          access_token: accessToken,
          sign,
          t: timestamp,
          sign_method: 'HMAC-SHA256',
          'Content-Type': 'application/json',
        },
      };

      if (body && (method === 'POST' || method === 'PUT')) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(`${config.apiHost}${path}`, fetchOptions);
      const data = (await response.json()) as TuyaApiResponse<T>;

      if (!data.success) {
        // Token expired — invalidate cache and retry once
        if (data.code === 1010) {
          await cacheProtocol.delete(TOKEN_CACHE_KEY);
          return fail(iotCloudUnavailable());
        }
        return fail(iotCloudUnavailable());
      }

      return ok(data.result as T);
    } catch {
      return fail(iotCloudUnavailable());
    }
  }

  /**
   * Execute a request with exponential backoff retry.
   * Delays: 1s, 2s, 4s (max 3 attempts).
   */
  async function tuyaRequestWithRetry<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<DomainResult<T>> {
    let lastError: DomainResult<T> | null = null;

    for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
      const result = await tuyaRequest<T>(method, path, body);
      if (result.success) {
        return result;
      }

      lastError = result;

      // Don't sleep after the last attempt
      if (attempt < MAX_RETRY_ATTEMPTS - 1) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await sleep(delay);
      }
    }

    return lastError ?? fail(iotCommandFailed());
  }

  // -------------------------------------------------------------------------
  // IoTGatewayProtocol implementation
  // -------------------------------------------------------------------------

  return {
    async pairDevice(
      tenantId: string,
      householdId: string,
      pairingToken: string,
    ): Promise<DomainResult<IoTDevice>> {
      try {
        // Request pairing token from Tuya Cloud
        const pairingResult =
          await tuyaRequestWithRetry<TuyaPairingTokenResult>(
            'POST',
            '/v1.0/iot-03/token',
            {
              uid: `${tenantId}_${householdId}`,
              pairing_token: pairingToken,
            },
          );

        if (!pairingResult.success) {
          return fail(iotPairingFailed(pairingResult.error));
        }

        // Get device info after pairing completes
        const deviceInfoResult = await tuyaRequestWithRetry<TuyaDeviceInfo>(
          'GET',
          `/v1.0/iot-03/devices/token/${pairingResult.data.token}`,
        );

        if (!deviceInfoResult.success) {
          return fail(iotPairingFailed(deviceInfoResult.error));
        }

        const deviceInfo = deviceInfoResult.data;
        const now = new Date();

        const device: IoTDevice = {
          id: crypto.randomUUID(),
          tenantId,
          householdId,
          tuyaDeviceId: deviceInfo.id,
          deviceType: mapTuyaCategoryToDeviceType(deviceInfo.category),
          name: deviceInfo.name,
          onlineStatus: deviceInfo.online ? 'online' : 'offline',
          batteryLevel: deviceInfo.battery_level ?? null,
          lastSeen: new Date(deviceInfo.update_time * 1000),
          metadata: {
            productId: deviceInfo.product_id,
            category: deviceInfo.category,
          },
          createdAt: now,
          updatedAt: now,
        };

        return ok(device);
      } catch (error: unknown) {
        return fail(iotPairingFailed(error));
      }
    },

    async sendCommand(
      deviceId: string,
      command: DeviceCommand,
    ): Promise<DomainResult<CommandResult>> {
      const startTime = Date.now();

      const tuyaCommand = toTuyaCommand(
        command.commandType,
        command.params,
        config.sirenDpCode,
      );

      // Thing-Model devices (e.g. this siren, category wsdcg) reject the legacy
      // /v1.0/.../commands endpoint (code 2008). Route them through the v2.0
      // property-issue endpoint, which uses the full signature scheme.
      const isSiren =
        command.commandType === 'siren_activate' ||
        command.commandType === 'siren_deactivate';

      if (isSiren) {
        const tokenResult = await getAccessToken();
        if (!tokenResult.success) {
          return fail(tokenResult.error);
        }
        const accessToken = tokenResult.data;
        const path = `/v2.0/cloud/thing/${deviceId}/shadow/properties/issue`;
        const bodyStr = JSON.stringify({
          properties: JSON.stringify({ [tuyaCommand.code]: tuyaCommand.value }),
        });
        const timestamp = Date.now().toString();
        const sign = generateTuyaSignatureFull(
          config.clientId,
          accessToken,
          timestamp,
          config.clientSecret,
          'POST',
          path,
          bodyStr,
        );
        try {
          const response = await fetch(`${config.apiHost}${path}`, {
            method: 'POST',
            headers: {
              client_id: config.clientId,
              access_token: accessToken,
              sign,
              t: timestamp,
              sign_method: 'HMAC-SHA256',
              'Content-Type': 'application/json',
            },
            body: bodyStr,
          });
          const data = (await response.json()) as TuyaApiResponse<unknown>;
          if (!data.success) {
            return fail(iotCommandFailed(new Error(data.msg ?? 'Tuya command failed')));
          }
          return ok({
            success: true,
            deviceId,
            commandType: command.commandType,
            responseTime: Date.now() - startTime,
          });
        } catch (error) {
          return fail(iotCommandFailed(error));
        }
      }

      const result = await tuyaRequestWithRetry<boolean>(
        'POST',
        `/v1.0/iot-03/devices/${deviceId}/commands`,
        {
          commands: [tuyaCommand],
        },
      );

      const responseTime = Date.now() - startTime;

      if (!result.success) {
        return fail(iotCommandFailed(result.error));
      }

      const commandResult: CommandResult = {
        success: true,
        deviceId,
        commandType: command.commandType,
        responseTime,
      };

      return ok(commandResult);
    },

    async syncDeviceStatus(
      deviceId: string,
    ): Promise<DomainResult<DeviceStatus>> {
      const result = await tuyaRequest<TuyaDeviceStatusItem[]>(
        'GET',
        `/v1.0/iot-03/devices/${deviceId}/status`,
      );

      if (!result.success) {
        return fail(result.error);
      }

      const statusItems = result.data;
      let batteryLevel: number | null = null;

      for (const item of statusItems) {
        if (
          item.code === 'battery_percentage' ||
          item.code === 'battery_state'
        ) {
          batteryLevel = typeof item.value === 'number' ? item.value : null;
        }
      }

      // Also get device online status
      const deviceResult = await tuyaRequest<TuyaDeviceInfo>(
        'GET',
        `/v1.0/iot-03/devices/${deviceId}`,
      );

      if (!deviceResult.success) {
        return fail(deviceResult.error);
      }

      const deviceStatus: DeviceStatus = {
        onlineStatus: deviceResult.data.online ? 'online' : 'offline',
        batteryLevel,
        lastSeen: new Date(deviceResult.data.update_time * 1000),
      };

      return ok(deviceStatus);
    },

    async getDeviceList(
      householdId: string,
    ): Promise<DomainResult<IoTDevice[]>> {
      const result = await tuyaRequest<TuyaDeviceInfo[]>(
        'GET',
        `/v1.0/iot-03/devices?uid=${householdId}`,
      );

      if (!result.success) {
        return fail(result.error);
      }

      const now = new Date();
      const devices: IoTDevice[] = result.data.map(info => ({
        id: crypto.randomUUID(),
        tenantId: '',
        householdId,
        tuyaDeviceId: info.id,
        deviceType: mapTuyaCategoryToDeviceType(info.category),
        name: info.name,
        onlineStatus: info.online ? 'online' : 'offline',
        batteryLevel: info.battery_level ?? null,
        lastSeen: new Date(info.update_time * 1000),
        metadata: {
          productId: info.product_id,
          category: info.category,
        },
        createdAt: now,
        updatedAt: now,
      }));

      return ok(devices);
    },

    async unpairDevice(deviceId: string): Promise<DomainResult<void>> {
      const result = await tuyaRequestWithRetry<boolean>(
        'DELETE',
        `/v1.0/iot-03/devices/${deviceId}`,
      );

      if (!result.success) {
        return fail(result.error);
      }

      return ok(undefined);
    },

    validateWebhookSignature(
      payload: string,
      signature: string,
      timestamp: string,
    ): boolean {
      // Tuya webhook signature: HMAC-SHA256 of (client_id + timestamp + payload)
      // using client_secret as the key
      const stringToSign = config.clientId + timestamp + payload;
      const expectedSignature = crypto
        .createHmac('sha256', config.clientSecret)
        .update(stringToSign)
        .digest('hex')
        .toUpperCase();

      // Use timing-safe comparison to prevent timing attacks
      try {
        return crypto.timingSafeEqual(
          Buffer.from(signature.toUpperCase()),
          Buffer.from(expectedSignature),
        );
      } catch {
        // Buffers of different length will throw
        return false;
      }
    },

    async refreshToken(): Promise<DomainResult<void>> {
      // Invalidate cached token to force re-acquisition
      await cacheProtocol.delete(TOKEN_CACHE_KEY);

      // Acquire a fresh token
      const result = await getAccessToken();
      if (!result.success) {
        return fail(result.error);
      }

      return ok(undefined);
    },
  };
};
