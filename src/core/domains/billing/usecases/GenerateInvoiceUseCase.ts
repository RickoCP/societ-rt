/**
 * GenerateInvoiceUseCase — Creates an invoice at billing cycle start
 * with an idempotency key to prevent duplicate invoices.
 *
 * Logic:
 * 1. Check for existing invoice with same idempotency key
 * 2. If exists, return existing invoice (idempotent)
 * 3. Create new invoice via billingRepository
 * 4. Enqueue audit log (fire-and-forget)
 * 5. Return ok(invoice)
 *
 * @see Requirements 29.1, 29.2
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import type { BillingRepository } from '../repositories/BillingRepository';
import type { Invoice, CreateInvoiceInput } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface GenerateInvoiceUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    data: CreateInvoiceInput;
  }): Promise<DomainResult<Invoice>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const GenerateInvoiceUseCaseImpl = ({
  billingRepository,
  auditQueueProtocol,
}: {
  billingRepository: BillingRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): GenerateInvoiceUseCase => ({
  execute: async ({ authContext, data }) => {
    // 1. Check for existing invoice with same idempotency key
    const existingResult = await billingRepository.findInvoiceByIdempotencyKey(
      data.idempotencyKey,
    );

    if (!existingResult.success) {
      return fail(existingResult.error);
    }

    // 2. If exists, return existing invoice (idempotent)
    if (existingResult.data) {
      return ok(existingResult.data);
    }

    // 3. Create new invoice
    const result = await billingRepository.createInvoice(
      authContext.tenantId,
      data,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const invoice = result.data;

    // 4. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'invoice_generated',
        resourceType: 'invoice',
        resourceId: invoice.id,
        details: {
          planName: invoice.planName,
          amount: invoice.amount,
          idempotencyKey: invoice.idempotencyKey,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 5. Return success
    return ok(invoice);
  },
});
