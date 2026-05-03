/**
 * HandlePaymentWebhookUseCase — Validates webhook from payment gateway
 * (placeholder), updates payment status, writes reconciliation log.
 *
 * Logic:
 * 1. Validate webhook signature (placeholder)
 * 2. Update invoice status based on webhook payload
 * 3. Write reconciliation record
 * 4. Enqueue audit log (fire-and-forget)
 * 5. Return ok(void)
 *
 * @see Requirements 29.4, 29.7
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail, authenticationError } from '@core/utils';
import type { BillingRepository } from '../repositories/BillingRepository';
import type { InvoiceStatus } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface WebhookPayload {
  readonly gatewayTransactionId: string;
  readonly invoiceId: string;
  readonly tenantId: string;
  readonly status: InvoiceStatus;
  readonly amount: number;
  readonly signature: string;
  readonly gatewayResponse: Record<string, unknown>;
}

export interface HandlePaymentWebhookUseCase {
  execute(params: {
    payload: WebhookPayload;
  }): Promise<DomainResult<void>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const HandlePaymentWebhookUseCaseImpl = ({
  billingRepository,
  auditQueueProtocol,
}: {
  billingRepository: BillingRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): HandlePaymentWebhookUseCase => ({
  execute: async ({ payload }) => {
    // 1. Validate webhook signature (placeholder)
    // In production, this would verify HMAC-SHA256 or RSA signature
    // depending on the gateway (Midtrans/Xendit).
    const isValidSignature = validateWebhookSignature(payload.signature);
    if (!isValidSignature) {
      return fail(
        authenticationError(
          'BILLING_WEBHOOK_INVALID_SIGNATURE',
          'Invalid webhook signature',
        ),
      );
    }

    // 2. Update invoice status
    const paidAt = payload.status === 'paid' ? new Date() : undefined;
    const updateResult = await billingRepository.updateInvoiceStatus(
      payload.tenantId,
      payload.invoiceId,
      payload.status,
      payload.gatewayTransactionId,
      paidAt,
    );

    if (!updateResult.success) {
      return fail(updateResult.error);
    }

    // 3. Write reconciliation record
    const reconResult = await billingRepository.createReconciliation({
      gatewayTransactionId: payload.gatewayTransactionId,
      internalInvoiceId: payload.invoiceId,
      amount: payload.amount,
      status: payload.status,
      gatewayResponse: payload.gatewayResponse,
      reconciledAt: new Date(),
    });

    if (!reconResult.success) {
      return fail(reconResult.error);
    }

    // 4. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: payload.tenantId,
        actorUserId: 'system',
        actionType: 'payment_webhook_processed',
        resourceType: 'invoice',
        resourceId: payload.invoiceId,
        details: {
          gatewayTransactionId: payload.gatewayTransactionId,
          status: payload.status,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    return ok(undefined);
  },
});

// ---------------------------------------------------------------------------
// Placeholder signature validation
// ---------------------------------------------------------------------------

/**
 * Placeholder for webhook signature validation.
 * In production, implement HMAC-SHA256 or RSA verification
 * depending on the payment gateway (Midtrans/Xendit).
 */
function validateWebhookSignature(_signature: string): boolean {
  // TODO: Implement real signature validation
  return true;
}
