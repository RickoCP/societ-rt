/**
 * StubPaymentGateway — Development/testing implementation of PaymentGatewayProtocol.
 *
 * This stub implementation simulates payment gateway behavior for development
 * and testing without connecting to actual payment providers.
 *
 * Features:
 * - Configurable payment outcomes (success, failure, pending)
 * - Simulated delays for realistic testing
 * - In-memory transaction storage for status queries
 * - Webhook signature validation stub
 *
 * NOT for production use.
 *
 * @see Requirements 57 (Billing/Payment)
 * @see Task 47 — Billing and Payment Integration
 */

import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError } from '@core/utils';
import type {
  PaymentGatewayProtocol,
  InitiatePaymentRequest,
  InitiatePaymentResponse,
  GetPaymentStatusRequest,
  GetPaymentStatusResponse,
  RefundPaymentRequest,
  RefundPaymentResponse,
  VerifyWebhookRequest,
  GatewayPaymentStatus,
} from '@core/protocols';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface StubPaymentGatewayConfig {
  /** Probability of payment success (0-1), default 0.9 */
  successRate?: number;
  /** Simulated delay in ms, default 100 */
  simulatedDelayMs?: number;
  /** Base URL for payment URLs, default 'https://pay.stub.local' */
  paymentBaseUrl?: string;
  /** Whether to always succeed (for testing), default false */
  alwaysSucceed?: boolean;
  /** Whether to always fail (for testing), default false */
  alwaysFail?: boolean;
}

// ---------------------------------------------------------------------------
// In-memory transaction store
// ---------------------------------------------------------------------------

interface StoredTransaction {
  gatewayTransactionId: string;
  orderId: string;
  amount: number;
  currency: string;
  status: GatewayPaymentStatus;
  createdAt: Date;
  expiresAt: Date;
  paidAt?: Date;
  failureReason?: string;
  refunds: Array<{
    refundId: string;
    amount: number;
    status: 'PENDING' | 'COMPLETED' | 'FAILED';
    createdAt: Date;
  }>;
}

