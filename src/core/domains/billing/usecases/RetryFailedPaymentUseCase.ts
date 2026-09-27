/**
 * RetryFailedPaymentUseCase — Retries a failed payment up to 2 times
 * with the original idempotency key.
 *
 * Logic:
 * 1. Check current retry count (max 2)
 * 2. If exceeded, return business error
 * 3. Increment retry count
 * 4. Attempt payment (placeholder)
 * 5. Enqueue audit log (fire-and-forget)
 * 6. Return ok(invoice)
 *
 * @see Requirements 29.5, 29.6
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail, businessError } from '@core/utils';
import type { BillingRepository } from '../repositories/BillingRepository';
import type { Invoice } from '../entities';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { getTenantId, getUserId } from '@core/domains/authorization/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRY_COUNT = 2;

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface RetryFailedPaymentUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    invoiceId: string;
  }): Promise<DomainResult<Invoice>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const RetryFailedPaymentUseCaseImpl = ({
  billingRepository,
  auditQueueProtocol,
}: {
  billingRepository: BillingRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): RetryFailedPaymentUseCase => ({
  execute: async ({ authContext, invoiceId }) => {
    const tenantId = getTenantId(authContext);
    const userId = getUserId(authContext);

    // 1. Get current invoices to check retry count
    const invoicesResult = await billingRepository.findInvoicesByTenant(
      tenantId,
      'failed',
    );

    if (!invoicesResult.success) {
      return fail(invoicesResult.error);
    }

    const invoice = invoicesResult.data.find((inv) => inv.id === invoiceId);
    if (!invoice) {
      return fail(
        businessError(
          'BILLING_INVOICE_NOT_FOUND',
          'Failed invoice not found',
        ),
      );
    }

    // 2. Check retry count
    if (invoice.retryCount >= MAX_RETRY_COUNT) {
      return fail(
        businessError(
          'BILLING_MAX_RETRIES_EXCEEDED',
          `Maximum retry count (${MAX_RETRY_COUNT}) exceeded for this invoice`,
        ),
      );
    }

    // 3. Increment retry count
    const incrementResult = await billingRepository.incrementRetryCount(
      tenantId,
      invoiceId,
    );

    if (!incrementResult.success) {
      return fail(incrementResult.error);
    }

    // 4. Attempt payment (placeholder — in production, call gateway)
    // For now, keep status as 'failed' since this is a placeholder.
    // Real implementation would call the gateway and update status accordingly.

    const updatedInvoice = incrementResult.data;

    // 5. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId: userId,
        actionType: 'payment_retry_attempted',
        resourceType: 'invoice',
        resourceId: invoiceId,
        details: {
          retryCount: updatedInvoice.retryCount,
          idempotencyKey: updatedInvoice.idempotencyKey,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 6. Return updated invoice
    return ok(updatedInvoice);
  },
});
