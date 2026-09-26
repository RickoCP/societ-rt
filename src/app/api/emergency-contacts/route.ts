/**
 * /api/emergency-contacts — Per-RT emergency contact numbers.
 *
 *  - GET:  list contacts for the caller's tenant (any authenticated member).
 *          SAFETY-CRITICAL: allowSuspended=true so suspended users can view contacts.
 *  - POST: create a contact (admin roles only, enforced in the use case).
 *
 * BFF pattern: validate input → withPermission → execute use case → safe response.
 *
 * @see Requirements 2.1 — withPermission pattern
 * @see Requirements 7.1, 7.2, 7.3 — Safety-Critical Route Preservation
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
// GET — list emergency contacts
// SAFETY-CRITICAL: allowSuspended=true so suspended users can view their emergency contacts
// ---------------------------------------------------------------------------

const handleGetContacts: AuthorizedRouteHandler = async (
  request,
  authContext,
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const useCase = container.resolve<ListEmergencyContactsUseCase>(
    'listEmergencyContactsUseCase',
  );
  const result = await useCase.execute({ authContext: authContext as AuthorizationContext });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json({ data: result.data.map(toDto) }, { status: 200 });
};

/**
 * GET /api/emergency-contacts
 *
 * SAFETY-CRITICAL: Uses allowSuspended=true because suspended users must be able
 * to view emergency contacts for safety reasons.
 *
 * @see Requirements 7.2, 7.3 — Safety-Critical Route Preservation
 */
export const GET = withPermission(
  { permissions: ['emergency:read'], allowSuspended: true },
  handleGetContacts,
);

// ---------------------------------------------------------------------------
// POST — create emergency contact
// Not safety-critical: editing/creating contacts requires active membership
// ---------------------------------------------------------------------------

const handleCreateContact: AuthorizedRouteHandler = async (
  request,
  authContext,
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

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
    authContext: authContext as AuthorizationContext,
    input: validation.data,
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json({ data: toDto(result.data) }, { status: 201 });
};

/**
 * POST /api/emergency-contacts
 *
 * Creates a new emergency contact. Not safety-critical - requires active membership.
 *
 * @see Requirements 2.1 — withPermission pattern
 */
export const POST = withPermission(
  { permissions: ['emergency:write'] },
  handleCreateContact,
);
