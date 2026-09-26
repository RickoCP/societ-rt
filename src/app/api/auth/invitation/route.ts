/**
 * POST /api/auth/invitation — Creates a time-limited invitation token.
 *
 * BFF pattern: validate input → auth context from wrapper → execute use case → return safe response.
 * This is a protected endpoint — requires `membership:delegate` permission.
 *
 * @see Requirements 3.3, 4.6, 17.1
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { UserRole } from '@core/protocols';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import {
  withMembershipDelegate,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { CreateInvitationUseCase } from '@core/domains/auth/usecases';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const invitationSchema = z.object({
  email: z.string().email('Invalid email format'),
  role: z.nativeEnum(UserRole, {
    error: 'Invalid role',
  }),
});

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

interface InvitationSuccessResponse {
  data: {
    token: string;
    expiresAt: string;
  };
}

interface InvitationErrorResponse {
  code: string;
  message?: string;
  fields?: Record<string, string>;
  correlationId: string;
}

type InvitationResponse = InvitationSuccessResponse | InvitationErrorResponse;

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * Handler for POST /api/auth/invitation
 *
 * Receives AuthorizationContext from withMembershipDelegate wrapper.
 * User is guaranteed to have `membership:delegate` permission.
 */
const handleCreateInvitation: AuthorizedRouteHandler<InvitationResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<InvitationResponse>> => {
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

  const validation = invitationSchema.safeParse(body);
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

  const { email, role } = validation.data;

  // 2. Execute use case via DI
  // Note: We pass the full AuthorizationContext for compatibility
  // The use case can use authContext.userId, authContext.tenantId, etc.
  const createInvitationUseCase =
    container.resolve<CreateInvitationUseCase>('createInvitationUseCase');
  const result = await createInvitationUseCase.execute({
    authContext: {
      userId: authContext.userId,
      tenantId: authContext.tenantId,
      role: authContext.role,
    },
    email,
    role,
  });

  // 3. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(
      result.error,
      correlationId,
    ) as NextResponse<InvitationResponse>;
  }

  const invitation = result.data;

  return NextResponse.json(
    {
      data: {
        token: invitation.token,
        expiresAt: invitation.expiresAt.toISOString(),
      },
    },
    { status: 201 },
  );
};

// Export wrapped handler with membership:delegate permission
// This permission allows creating invitations for new members
export const POST = withMembershipDelegate(handleCreateInvitation);
