/**
 * TuyaAlarmAdapter — Infrastructure implementation of AlarmProtocol backed by
 * the Tuya IoT Cloud (SmartLife) API.
 *
 * This adapter deliberately does NOT depend on IoTGatewayProtocol.sendCommand:
 * that method wraps a `params` object as the Tuya DP `value`, whereas a siren
 * switch DP expects a scalar (boolean) value. To keep the wire format correct
 * we talk to Tuya Cloud directly here, reusing the same OAuth 2.0 token +
 * HMAC-SHA256 signing scheme as TuyaGatewayAdapter and caching the token in
 * Redis via CacheProtocol.
 *
 * Provider-agnostic surface: callers only see AlarmProtocol. When the RT moves
 * to Home Assistant, add a HomeAssistantAlarmAdapter implementing the same
 * AlarmProtocol and swap the DI registration — no caller changes required.
 *
 * All configuration is read server-side from environment variables (secrets
 * never reach the client), following the getTuyaConfig() convention already
 * used by TuyaGatewayAdapter.
 */

import crypto from 'node:crypto';
import type { CacheProtocol } from '@core/protocols';
import type {
  AlarmProtocol,
  TriggerAlarmCommand,
  StopAlarmCommand,
  AlarmActionResult,
} from '@core/protocols';
import type { TenantRepository } from '@core/domains/tenant/repositories/TenantRepository';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import {
  alarmTriggerFailed,
  alarmNotConfigured,
} from '@core/domains/alarm/errors/alarmErrors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TuyaTokenResponse {
  readonly access_token: string;
  readonly expire_time: number;
}

interface TuyaApiResponse<T> {
  readonly success: boolean;
  readonly result?: T;
  readonly code?: number;
  readonly msg?: string;
  readonly t: number;
}

interface TuyaAlarmDeps {
  readonly cacheProtocol: CacheProtocol;
  readonly tenantRepository: TenantRepository;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOKEN_CACHE_KEY = 'tuya:access_token';
const TOKEN_SAFETY_MARGIN_SECONDS = 60;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;

// Most Tuya sirens/switches expose a boolean switch DP. Common codes are
// `switch`, `switch_1`, or `alarm_switch` — make it configurable.
const DEFAULT_SIREN_DP_CODE = 'switch';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function getTuyaAlarmConfig() {
  return {
    apiHost: process.env.TUYA_API_HOST ?? 'https://openapi.tuyaus.com',
    clientId: process.env.TUYA_CLIENT_ID ?? '',
    clientSecret: process.env.TUYA_CLIENT_SECRET ?? '',
    // Fallback device used only when a tenant has no sirenDeviceId configured.
    // The per-tenant device id (Tenant.sirenDeviceId) takes precedence.
    fallbackDeviceId: process.env.ALARM_DEVICE_ID ?? '',
    sirenDpCode: process.env.ALARM_SIREN_DP_CODE ?? DEFAULT_SIREN_DP_CODE,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Tuya signature: HMAC-SHA256(clientId + accessToken + timestamp) with secret. */
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

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const TuyaAlarmAdapter = ({
  cacheProtocol,
  tenantRepository,
}: TuyaAlarmDeps): AlarmProtocol => {
  const config = getTuyaAlarmConfig();

  /**
   * Resolve which physical device to command for a given tenant. Prefers the
   * tenant's own siren (Tenant.sirenDeviceId); falls back to the ALARM_DEVICE_ID
   * env var when the tenant has none. Returns null when neither is available.
   */
  async function resolveDeviceId(tenantId: string): Promise<string | null> {
    const result = await tenantRepository.findById(tenantId);
    const tenantDeviceId =
      result.success && result.data ? result.data.sirenDeviceId : null;
    const deviceId = (tenantDeviceId ?? config.fallbackDeviceId).trim();
    return deviceId.length > 0 ? deviceId : null;
  }

  async function getAccessToken(): Promise<DomainResult<string>> {
    const cached = await cacheProtocol.get<string>(TOKEN_CACHE_KEY);
    if (cached) {
      return ok(cached);
    }

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
        return fail(alarmTriggerFailed(data.msg ?? 'token request failed'));
      }

      const token = data.result.access_token;
      const ttl = Math.max(
        data.result.expire_time - TOKEN_SAFETY_MARGIN_SECONDS,
        60,
      );
      await cacheProtocol.set(TOKEN_CACHE_KEY, token, ttl);
      return ok(token);
    } catch (error) {
      return fail(alarmTriggerFailed(error));
    }
  }

  /** POST a single boolean DP command to the given siren device. */
  async function sendSwitchCommand(
    deviceId: string,
    on: boolean,
  ): Promise<DomainResult<AlarmActionResult>> {
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

    const startTime = Date.now();
    try {
      const response = await fetch(
        `${config.apiHost}/v1.0/iot-03/devices/${deviceId}/commands`,
        {
          method: 'POST',
          headers: {
            client_id: config.clientId,
            access_token: accessToken,
            sign,
            t: timestamp,
            sign_method: 'HMAC-SHA256',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            commands: [{ code: config.sirenDpCode, value: on }],
          }),
        },
      );

      const data = (await response.json()) as TuyaApiResponse<boolean>;
      const responseTimeMs = Date.now() - startTime;

      if (!data.success) {
        // Token expired — invalidate cache so the next attempt re-fetches.
        if (data.code === 1010) {
          await cacheProtocol.delete(TOKEN_CACHE_KEY);
        }
        return fail(alarmTriggerFailed(data.msg ?? `tuya code ${String(data.code)}`));
      }

      return ok({
        triggered: on,
        target: deviceId,
        responseTimeMs,
      });
    } catch (error) {
      return fail(alarmTriggerFailed(error));
    }
  }

