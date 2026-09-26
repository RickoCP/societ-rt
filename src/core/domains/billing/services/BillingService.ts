/**
 * BillingService — Core domain service for billing and payment integration.
 *
 * Manages:
 * - Invoice generation based on subscription plan
 * - Payment status tracking and transitions
 * - Integration with SubscriptionStatusService for status changes
 *
 * This is a factory function (DI-friendly) following Clean Architecture.
 *
 * NOTE: This implementation works with the current Invoice schema.
 * Enhanced features (subscriptionId, billingCycle, overdueAt) require
 * a Prisma schema migration.
 *
 * @see Requirements 57 (Billing/Payment)
 * @see Task 47 — Billing and Payment Integration
 */

import type { DomainResult } from '@core/utils';
import { ok, fail, businessError } from '@core/utils';
import type { AuthContext, AuditQueueProtocol } from '@core/protocols';
import type {
  PaymentGatewayProtocol,
  InitiatePaymentRequest,
} from '@core/protocols';
import type { Invoice, InvoiceStatus, CreateInvoiceInput, UpdateInvoiceInput } from '../entities';
import type { BillingRepository } from '../repositories';
import type { ISubscriptionStatusService } from '@core/domains/subscription/services';
import type { ISubscriptionPlanRepository } from '@core/domains/subscription/repositories';
import { SubscriptionStatus } from '@core/domains/subscription/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_INTERVAL_HOURS = 24;

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * Result of invoice generation.
 */
export interface GenerateInvoiceResult {
  readonly invoice: Invoice;
  readonly isNewInvoice: boolean;
}

/**
 * Result of payment processing.
 */
export interface ProcessPaymentResult {
  readonly invoice: Invoice;
  readonly gatewayTransactionId: string;
  readonly paymentUrl?: string;
  readonly status: 'INITIATED' | 'COMPLETED' | 'FAILED';
}

/**
 * Result of payment status sync.
 */
export interface PaymentStatusSyncResult {
  readonly invoice: Invoice;
  readonly previousStatus: InvoiceStatus;
  readonly newStatus: InvoiceStatus;
  readonly subscriptionStatusChanged: boolean;
}

export interface IBillingService {
  /**
   * Generate an invoice for a tenant.
   * Uses idempotency key to prevent duplicate invoices.
   */
  generateInvoice(params: {
    authContext: AuthContext;
    tenantId: string;
    data: CreateInvoiceInput;
  }): Promise<DomainResult<GenerateInvoiceResult>>;

  /**
   * Initiate payment for an invoice through the payment gateway.
   */
  initiatePayment(params: {
    authContext: AuthContext;
    invoiceId: string;
    redirectUrl?: string;
  }): Promise<DomainResult<ProcessPaymentResult>>;

  /**
   * Sync payment status from gateway and update invoice.
   */
  syncPaymentStatus(params: {
    authContext: AuthContext;
    invoiceId: string;
  }): Promise<DomainResult<PaymentStatusSyncResult>>;

  /**
   * Process payment completion (called from webhook).
   */
  handlePaymentCompleted(params: {
    tenantId: string;
    invoiceId: string;
    gatewayTransactionId: string;
    paidAt: Date;
  }): Promise<DomainResult<PaymentStatusSyncResult>>;

  /**
   * Process payment failure (called from webhook).
   */
  handlePaymentFailed(params: {
    tenantId: string;
    invoiceId: string;
    gatewayTransactionId: string;
    failureReason?: string;
  }): Promise<DomainResult<PaymentStatusSyncResult>>;

  /**
   * Retry failed payment for an invoice.
   */
  retryFailedPayment(params: {
    authContext: AuthContext;
    invoiceId: string;
  }): Promise<DomainResult<ProcessPaymentResult>>;

  /**
   * Get invoice by ID.
   */
  getInvoice(params: {
    authContext: AuthContext;
    invoiceId: string;
  }): Promise<DomainResult<Invoice>>;

  /**
   * List invoices for a tenant.
   */
  listInvoices(params: {
    authContext: AuthContext;
    status?: InvoiceStatus;
  }): Promise<DomainResult<Invoice[]>>;
}

// ---------------------------------------------------------------------------
// Service Implementation
// ---------------------------------------------------------------------------

export interface BillingServiceDeps {
  billingRepository: BillingRepository;
  subscriptionPlanRepository: ISubscriptionPlanRepository;
  subscriptionStatusService: ISubscriptionStatusService;
  paymentGatewayProtocol: PaymentGatewayProtocol;
  auditQueueProtocol: AuditQueueProtocol;
}

