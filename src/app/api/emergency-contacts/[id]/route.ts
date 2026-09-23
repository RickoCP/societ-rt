/**
 * /api/emergency-contacts/[id] — Update or delete a single emergency contact.
 * Admin roles only (enforced inside the use cases).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type {
  UpdateEmergencyContactUseCase,
  DeleteEmergencyContactUseCase,
} from '@core/domains/emergencyContact/usecases';

const CATEGORIES = [
  'police',
  'ambulance',
  'fire',
  'hospital',
  'security',
  'rt_officer',
  'other',
] as const;

const updateSchema = z
  .object({
    label: z.string().min(1).max(120).optional(),
    phone: z.string().min(1).max(40).optional(),
    category: z.enum(CATEGORIES).optional(),
    description: z.string().max(300).optional().nullable(),
    sortOrder: z.number().int().optional(),
  })
  .refine(obj => Object.keys(obj).length > 0, {
    message: 'At least one field must be provided',
  });

function unauthorized(correlationId: string): NextResponse {
  return NextResponse.json(
    { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
    { status: 401 },
  );
}

// ---------------------------------------------------------------------------
// PUT — update
// ---------------------------------------------------------------------------

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) return unauthorized(correlationId);

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid JSON body', correlationId },
      { status: 400 },
    );
  }

  const validation = updateSchema.safeParse(body);
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

  const useCase = container.resolve<UpdateEmergencyContactUseCase>(
    'updateEmergencyContactUseCase',
  );
  const result = await useCase.execute({
    authContext,
    id,
    input: validation.data,
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const c = result.data;
  return NextResponse.json(
    {
      data: {
        id: c.id,
        label: c.label,
        phone: c.phone,
        category: c.category,
        description: c.description,
        sortOrder: c.sortOrder,
      },
    },
    { status: 200 },
  );
}

// ---------------------------------------------------------------------------
// DELETE — remove
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) return unauthorized(correlationId);

  const { id } = await params;

  const useCase = container.resolve<DeleteEmergencyContactUseCase>(
    'deleteEmergencyContactUseCase',
  );
  const result = await useCase.execute({ authContext, id });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json({ data: { id } }, { status: 200 });
}