const transactionStore = new Map<string, StoredTransaction>();

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const StubPaymentGatewayImpl = (
  config: StubPaymentGatewayConfig = {},
): PaymentGatewayProtocol => {
  const {
    successRate = 0.9,
    simulatedDelayMs = 100,
    paymentBaseUrl = 'https://pay.stub.local',
    alwaysSucceed = false,
    alwaysFail = false,
  } = config;

  /**
   * Simulate network delay.
   */
  async function simulateDelay(): Promise<void> {
    if (simulatedDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, simulatedDelayMs));
    }
  }

  /**
   * Generate simulated payment outcome.
   */
  function determineOutcome(): GatewayPaymentStatus {
    if (alwaysSucceed) return 'COMPLETED';
    if (alwaysFail) return 'FAILED';

    const rand = Math.random();
    if (rand < successRate) {
      return 'COMPLETED';
    }
    return 'FAILED';
  }

  return {
    providerName: 'StubPaymentGateway',

    async initiatePayment(
      request: InitiatePaymentRequest,
    ): Promise<DomainResult<InitiatePaymentResponse>> {
      await simulateDelay();

      try {
        const gatewayTransactionId = `stub_txn_${randomUUID()}`;
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + (request.expiresInMinutes ?? 1440));

        // Store transaction
        const transaction: StoredTransaction = {
          gatewayTransactionId,
          orderId: request.orderId,
          amount: request.amount,
          currency: request.currency,
          status: 'PENDING',
          createdAt: new Date(),
          expiresAt,
          refunds: [],
        };
        transactionStore.set(gatewayTransactionId, transaction);
        transactionStore.set(request.orderId, transaction); // Also index by order ID

        const paymentUrl = `${paymentBaseUrl}/pay/${gatewayTransactionId}`;

        return ok({
          gatewayTransactionId,
          orderId: request.orderId,
          status: 'PENDING',
          paymentUrl,
          expiresAt,
          rawResponse: {
            provider: 'stub',
            transactionId: gatewayTransactionId,
            paymentUrl,
          },
        });
      } catch (error) {
        return fail(
          technicalError(
            'PAYMENT_INITIATE_FAILED',
            'Failed to initiate payment',
            { cause: error },
          ),
        );
      }
    },

    async getPaymentStatus(
      request: GetPaymentStatusRequest,
    ): Promise<DomainResult<GetPaymentStatusResponse>> {
      await simulateDelay();

      try {
        const transaction = transactionStore.get(request.transactionId);

        if (!transaction) {
          return fail(
            technicalError(
              'PAYMENT_NOT_FOUND',
              `Transaction ${request.transactionId} not found`,
            ),
          );
        }

        // If still pending, simulate completion based on config
        if (transaction.status === 'PENDING') {
          // Check expiration
          if (new Date() > transaction.expiresAt) {
            transaction.status = 'EXPIRED';
          } else {
            // Simulate payment completion
            const outcome = determineOutcome();
            transaction.status = outcome;
            if (outcome === 'COMPLETED') {
              transaction.paidAt = new Date();
            } else if (outcome === 'FAILED') {
              transaction.failureReason = 'Simulated payment failure';
            }
          }
        }

        return ok({
          gatewayTransactionId: transaction.gatewayTransactionId,
          orderId: transaction.orderId,
          status: transaction.status,
          amount: transaction.amount,
          currency: transaction.currency as 'IDR' | 'USD',
          paidAt: transaction.paidAt,
          failureReason: transaction.failureReason,
          rawResponse: {
            provider: 'stub',
            transactionId: transaction.gatewayTransactionId,
            status: transaction.status,
          },
        });
      } catch (error) {
        return fail(
          technicalError(
            'PAYMENT_STATUS_FAILED',
            'Failed to get payment status',
            { cause: error },
          ),
        );
      }
    },

    async refundPayment(
      request: RefundPaymentRequest,
    ): Promise<DomainResult<RefundPaymentResponse>> {
      await simulateDelay();

      try {
        const transaction = transactionStore.get(request.gatewayTransactionId);

        if (!transaction) {
          return fail(
            technicalError(
              'PAYMENT_NOT_FOUND',
              `Transaction ${request.gatewayTransactionId} not found`,
            ),
          );
        }

        if (transaction.status !== 'COMPLETED') {
          return fail(
            technicalError(
              'REFUND_INVALID_STATE',
              `Cannot refund transaction in ${transaction.status} state`,
            ),
          );
        }

        const refundAmount = request.amount ?? transaction.amount;
        const totalRefunded = transaction.refunds.reduce(
          (sum, r) => sum + (r.status === 'COMPLETED' ? r.amount : 0),
          0,
        );

        if (totalRefunded + refundAmount > transaction.amount) {
          return fail(
            technicalError(
              'REFUND_EXCEEDS_AMOUNT',
              `Refund would exceed original amount`,
            ),
          );
        }

        const refundId = `stub_refund_${randomUUID()}`;
        const refund = {
          refundId,
          amount: refundAmount,
          status: 'COMPLETED' as const,
          createdAt: new Date(),
        };

        transaction.refunds.push(refund);

        // Update transaction status if fully refunded
        const newTotalRefunded = totalRefunded + refundAmount;
        if (newTotalRefunded >= transaction.amount) {
          transaction.status = 'REFUNDED';
        } else {
          transaction.status = 'PARTIALLY_REFUNDED';
        }

        return ok({
          refundTransactionId: refundId,
          originalTransactionId: request.gatewayTransactionId,
          amountRefunded: refundAmount,
          isPartialRefund: newTotalRefunded < transaction.amount,
          status: 'COMPLETED',
          rawResponse: {
            provider: 'stub',
            refundId,
            originalTransactionId: request.gatewayTransactionId,
          },
        });
      } catch (error) {
        return fail(
          technicalError(
            'REFUND_FAILED',
            'Failed to process refund',
            { cause: error },
          ),
        );
      }
    },

    verifyWebhookSignature(request: VerifyWebhookRequest): boolean {
      // Stub always returns true for webhook verification
      // In production, this would verify HMAC-SHA256 signature
      return request.signature.startsWith('stub_sig_') || request.signature.length > 0;
    },

    parseWebhookPayload(
      payload: Record<string, unknown>,
    ): DomainResult<GetPaymentStatusResponse> {
      try {
        // Stub webhook payload format
        const transactionId = payload.transaction_id as string;
        const orderId = payload.order_id as string;
        const status = payload.status as GatewayPaymentStatus;
        const amount = payload.amount as number;
        const currency = (payload.currency as string) ?? 'IDR';

        if (!transactionId || !orderId || !status) {
          return fail(
            technicalError(
              'WEBHOOK_PARSE_FAILED',
              'Missing required fields in webhook payload',
            ),
          );
        }

        return ok({
          gatewayTransactionId: transactionId,
          orderId,
          status,
          amount,
          currency: currency as 'IDR' | 'USD',
          paidAt: status === 'COMPLETED' ? new Date() : undefined,
          failureReason: status === 'FAILED' ? (payload.failure_reason as string) : undefined,
          rawResponse: payload,
        });
      } catch (error) {
        return fail(
          technicalError(
            'WEBHOOK_PARSE_FAILED',
            'Failed to parse webhook payload',
            { cause: error },
          ),
        );
      }
    },
  };
};

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Reset the in-memory transaction store.
 * Use in tests to start with clean state.
 */
export function resetStubTransactionStore(): void {
  transactionStore.clear();
}

/**
 * Get a stored transaction by ID.
 * Use in tests to verify transaction state.
 */
export function getStubTransaction(transactionId: string): StoredTransaction | undefined {
  return transactionStore.get(transactionId);
}

/**
 * Manually complete a pending transaction.
 * Use in tests to simulate webhook callbacks.
 */
export function completeStubTransaction(transactionId: string): boolean {
  const transaction = transactionStore.get(transactionId);
  if (transaction && transaction.status === 'PENDING') {
    transaction.status = 'COMPLETED';
    transaction.paidAt = new Date();
    return true;
  }
  return false;
}

/**
 * Manually fail a pending transaction.
 * Use in tests to simulate payment failure.
 */
export function failStubTransaction(transactionId: string, reason = 'Test failure'): boolean {
  const transaction = transactionStore.get(transactionId);
  if (transaction && transaction.status === 'PENDING') {
    transaction.status = 'FAILED';
    transaction.failureReason = reason;
    return true;
  }
  return false;
}
