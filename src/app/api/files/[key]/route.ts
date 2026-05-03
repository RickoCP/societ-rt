/**
 * GET /api/files/[key] — Get signed URL for a file.
 * DELETE /api/files/[key] — Delete a file.
 *
 * BFF pattern: resolve auth → execute repository → return safe response.
 *
 * @see Requirements 26.4
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { FileStorageRepository } from '@core/domains/fileStorage/repositories/FileStorageRepository';

interface RouteParams {
  params: Promise<{ key: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  const { key } = await params;
  const decodedKey = decodeURIComponent(key);

  const repo = container.resolve<FileStorageRepository>(
    'fileStorageRepository',
  );
  const result = await repo.getSignedUrl(decodedKey, 3600);

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json({ data: { url: result.data } }, { status: 200 });
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  const { key } = await params;
  const decodedKey = decodeURIComponent(key);

  const repo = container.resolve<FileStorageRepository>(
    'fileStorageRepository',
  );
  const result = await repo.delete(decodedKey);

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json({ data: null }, { status: 200 });
}
