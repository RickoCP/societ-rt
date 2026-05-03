/**
 * POST /api/files/upload — Upload a file.
 *
 * BFF pattern: resolve auth → parse multipart → execute use case → return safe response.
 * Validates file size (max 10MB) and MIME type in use case.
 *
 * @see Requirements 26.2, 26.3, 26.5
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { UploadFileUseCase } from '@core/domains/fileStorage/usecases';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Invalid multipart form data',
        correlationId,
      },
      { status: 400 },
    );
  }

  const file = formData.get('file');
  const domain = formData.get('domain');

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'File is required',
        correlationId,
      },
      { status: 400 },
    );
  }

  if (!domain || typeof domain !== 'string') {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Domain is required',
        correlationId,
      },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const useCase = container.resolve<UploadFileUseCase>('uploadFileUseCase');
  const result = await useCase.execute({
    tenantId: authContext.tenantId,
    domain,
    buffer,
    originalFilename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
