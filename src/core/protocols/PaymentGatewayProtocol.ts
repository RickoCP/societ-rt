/**
 * PaymentGatewayProtocol — Provider-agnostic protocol for payment gateway integration.
 *
 * Defines operations for payment processing without coupling to specific
 * payment providers (Midtrans, Xendit, Stripe, etc.).
 *
 * The infrastructure layer provides concrete implementations.
 *
 * @see Requirements 57 (Billing/Payment)
 * @see Task 47 — Billing and Payment Integration
 */

import type { DomainResult } from '@core/utils';

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

/**
 * Payment method types supported by the gateway.
 */
export type PaymentMethodType =
  | 'CREDIT_CARD'
  | 'DEBIT_CARD'
  | 'BANK_TRANSFER'
  | 'E_WALLET'
  | 'VIRTUAL_ACCOUNT'
  | 'QR_CODE';

/**
 * Status of a payment transaction from the gateway.
 */
export type GatewayPaymentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

/**
 * Currency codes (ISO 4217).
 */
export type CurrencyCode = 'IDR' | 'USD';

// ---------------------------------------------------------------------------
// Request/Response types
// ---------------------------------------------------------------------------

/**
 * Request to initiate a payment through the gateway.
 */
export interface InitiatePaymentRequest {
  /** Unique identifier for this payment request (idempotency key) */
  readonly orderId: string;
  /** Total amount to charge */
  readonly amount: number;
  /** Currency code */
  readonly currency: CurrencyCode;
  /** Description shown to customer */
  readonly description: string;
  /** Customer details */
  readonly customer: {
    readonly id: string;
    readonly email: string;
    readonly name: string;
    readonly phone?: string;
  };
  /** Metadata for internal tracking */
  readonly metadata?: {
    readonly tenantId: string;
    readonly invoiceId: string;
    readonly planName: string;
    readonly billingPeriod: string;
  };
  /** URL to redirect after payment completion (for redirect-based flows) */
  readonly redirectUrl?: string;
  /** URL for webhook callbacks */
  readonly callbackUrl?: string;
  /** Optional: specific payment method to use */
  readonly paymentMethod?: PaymentMethodType;
  /** Expiration time in minutes (default: 24 hours) */
  readonly expiresInMinutes?: number;
}

/**
 * Response from initiating a payment.
 */
export interface InitiatePaymentResponse {
  /** Gateway's transaction ID */
  readonly gatewayTransactionId: string;
  /** Our order ID (echoed back) */
  readonly orderId: string;
  /** Current status of the payment */
  readonly status: GatewayPaymentStatus;
  /** URL for customer to complete payment (if redirect-based) */
  readonly paymentUrl?: string;
  /** QR code data (for QR-based payments) */
  readonly qrCodeData?: string;
  /** Virtual account number (for bank transfer) */
  readonly virtualAccountNumber?: string;
  /** Expiration timestamp */
  readonly expiresAt: Date;
  /** Raw response from gateway (for debugging/reconciliation) */
  readonly rawResponse: Record<string, unknown>;
}

/**
 * Request to check payment status.
 */
export interface GetPaymentStatusRequest {
  /** Gateway's transaction ID or our order ID */
  readonly transactionId: string;
  /** Whether transactionId is the gateway ID (true) or our order ID (false) */
  readonly isGatewayId?: boolean;
}

/**
 * Response from payment status query.
 */
export interface GetPaymentStatusResponse {
  /** Gateway's transaction ID */
  readonly gatewayTransactionId: string;
  /** Our order ID */
  readonly orderId: string;
  /** Current status */
  readonly status: GatewayPaymentStatus;
  /** Amount charged */
  readonly amount: number;
  /** Currency */
  readonly currency: CurrencyCode;
  /** When the payment was completed (if COMPLETED) */
  readonly paidAt?: Date;
  /** Failure reason (if FAILED) */
  readonly failureReason?: string;
  /** Payment method used */
  readonly paymentMethod?: PaymentMethodType;
  /** Raw response from gateway */
  readonly rawResponse: Record<string, unknown>;
}

/**
 * Request to refund a payment.
 */
export interface RefundPaymentRequest {
  /** Gateway's transaction ID of the original payment */
  readonly gatewayTransactionId: string;
  /** Amount to refund (omit for full refund) */
  readonly amount?: number;
  /** Reason for refund (for records) */
  readonly reason: string;
  /** Unique key to prevent duplicate refunds */
  readonly idempotencyKey: string;
}

/**
 * Response from refund request.
 */
export interface RefundPaymentResponse {
  /** Gateway's refund transaction ID */
  readonly refundTransactionId: string;
  /** Original transaction ID */
  readonly originalTransactionId: string;
  /** Amount refunded */
  readonly amountRefunded: number;
  /** Whether this was a partial or full refund */
  readonly isPartialRefund: boolean;
  /** Current status of the refund */
  readonly status: 'PENDING' | 'COMPLETED' | 'FAILED';
  /** Raw response from gateway */
  readonly rawResponse: Record<string, unknown>;
}

/**
 * Webhook payload signature verification request.
 */
export interface VerifyWebhookRequest {
  /** Raw payload body */
  readonly payload: string;
  /** Signature from webhook header */
  readonly signature: string;
  /** Timestamp from webhook header (if provided) */
  readonly timestamp?: string;
}

// ---------------------------------------------------------------------------
// Protocol Interface
// ---------------------------------------------------------------------------

/**
 * PaymentGatewayProtocol — Abstraction for payment gateway operations.
 *
 * Implementations must be stateless and handle their own authentication
 * with the underlying payment provider.
 */
export interface PaymentGatewayProtocol {
  /**
   * Get the provider name for logging/audit purposes.
   */
  readonly providerName: string;

  /**
   * Initiate a new payment transaction.
   *
   * @param request - Payment initiation parameters
   * @returns Payment URL/details for customer to complete payment
   */
  initiatePayment(
    request: InitiatePaymentRequest,
  ): Promise<DomainResult<InitiatePaymentResponse>>;

  /**
   * Query the status of an existing payment.
   *
   * @param request - Transaction identifier
   * @returns Current payment status and details
   */
  getPaymentStatus(
    request: GetPaymentStatusRequest,
  ): Promise<DomainResult<GetPaymentStatusResponse>>;

  /**
   * Process a refund for a completed payment.
   *
   * @param request - Refund parameters
   * @returns Refund confirmation
   */
  refundPayment(
    request: RefundPaymentRequest,
  ): Promise<DomainResult<RefundPaymentResponse>>;

  /**
   * Verify webhook signature authenticity.
   *
   * @param request - Webhook verification parameters
   * @returns true if signature is valid
   */
  verifyWebhookSignature(request: VerifyWebhookRequest): boolean;

  /**
   * Parse webhook payload into standardized format.
   *
   * @param payload - Raw webhook payload
   * @returns Standardized payment status response
   */
  parseWebhookPayload(
    payload: Record<string, unknown>,
  ): DomainResult<GetPaymentStatusResponse>;
}
