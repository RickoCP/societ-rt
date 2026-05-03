/**
 * MaskSensitiveDataUseCase — Masks NIK and phone numbers.
 *
 * NIK: show last 4 digits, mask the rest with asterisks.
 * Phone: show last 4 digits, mask the rest with asterisks.
 * Role-based exceptions: data owner, Ketua_RT, Pengurus see full data.
 *
 * @see Requirements 27.1, 27.2
 */

import type { DomainResult } from '@core/utils';
import { ok } from '@core/utils';
import type { UserRole } from '@core/protocols';

const FULL_ACCESS_ROLES: ReadonlySet<string> = new Set([
  'Ketua_RT',
  'Pengurus',
]);

export interface MaskInput {
  readonly nik?: string;
  readonly phone?: string;
  readonly requestorRole: UserRole;
  readonly requestorUserId: string;
  readonly dataOwnerUserId: string;
}

export interface MaskedOutput {
  readonly nik?: string;
  readonly phone?: string;
}

export interface MaskSensitiveDataUseCase {
  execute(input: MaskInput): DomainResult<MaskedOutput>;
}

function maskValue(value: string, visibleCount: number): string {
  if (value.length <= visibleCount) {
    return value;
  }
  const masked = '*'.repeat(value.length - visibleCount);
  return masked + value.slice(-visibleCount);
}

export const MaskSensitiveDataUseCaseImpl = (): MaskSensitiveDataUseCase => ({
  execute: (input) => {
    const isOwner = input.requestorUserId === input.dataOwnerUserId;
    const hasFullAccess = isOwner || FULL_ACCESS_ROLES.has(input.requestorRole);

    const result: MaskedOutput = {
      nik: input.nik
        ? hasFullAccess
          ? input.nik
          : maskValue(input.nik, 4)
        : undefined,
      phone: input.phone
        ? hasFullAccess
          ? input.phone
          : maskValue(input.phone, 4)
        : undefined,
    };

    return ok(result);
  },
});
