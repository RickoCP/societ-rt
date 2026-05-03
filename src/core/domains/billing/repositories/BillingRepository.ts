/**
 * BillingRepository — Core repository interface for billing operations
 * (invoices, subscription plans, payment reconciliation).
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure layer provides the concrete implementation.
 *
 * @see Requirements 16.1, 16.2, 16.6, 29.1
 */

import type { DomainResult } from '@core/utils';
import type {
  Invoice,
  InvoiceStatus,
  CreateInvoiceInput,
  SubscriptionPlan,
  PaymentReconciliation,
  CreateReconciliationInput,
} from '../entities';

export interface BillingRepository {
  /** Create a new invoice for a tenant. */
  createInvoice(
    tenantId: string,
    data: CreateInvoiceInput,
  ): Promise<DomainResult<Invoice>>;

  /** Update the status of an existing invoice. */
  updateInvoiceStatus(
    tenantId: string,
    invoiceId: string,
    status: InvoiceStatus,
    gatewayTransactionId?: string,
    paidAt?: Date,
  ): Promise<DomainResult<Invoice>>;

  /** Find all invoices for a tenant, optionally filtered by status. */
  findInvoicesByTenant(
    tenantId: string,
    status?: InvoiceStatus,
  ): Promise<DomainResult<Invoice[]>>;

  /** Get the active subscription plan for a tenant. */
  getActivePlan(tenantId: string): Promise<DomainResult<SubscriptionPlan>>;

  /** Change the subscription plan for a tenant. */
  changePlan(
    tenantId: string,
    planName: string,
  ): Promise<DomainResult<void>>;

  /** Find an invoice by its idempotency key. */
  findInvoiceByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<DomainResult<Invoice | null>>;

  /** Increment the retry count for a failed invoice. */
  incrementRetryCount(
    tenantId: string,
    invoiceId: string,
  ): Promise<DomainResult<Invoice>>;

  /** Create a payment reconciliation record. */
  createReconciliation(
    data: CreateReconciliationInput,
  ): Promise<DomainResult<PaymentReconciliation>>;

  /** Count the number of active users in a tenant. */
  countTenantUsers(tenantId: string): Promise<DomainResult<number>>;

  /** Get all available subscription plans. */
  getAllPlans(): Promise<DomainResult<SubscriptionPlan[]>>;
}
