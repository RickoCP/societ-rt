/**
 * SendDeviceCommandUseCase — Sends a command to an IoT device.
 *
 * Logic:
 * 1. Check rate limit (max 30 commands per minute per device)
 * 2. Execute command via circuit breaker → IoT Gateway
 * 3. Enqueue audit log (fire-and-forget)
 * 4. Return ok(commandResult)
 *
 * Note: Device ownership validation (Home_Owner check) is enforced at the
 * route handler level before invoking this use case. The use case trusts
 * that the caller has already verified ownership.
 *
 * @see Requirements 37.4, 37.6, 38.6, 38.7, 38.10, 38.13, 38.14, 41.4, 41.5, 41.8
 */

import type {
  AuthContext,
  AuditQueueProtocol,
  CacheProtocol,
  IoTGatewayProtocol,
  CircuitBreakerProtocol,
} from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type { CommandResult, DeviceCommand } from '../entities';
import {
  iotRateLimitExceeded,
  iotCloudUnavailable,
  iotCommandFailed,
} from '../errors/iotErrors';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface SendDeviceCommandInput {
  readonly deviceId: string;
  readonly commandType: string;
  readonly params: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface SendDeviceCommandUseCase {
  execute(params: {
    authContext: AuthContext;
    data: SendDeviceCommandInput;
  }): Promise<DomainResult<CommandResult>>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX_COMMANDS = 30;
const RATE_LIMIT_WINDOW_SECONDS = 60;

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const SendDeviceCommandUseCaseImpl = ({
  iotGatewayProtocol,
  circuitBreakerProtocol,
  cacheProtocol,
  auditQueueProtocol,
}: {
  iotGatewayProtocol: IoTGatewayProtocol;
  circuitBreakerProtocol: CircuitBreakerProtocol;
  cacheProtocol: CacheProtocol;
  auditQueueProtocol: AuditQueueProtocol;
}): SendDeviceCommandUseCase => ({
  execute: async ({ authContext, data }) => {
    // 1. Check rate limit (max 30 commands per minute per device)
    const rateLimitKey = `iot:rate:${data.deviceId}`;
    const currentCount = await cacheProtocol.get<number>(rateLimitKey);

    if (currentCount !== null && currentCount >= RATE_LIMIT_MAX_COMMANDS) {
      return fail(iotRateLimitExceeded(data.deviceId));
    }

    // Increment rate limit counter
    if (currentCount === null) {
      await cacheProtocol.set(rateLimitKey, 1, RATE_LIMIT_WINDOW_SECONDS);
    } else {
      await cacheProtocol.set(
        rateLimitKey,
        currentCount + 1,
        RATE_LIMIT_WINDOW_SECONDS,
      );
    }

    // 2. Execute command via circuit breaker
    const command: DeviceCommand = {
      deviceId: data.deviceId,
      commandType: data.commandType,
      params: data.params,
      requestedBy: authContext.userId,
    };

    const circuitResult = await circuitBreakerProtocol.execute(async () => {
      const cmdResult = await iotGatewayProtocol.sendCommand(
        data.deviceId,
        command,
      );
      if (!cmdResult.success) {
        throw cmdResult.error;
      }
      return cmdResult.data;
    });

    if (!circuitResult.success) {
      // Determine if circuit is open or command failed
      if (circuitBreakerProtocol.getState() === 'open') {
        return fail(iotCloudUnavailable());
      }
      return fail(iotCommandFailed(circuitResult.error));
    }

    const commandResult = circuitResult.data;

    // 3. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'iot_command_sent',
        resourceType: 'iot_device',
        resourceId: data.deviceId,
        details: {
          commandType: data.commandType,
          success: commandResult.success,
          responseTime: commandResult.responseTime,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 4. Return success
    return ok(commandResult);
  },
});