export function createBillingService(deps: BillingServiceDeps): IBillingService {
  const {
    billingRepository,
    subscriptionStatusService,
    paymentGatewayProtocol,
    auditQueueProtocol,
  } = deps;

  /**
   * Audit helper.
   */
  function logAudit(
    tenantId: string,
    userId: string,
    actionType: string,
    resourceId: string,
    details: Record<string, unknown>,
  ): void {
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId: userId,
        actionType,
        resourceType: 'invoice',
        resourceId,
        details,
      })
      .catch(() => {
        /* audit must not block */
      });
  }

  /**
   * Update subscription status based on payment events.
   */
  async function updateSubscriptionStatusForPayment(
    tenantId: string,
    paymentSuccess: boolean,
    reason: string,
  ): Promise<{ changed: boolean }> {
    const subResult = await subscriptionStatusService.getSubscriptionByTenantId(tenantId);
    if (!subResult.success || !subResult.data) {
      return { changed: false };
    }

    const subscription = subResult.data;
    const currentStatus = subscription.status;

    if (paymentSuccess) {
      // Payment success: reactivate if PAST_DUE or SUSPENDED
      if (
        currentStatus === SubscriptionStatus.PAST_DUE ||
        currentStatus === SubscriptionStatus.SUSPENDED
      ) {
        const transResult = await subscriptionStatusService.transitionStatusByTenantId(
          tenantId,
          SubscriptionStatus.ACTIVE,
          `Payment received: ${reason}`,
          'system',
          true,
        );
        return { changed: transResult.success };
      }
    } else {
      // Payment failed: transition based on current state
      if (currentStatus === SubscriptionStatus.ACTIVE) {
        const transResult = await subscriptionStatusService.transitionStatusByTenantId(
          tenantId,
          SubscriptionStatus.PAST_DUE,
          `Payment failed: ${reason}`,
          'system',
          true,
        );
        return { changed: transResult.success };
      }
    }

    return { changed: false };
  }

  return {
    async generateInvoice(params): Promise<DomainResult<GenerateInvoiceResult>> {
      const { authContext, tenantId, data } = params;

      // Check for existing invoice (idempotency)
      const existingResult = await billingRepository.findInvoiceByIdempotencyKey(
        data.idempotencyKey,
      );
      if (!existingResult.success) {
        return fail(existingResult.error);
      }
      if (existingResult.data) {
        return ok({
          invoice: existingResult.data,
          isNewInvoice: false,
        });
      }

      // Create invoice
      const createResult = await billingRepository.createInvoice(tenantId, data);
      if (!createResult.success) {
        return fail(createResult.error);
      }

      const invoice = createResult.data;

      // Audit log
      logAudit(tenantId, authContext.userId, 'invoice_generated', invoice.id, {
        planName: invoice.planName,
        amount: invoice.amount,
        idempotencyKey: invoice.idempotencyKey,
      });

      return ok({
        invoice,
        isNewInvoice: true,
      });
    },

    async initiatePayment(params): Promise<DomainResult<ProcessPaymentResult>> {
      const { authContext, invoiceId, redirectUrl } = params;

      // Get all invoices for tenant and find the specific one
      const invoicesResult = await billingRepository.findInvoicesByTenant(authContext.tenantId);
      if (!invoicesResult.success) {
        return fail(invoicesResult.error);
      }

      const invoice = invoicesResult.data.find(inv => inv.id === invoiceId);
      if (!invoice) {
        return fail(businessError('BILLING_INVOICE_NOT_FOUND', 'Invoice not found'));
      }

      // Validate invoice can be paid
      if (invoice.status === 'paid') {
        return fail(businessError('BILLING_INVOICE_ALREADY_PAID', 'Invoice already paid'));
      }

      // Prepare payment request
      const paymentRequest: InitiatePaymentRequest = {
        orderId: invoice.id,
        amount: invoice.amount,
        currency: 'IDR',
        description: `Invoice for ${invoice.planName}`,
        customer: {
          id: authContext.userId,
          email: '',
          name: '',
        },
        metadata: {
          tenantId: authContext.tenantId,
          invoiceId: invoice.id,
          planName: invoice.planName,
          billingPeriod: `${invoice.billingPeriodStart.toISOString()}-${invoice.billingPeriodEnd.toISOString()}`,
        },
        redirectUrl,
        expiresInMinutes: 24 * 60,
      };

      // Initiate payment with gateway
      const gatewayResult = await paymentGatewayProtocol.initiatePayment(paymentRequest);
      if (!gatewayResult.success) {
        return fail(gatewayResult.error);
      }

      const gatewayResponse = gatewayResult.data;

      // Update invoice with gateway transaction ID
      const updateResult = await billingRepository.updateInvoiceStatus(
        authContext.tenantId,
        invoiceId,
        invoice.status,
        gatewayResponse.gatewayTransactionId,
      );
      if (!updateResult.success) {
        return fail(updateResult.error);
      }

      // Audit log
      logAudit(
        authContext.tenantId,
        authContext.userId,
        'payment_initiated',
        invoice.id,
        {
          gatewayTransactionId: gatewayResponse.gatewayTransactionId,
          amount: invoice.amount,
          provider: paymentGatewayProtocol.providerName,
        },
      );

      return ok({
        invoice: updateResult.data,
        gatewayTransactionId: gatewayResponse.gatewayTransactionId,
        paymentUrl: gatewayResponse.paymentUrl,
        status: 'INITIATED',
      });
    },

    async syncPaymentStatus(params): Promise<DomainResult<PaymentStatusSyncResult>> {
      const { authContext, invoiceId } = params;

      // Get invoice
      const invoicesResult = await billingRepository.findInvoicesByTenant(authContext.tenantId);
      if (!invoicesResult.success) {
        return fail(invoicesResult.error);
      }

      const invoice = invoicesResult.data.find(inv => inv.id === invoiceId);
      if (!invoice) {
        return fail(businessError('BILLING_INVOICE_NOT_FOUND', 'Invoice not found'));
      }

      const previousStatus = invoice.status;

      if (!invoice.gatewayTransactionId) {
        return fail(businessError(
          'BILLING_NO_TRANSACTION',
          'No payment transaction for this invoice',
        ));
      }

      // Query gateway for status
      const statusResult = await paymentGatewayProtocol.getPaymentStatus({
        transactionId: invoice.gatewayTransactionId,
        isGatewayId: true,
      });
      if (!statusResult.success) {
        return fail(statusResult.error);
      }

      const gatewayStatus = statusResult.data;
      let newStatus: InvoiceStatus = previousStatus;
      let subscriptionStatusChanged = false;

      // Map gateway status to invoice status
      if (gatewayStatus.status === 'COMPLETED') {
        newStatus = 'paid';
      } else if (gatewayStatus.status === 'FAILED' || gatewayStatus.status === 'CANCELLED' || gatewayStatus.status === 'EXPIRED') {
        newStatus = 'failed';
      }

      // Update if status changed
      if (newStatus !== previousStatus) {
        const updateResult = await billingRepository.updateInvoiceStatus(
          authContext.tenantId,
          invoiceId,
          newStatus,
          invoice.gatewayTransactionId,
          gatewayStatus.paidAt,
        );
        if (!updateResult.success) {
          return fail(updateResult.error);
        }

        // Update subscription status if needed
        if (newStatus === 'paid') {
          const subUpdate = await updateSubscriptionStatusForPayment(
            authContext.tenantId,
            true,
            `Invoice ${invoiceId} paid`,
          );
          subscriptionStatusChanged = subUpdate.changed;
        } else if (newStatus === 'failed') {
          const subUpdate = await updateSubscriptionStatusForPayment(
            authContext.tenantId,
            false,
            `Invoice ${invoiceId} payment failed`,
          );
          subscriptionStatusChanged = subUpdate.changed;
        }

        return ok({
          invoice: updateResult.data,
          previousStatus,
          newStatus,
          subscriptionStatusChanged,
        });
      }

      return ok({
        invoice,
        previousStatus,
        newStatus: previousStatus,
        subscriptionStatusChanged: false,
      });
    },

    async handlePaymentCompleted(params): Promise<DomainResult<PaymentStatusSyncResult>> {
      const { tenantId, invoiceId, gatewayTransactionId, paidAt } = params;

      // Get invoice
      const invoicesResult = await billingRepository.findInvoicesByTenant(tenantId);
      if (!invoicesResult.success) {
        return fail(invoicesResult.error);
      }

      const invoice = invoicesResult.data.find(inv => inv.id === invoiceId);
      if (!invoice) {
        return fail(businessError(
          'BILLING_INVOICE_NOT_FOUND',
          `Invoice not found: ${invoiceId}`,
        ));
      }

      const previousStatus = invoice.status;

      // Update invoice to paid
      const updateResult = await billingRepository.updateInvoiceStatus(
        tenantId,
        invoiceId,
        'paid',
        gatewayTransactionId,
        paidAt,
      );
      if (!updateResult.success) {
        return fail(updateResult.error);
      }

      // Update subscription status
      const subUpdate = await updateSubscriptionStatusForPayment(
        tenantId,
        true,
        'Payment received via webhook',
      );

      // Audit log
      logAudit(tenantId, 'system', 'payment_completed', invoiceId, {
        gatewayTransactionId,
        paidAt: paidAt.toISOString(),
        previousStatus,
      });

      return ok({
        invoice: updateResult.data,
        previousStatus,
        newStatus: 'paid',
        subscriptionStatusChanged: subUpdate.changed,
      });
    },

    async handlePaymentFailed(params): Promise<DomainResult<PaymentStatusSyncResult>> {
      const { tenantId, invoiceId, gatewayTransactionId, failureReason } = params;

      // Get invoice
      const invoicesResult = await billingRepository.findInvoicesByTenant(tenantId);
      if (!invoicesResult.success) {
        return fail(invoicesResult.error);
      }

      const invoice = invoicesResult.data.find(inv => inv.id === invoiceId);
      if (!invoice) {
        return fail(businessError(
          'BILLING_INVOICE_NOT_FOUND',
          `Invoice not found: ${invoiceId}`,
        ));
      }

      const previousStatus = invoice.status;

      // Update invoice to failed
      const updateResult = await billingRepository.updateInvoiceStatus(
        tenantId,
        invoiceId,
        'failed',
        gatewayTransactionId,
      );
      if (!updateResult.success) {
        return fail(updateResult.error);
      }

      // Update subscription status
      const subUpdate = await updateSubscriptionStatusForPayment(
        tenantId,
        false,
        failureReason || 'Payment failed',
      );

      // Audit log
      logAudit(tenantId, 'system', 'payment_failed', invoiceId, {
        gatewayTransactionId,
        failureReason,
        previousStatus,
      });

      return ok({
        invoice: updateResult.data,
        previousStatus,
        newStatus: 'failed',
        subscriptionStatusChanged: subUpdate.changed,
      });
    },

    async retryFailedPayment(params): Promise<DomainResult<ProcessPaymentResult>> {
      const { authContext, invoiceId } = params;

      // Get invoice
      const invoicesResult = await billingRepository.findInvoicesByTenant(authContext.tenantId);
      if (!invoicesResult.success) {
        return fail(invoicesResult.error);
      }

      const invoice = invoicesResult.data.find(inv => inv.id === invoiceId);
      if (!invoice) {
        return fail(businessError('BILLING_INVOICE_NOT_FOUND', 'Invoice not found'));
      }

      // Validate can retry
      if (invoice.status !== 'failed') {
        return fail(businessError(
          'BILLING_CANNOT_RETRY',
          `Cannot retry invoice with status ${invoice.status}`,
        ));
      }
      if (invoice.retryCount >= DEFAULT_MAX_RETRIES) {
        return fail(businessError(
          'BILLING_MAX_RETRIES_EXCEEDED',
          `Maximum retry attempts (${DEFAULT_MAX_RETRIES}) exceeded`,
        ));
      }

      // Increment retry count
      await billingRepository.incrementRetryCount(authContext.tenantId, invoiceId);

      // Initiate new payment
      return this.initiatePayment({
        authContext,
        invoiceId,
      });
    },

    async getInvoice(params): Promise<DomainResult<Invoice>> {
      const { authContext, invoiceId } = params;

      const invoicesResult = await billingRepository.findInvoicesByTenant(authContext.tenantId);
      if (!invoicesResult.success) {
        return fail(invoicesResult.error);
      }

      const invoice = invoicesResult.data.find(inv => inv.id === invoiceId);
      if (!invoice) {
        return fail(businessError('BILLING_INVOICE_NOT_FOUND', 'Invoice not found'));
      }

      return ok(invoice);
    },

    async listInvoices(params): Promise<DomainResult<Invoice[]>> {
      const { authContext, status } = params;

      return billingRepository.findInvoicesByTenant(authContext.tenantId, status);
    },
  };
}
