/**
 * ProcessPaymentUseCase — Placeholder for payment gateway integration
 * (Midtrans/Xendit). Updates invoice status after payment attempt.
 *
 * Logic:
 * 1. Placeholder: call payment gateway with idempotency key
 * 2. Update invoice status based on gateway response
 * 3. Enqueue audit log (fire-and-forget)
 * 4. Return ok(invoice)
 *
 * @see Requirements 29.2, 29.3
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { BillingRepository } from '../repositories/BillingRepository';
import type { Invoice, InvoiceStatus } from '../entities';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { getTenantId, getUserId } from '@core/domains/authorization/types';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ProcessPaymentInput {
  readonly invoiceId: string;
  readonly gatewayTransactionId?: string;
}

export interface ProcessPaymentUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    data: ProcessPaymentInput;
  }): Promise<DomainResult<Invoice>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const ProcessPaymentUseCaseImpl = ({
  billingRepository,
  auditQueueProtocol,
}: {
  billingRepository: BillingRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): ProcessPaymentUseCase => ({
  execute: async ({ authContext, data }) => {
    const tenantId = getTenantId(authContext);
    const userId = getUserId(authContext);

    // Placeholder: In production, this would call the payment gateway
    // (Midtrans/Xendit) with the idempotency key from the invoice.
    // For now, we simulate a successful payment.

    const status: InvoiceStatus = 'paid';
    const paidAt = new Date();

    // Update invoice status
    const result = await billingRepository.updateInvoiceStatus(
      tenantId,
      data.invoiceId,
      status,
      data.gatewayTransactionId,
      paidAt,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const invoice = result.data;

    // Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId: userId,
        actionType: 'payment_processed',
        resourceType: 'invoice',
        resourceId: invoice.id,
        details: {
          status,
          gatewayTransactionId: data.gatewayTransactionId ?? null,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    return ok(invoice);
  },
});
