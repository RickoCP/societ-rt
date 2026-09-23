/**
 * /api/emergency-contacts — Per-RT emergency contact numbers.
 *
 *  - GET:  list contacts for the caller's tenant (any authenticated member).
 *  - POST: create a contact (admin roles only, enforced in the use case).
 *
 * BFF pattern: validate input → resolve auth → execute use case → safe response.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type {
  ListEmergencyContactsUseCase,
  CreateEmergencyContactUseCase,
} from '@core/domains/emergencyContact/usecases';
import type { EmergencyContact } from '@core/domains/emergencyContact/entities';

const CATEGORIES = [
  'police',
  'ambulance',
  'fire',
  'hospital',
  'security',
  'rt_officer',
  'other',
] as const;

const createSchema = z.object({
  label: z.string().min(1, 'label is required').max(120),
  phone: z.string().min(1, 'phone is required').max(40),
  category: z.enum(CATEGORIES).optional(),
  description: z.string().max(300).optional().nullable(),
  sortOrder: z.number().int().optional(),
});

function unauthorized(correlationId: string): NextResponse {
  return NextResponse.json(
    { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
    { status: 401 },
  );
}

function toDto(c: EmergencyContact) {
  return {
    id: c.id,
    label: c.label,
    phone: c.phone,
    category: c.category,
    description: c.description,
    sortOrder: c.sortOrder,
  };
}

// ---------------------------------------------------------------------------
// GET — list
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) return unauthorized(correlationId);

  const useCase = container.resolve<ListEmergencyContactsUseCase>(
    'listEmergencyContactsUseCase',
  );
  const result = await useCase.execute({ authContext });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json({ data: result.data.map(toDto) }, { status: 200 });
}

// ---------------------------------------------------------------------------
// POST — create
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) return unauthorized(correlationId);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid JSON body', correlationId },
      { status: 400 },
    );
  }

  const validation = createSchema.safeParse(body);
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

  const useCase = container.resolve<CreateEmergencyContactUseCase>(
    'createEmergencyContactUseCase',
  );
  const result = await useCase.execute({
    authContext,
    input: validation.data,
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json({ data: toDto(result.data) }, { status: 201 });
}
