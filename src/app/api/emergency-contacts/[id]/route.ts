/**
 * /api/emergency-contacts/[id] — Update or delete a single emergency contact.
 *
 * Admin roles only (enforced inside the use cases).
 * Not safety-critical: editing/deleting contacts requires active membership.
 *
 * BFF pattern: validate input → withPermission → execute use case → safe response.
 *
 * @see Requirements 2.1 — withPermission pattern
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
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

// ---------------------------------------------------------------------------
// PUT — update emergency contact
// Not safety-critical: editing contacts requires active membership
// ---------------------------------------------------------------------------

const handleUpdateContact: AuthorizedRouteHandler = async (
  request,
  authContext,
  routeContext,
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const { id } = await routeContext!.params!;

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
    authContext: authContext as AuthorizationContext,
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
};

/**
 * PUT /api/emergency-contacts/[id]
 *
 * Updates an emergency contact. Not safety-critical - requires active membership.
 *
 * @see Requirements 2.1 — withPermission pattern
 */
export const PUT = withPermission(
  { permissions: ['emergency:write'] },
  handleUpdateContact,
);

// ---------------------------------------------------------------------------
// DELETE — remove emergency contact
// Not safety-critical: deleting contacts requires active membership
// ---------------------------------------------------------------------------

const handleDeleteContact: AuthorizedRouteHandler = async (
  request,
  authContext,
  routeContext,
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const { id } = await routeContext!.params!;

  const useCase = container.resolve<DeleteEmergencyContactUseCase>(
    'deleteEmergencyContactUseCase',
  );
  const result = await useCase.execute({
    authContext: authContext as AuthorizationContext,
    id,
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json({ data: { id } }, { status: 200 });
};

/**
 * DELETE /api/emergency-contacts/[id]
 *
 * Deletes an emergency contact. Not safety-critical - requires active membership.
 *
 * @see Requirements 2.1 — withPermission pattern
 */
export const DELETE = withPermission(
  { permissions: ['emergency:write'] },
  handleDeleteContact,
);
