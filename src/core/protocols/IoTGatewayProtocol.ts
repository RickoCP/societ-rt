/**
 * IoTGatewayProtocol — Core abstraction for IoT device gateway
 * (Tuya Cloud integration).
 *
 * Infrastructure layer provides the concrete implementation that handles
 * OAuth 2.0 authentication, device pairing, command execution, webhook
 * validation, and device status synchronization.
 *
 * @see Requirements 38.1, 38.2, 38.3, 38.4, 38.6, 38.7, 38.11
 */

import type { DomainResult } from '@core/utils';
import type {
  IoTDevice,
  DeviceCommand,
  CommandResult,
  DeviceStatus,
} from '@core/domains/iot/entities';

export interface IoTGatewayProtocol {
  /** Generate a pairing token and complete device pairing with Tuya Cloud. */
  pairDevice(
    tenantId: string,
    householdId: string,
    pairingToken: string,
  ): Promise<DomainResult<IoTDevice>>;

  /** Send a command to a device via Tuya Cloud API. */
  sendCommand(
    deviceId: string,
    command: DeviceCommand,
  ): Promise<DomainResult<CommandResult>>;

  /** Synchronize device status from Tuya Cloud. */
  syncDeviceStatus(deviceId: string): Promise<DomainResult<DeviceStatus>>;

  /** Get all devices for a household from Tuya Cloud. */
  getDeviceList(householdId: string): Promise<DomainResult<IoTDevice[]>>;

  /** Unpair a device and revoke access tokens. */
  unpairDevice(deviceId: string): Promise<DomainResult<void>>;

  /** Validate incoming Tuya webhook signature using HMAC-SHA256. */
  validateWebhookSignature(
    payload: string,
    signature: string,
    timestamp: string,
  ): boolean;

  /** Refresh the OAuth 2.0 access token for Tuya Cloud API. */
  refreshToken(): Promise<DomainResult<void>>;
}
