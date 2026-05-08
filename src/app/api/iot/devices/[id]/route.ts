/**
 * GET /api/iot/devices/:id — Get IoT device detail.
 * DELETE /api/iot/devices/:id — Unpair (remove) an IoT device.
 *
 * Both endpoints validate device ownership (device must belong to the user's tenant).
 *
 * @see Requirements 37.1, 37.4, 37.11, 38.6
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { IoTRepository } from '@core/domains/iot/repositories/IoTRepository';
import type { UnpairDeviceUseCase } from '@core/domains/iot/usecases';
import type { IoTDevice } from '@core/domains/iot/entities';
import type { PrismaClient } from '@/generated/prisma/client';

// ---------------------------------------------------------------------------
// Helper — Find device by ID within tenant
// ---------------------------------------------------------------------------

async function findDeviceByIdAndTenant(
  tenantId: string,
  deviceId: string,
): Promise<{ found: true; device: IoTDevice } | { found: false }> {
  const prisma = container.resolve<PrismaClient>('prismaClient');
  const device = await prisma.ioTDevice.findFirst({
    where: { id: deviceId, tenantId },
  });

  if (!device) {
    return { found: false };
  }

  return {
    found: true,
    device: {
      id: device.id,
      tenantId: device.tenantId,
      householdId: device.householdId,
      tuyaDeviceId: device.tuyaDeviceId,
      deviceType: device.deviceType as IoTDevice['deviceType'],
      name: device.name,
      onlineStatus: device.onlineStatus as IoTDevice['onlineStatus'],
      batteryLevel: device.batteryLevel,
      lastSeen: device.lastSeen,
      metadata: (device.metadata as Record<string, unknown>) ?? {},
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
    },
  };
}

// ---------------------------------------------------------------------------
// GET handler — Device detail
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Resolve auth context
  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  const { id } = await params;

  // 2. Query device (tenant-scoped ownership check)
  const deviceCheck = await findDeviceByIdAndTenant(authContext.tenantId, id);

  if (!deviceCheck.found) {
    return NextResponse.json(
      { code: 'COMMON_NOT_FOUND', message: 'Device not found', correlationId },
      { status: 404 },
    );
  }

  const device = deviceCheck.device;

  // 3. Get recent events for this device
  const iotRepository = container.resolve<IoTRepository>('iotRepository');
  const eventsResult = await iotRepository.findEventsByDevice(
    authContext.tenantId,
    id,
    10,
  );

  const events = eventsResult.success ? eventsResult.data : [];

  return NextResponse.json(
    {
      data: {
        id: device.id,
        householdId: device.householdId,
        tuyaDeviceId: device.tuyaDeviceId,
        deviceType: device.deviceType,
        name: device.name,
        onlineStatus: device.onlineStatus,
        batteryLevel: device.batteryLevel,
        lastSeen: device.lastSeen.toISOString(),
        metadata: device.metadata,
        createdAt: device.createdAt.toISOString(),
        updatedAt: device.updatedAt.toISOString(),
        recentEvents: events.map(e => ({
          id: e.id,
          eventType: e.eventType,
          payload: e.payload,
          isSharedSecurity: e.isSharedSecurity,
          createdAt: e.createdAt.toISOString(),
        })),
      },
    },
    { status: 200 },
  );
}

// ---------------------------------------------------------------------------
// DELETE handler — Unpair device
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Resolve auth context
  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  const { id } = await params;

  // 2. Verify device exists within tenant (ownership check)
  const deviceCheck = await findDeviceByIdAndTenant(authContext.tenantId, id);

  if (!deviceCheck.found) {
    return NextResponse.json(
      { code: 'COMMON_NOT_FOUND', message: 'Device not found', correlationId },
      { status: 404 },
    );
  }

  // 3. Execute unpair use case
  const useCase = container.resolve<UnpairDeviceUseCase>('unpairDeviceUseCase');
  const result = await useCase.execute({
    authContext,
    data: { deviceId: id },
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    { data: { id, deleted: true } },
    { status: 200 },
  );
}