  /** Retry wrapper with exponential backoff (1s, 2s, 4s). */
  async function sendWithRetry(
    deviceId: string,
    on: boolean,
  ): Promise<DomainResult<AlarmActionResult>> {
    let last: DomainResult<AlarmActionResult> | null = null;
    for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
      const result = await sendSwitchCommand(deviceId, on);
      if (result.success) {
        return result;
      }
      last = result;
      if (attempt < MAX_RETRY_ATTEMPTS - 1) {
        await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
      }
    }
    return last ?? fail(alarmTriggerFailed('unknown alarm error'));
  }

  /** Ensure Tuya credentials are present (device id is resolved per tenant). */
  function ensureCredentials(): DomainResult<true> {
    if (!config.clientId || !config.clientSecret) {
      return fail(
        alarmNotConfigured('TUYA_CLIENT_ID / TUYA_CLIENT_SECRET missing'),
      );
    }
    return ok(true);
  }

  /** Resolve the tenant's device id or fail with a clear, safe error. */
  async function resolveOrFail(
    tenantId: string,
  ): Promise<DomainResult<string>> {
    const deviceId = await resolveDeviceId(tenantId);
    if (!deviceId) {
      return fail(
        alarmNotConfigured(
          `no siren device configured for tenant ${tenantId} and no ALARM_DEVICE_ID fallback`,
        ),
      );
    }
    return ok(deviceId);
  }

  return {
    async triggerAlarm(
      command: TriggerAlarmCommand,
    ): Promise<DomainResult<AlarmActionResult>> {
      const credentials = ensureCredentials();
      if (!credentials.success) {
        return fail(credentials.error);
      }
      const device = await resolveOrFail(command.tenantId);
      if (!device.success) {
        return fail(device.error);
      }
      return sendWithRetry(device.data, true);
    },

    async stopAlarm(
      command: StopAlarmCommand,
    ): Promise<DomainResult<AlarmActionResult>> {
      const credentials = ensureCredentials();
      if (!credentials.success) {
        return fail(credentials.error);
      }
      const device = await resolveOrFail(command.tenantId);
      if (!device.success) {
        return fail(device.error);
      }
      return sendWithRetry(device.data, false);
    },
  };
};
