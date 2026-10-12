/**
 * POST /api/iot/commands — Send a command to an IoT device.
 *
 * BFF pattern: validate input → withPermission wrapper → validate device ownership → execute use case → return safe response.
 *
 * @see Requirements 37.4, 38.6, 38.7, 41.4
 * @see Requirements 2.1, 2.2, 2.3 — Route Handler Migration
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { uuidLike } from '@infrastructure/utils/uuidLike';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { SendDeviceCommandUseCase } from '@core/domains/iot/usecases';
import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const sendCommandSchema = z.object({
  deviceId: uuidLike('deviceId must be a valid UUID'),
  commandType: z.string().min(1, 'commandType is required'),
  params: z.record(z.string(), z.unknown()).default({}),
});

// ---------------------------------------------------------------------------
// POST handler — Send device command
// ---------------------------------------------------------------------------

const handleSendCommand: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Parse and validate input
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Invalid JSON body',
        correlationId,
      },
      { status: 400 },
    );
  }

  const validation = sendCommandSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        fields: formatZodErrors(validation.error),
        correlationId,
      },
      { status: 400 },
    );
  }

  const { deviceId, commandType, params } = validation.data;

  // 2. Validate device ownership (device must belong to user's tenant)
  const prisma = container.resolve<PrismaClient>('prismaClient');
  const device = await prisma.ioTDevice.findFirst({
    where: { id: deviceId, tenantId: authContext.tenantId },
  });

  if (!device) {
    return NextResponse.json(
      { code: 'COMMON_NOT_FOUND', message: 'Device not found', correlationId },
      { status: 404 },
    );
  }

  // 3. Execute use case via DI
  const useCase = container.resolve<SendDeviceCommandUseCase>(
    'sendDeviceCommandUseCase',
  );
  const result = await useCase.execute({
    authContext,
    data: { deviceId, commandType, params },
  });

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const commandResult = result.data;

  return NextResponse.json(
    {
      data: {
        success: commandResult.success,
        deviceId: commandResult.deviceId,
        commandType: commandResult.commandType,
        responseTime: commandResult.responseTime,
      },
    },
    { status: 200 },
  );
};

export const POST = withPermission(
  { permissions: ['iot:command'] },
  handleSendCommand,
);
