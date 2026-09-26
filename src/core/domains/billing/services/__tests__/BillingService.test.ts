/**
 * BillingService Unit Tests
 *
 * Tests invoice generation, payment status tracking, and subscription status integration.
 *
 * @see Requirements 57 (Billing/Payment)
 * @see Task 47 — Billing and Payment Integration
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { createBillingService, type IBillingService } from '../BillingService';
import type { BillingRepository } from '../../repositories';
import type { ISubscriptionStatusService } from '@core/domains/subscription/services';
import type { ISubscriptionPlanRepository } from '@core/domains/subscription/repositories';
import type { PaymentGatewayProtocol, AuthContext, AuditQueueProtocol } from '@core/protocols';
import type { Invoice, InvoiceStatus, CreateInvoiceInput } from '../../entities';
import type { Subscription } from '@core/domains/subscription/entities';
import { ok, fail, businessError } from '@core/utils';
import { SubscriptionStatus } from '@core/domains/subscription/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockBillingRepository(): BillingRepository {
  return {
    createInvoice: vi.fn(),
    updateInvoiceStatus: vi.fn(),
    findInvoicesByTenant: vi.fn(),
    getActivePlan: vi.fn(),
    changePlan: vi.fn(),
    findInvoiceByIdempotencyKey: vi.fn(),
    incrementRetryCount: vi.fn(),
    createReconciliation: vi.fn(),
    countTenantUsers: vi.fn(),
    getAllPlans: vi.fn(),
  };
}

function createMockSubscriptionStatusService(): ISubscriptionStatusService {
  return {
    createSubscription: vi.fn(),
    getSubscriptionById: vi.fn(),
    getSubscriptionByTenantId: vi.fn(),
    listSubscriptions: vi.fn(),
    transitionStatus: vi.fn(),
    transitionStatusByTenantId: vi.fn(),
    changePlan: vi.fn(),
    getStatusHistory: vi.fn(),
    canTransition: vi.fn(),
    getAllowedTransitions: vi.fn(),
    isOperational: vi.fn(),
    isRestricted: vi.fn(),
    isTerminal: vi.fn(),
  };
}

function createMockSubscriptionPlanRepository(): ISubscriptionPlanRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByName: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    countSubscribers: vi.fn(),
    isNameUnique: vi.fn(),
  };
}

function createMockPaymentGateway(): PaymentGatewayProtocol {
  return {
    providerName: 'MockGateway',
    initiatePayment: vi.fn(),
    getPaymentStatus: vi.fn(),
    refundPayment: vi.fn(),
    verifyWebhookSignature: vi.fn(),
    parseWebhookPayload: vi.fn(),
  };
}

function createMockAuditQueueProtocol(): AuditQueueProtocol {
  return {
    enqueueAudit: vi.fn().mockResolvedValue(undefined),
  };
}

function createAuthContext(overrides?: Partial<AuthContext>): AuthContext {
  return {
    userId: 'user-123',
    tenantId: 'tenant-123',
    role: 'RESIDENT',
    permissions: [],
    ...overrides,
  };
}

function createMockSubscription(overrides?: Partial<Subscription>): Subscription {
  return {
    id: 'sub-123',
    tenantId: 'tenant-123',
    planId: 'plan-123',
    status: SubscriptionStatus.ACTIVE,
    startedAt: new Date('2024-01-01'),
    currentPeriodEnd: new Date('2024-02-01'),
    trialEndsAt: null,
    suspendedAt: null,
    closedAt: null,
    statusReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockInvoice(overrides?: Partial<Invoice>): Invoice {
  return {
    id: 'invoice-123',
    tenantId: 'tenant-123',
    planName: 'Pro',
    amount: 100000,
    billingPeriodStart: new Date('2024-01-01'),
    billingPeriodEnd: new Date('2024-02-01'),
    dueDate: new Date('2024-01-15'),
    status: 'pending',
    gatewayTransactionId: null,
    paidAt: null,
    retryCount: 0,
    idempotencyKey: 'idempotency-key-123',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('BillingService', () => {
  let billingService: IBillingService;
  let billingRepository: BillingRepository;
  let subscriptionStatusService: ISubscriptionStatusService;
  let subscriptionPlanRepository: ISubscriptionPlanRepository;
  let paymentGateway: PaymentGatewayProtocol;
  let auditQueueProtocol: AuditQueueProtocol;

  beforeEach(() => {
    billingRepository = createMockBillingRepository();
    subscriptionStatusService = createMockSubscriptionStatusService();
    subscriptionPlanRepository = createMockSubscriptionPlanRepository();
    paymentGateway = createMockPaymentGateway();
    auditQueueProtocol = createMockAuditQueueProtocol();

    billingService = createBillingService({
      billingRepository,
      subscriptionStatusService,
      subscriptionPlanRepository,
      paymentGatewayProtocol: paymentGateway,
      auditQueueProtocol,
    });
  });

  describe('generateInvoice', () => {
    it('should generate a new invoice for a tenant', async () => {
      const authContext = createAuthContext();
      const createInput: CreateInvoiceInput = {
        planName: 'Pro',
        amount: 100000,
        billingPeriodStart: new Date('2024-01-01'),
        billingPeriodEnd: new Date('2024-02-01'),
        dueDate: new Date('2024-01-15'),
        idempotencyKey: 'idempotency-key-123',
      };
      const createdInvoice = createMockInvoice();

      (billingRepository.findInvoiceByIdempotencyKey as Mock).mockResolvedValue(ok(null));
      (billingRepository.createInvoice as Mock).mockResolvedValue(ok(createdInvoice));

      const result = await billingService.generateInvoice({
        authContext,
        tenantId: 'tenant-123',
        data: createInput,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isNewInvoice).toBe(true);
        expect(result.data.invoice).toBeDefined();
        expect(result.data.invoice.id).toBe('invoice-123');
      }
      expect(billingRepository.createInvoice).toHaveBeenCalledWith('tenant-123', createInput);
    });

    it('should return existing invoice for duplicate request (idempotency)', async () => {
      const authContext = createAuthContext();
      const existingInvoice = createMockInvoice();
      const createInput: CreateInvoiceInput = {
        planName: 'Pro',
        amount: 100000,
        billingPeriodStart: new Date('2024-01-01'),
        billingPeriodEnd: new Date('2024-02-01'),
        dueDate: new Date('2024-01-15'),
        idempotencyKey: 'idempotency-key-123',
      };

      (billingRepository.findInvoiceByIdempotencyKey as Mock).mockResolvedValue(ok(existingInvoice));

      const result = await billingService.generateInvoice({
        authContext,
        tenantId: 'tenant-123',
        data: createInput,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isNewInvoice).toBe(false);
        expect(result.data.invoice.id).toBe(existingInvoice.id);
      }
      expect(billingRepository.createInvoice).not.toHaveBeenCalled();
    });
  });

  describe('initiatePayment', () => {
    it('should initiate payment for a pending invoice', async () => {
      const authContext = createAuthContext();
      const invoice = createMockInvoice({ status: 'pending' });
      const gatewayResponse = {
        gatewayTransactionId: 'gateway-txn-123',
        orderId: 'invoice-123',
        status: 'PENDING' as const,
        paymentUrl: 'https://pay.example.com/pay/gateway-txn-123',
        expiresAt: new Date(),
        rawResponse: {},
      };
      const updatedInvoice = { ...invoice, gatewayTransactionId: 'gateway-txn-123' };

      (billingRepository.findInvoicesByTenant as Mock).mockResolvedValue(ok([invoice]));
      (paymentGateway.initiatePayment as Mock).mockResolvedValue(ok(gatewayResponse));
      (billingRepository.updateInvoiceStatus as Mock).mockResolvedValue(ok(updatedInvoice));

      const result = await billingService.initiatePayment({
        authContext,
        invoiceId: 'invoice-123',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.gatewayTransactionId).toBe('gateway-txn-123');
        expect(result.data.status).toBe('INITIATED');
        expect(result.data.paymentUrl).toBe('https://pay.example.com/pay/gateway-txn-123');
      }
    });

    it('should fail if invoice is already paid', async () => {
      const authContext = createAuthContext();
      const invoice = createMockInvoice({ status: 'paid' });

      (billingRepository.findInvoicesByTenant as Mock).mockResolvedValue(ok([invoice]));

      const result = await billingService.initiatePayment({
        authContext,
        invoiceId: 'invoice-123',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('BILLING_INVOICE_ALREADY_PAID');
      }
    });

    it('should fail if invoice not found', async () => {
      const authContext = createAuthContext();

      (billingRepository.findInvoicesByTenant as Mock).mockResolvedValue(ok([]));

      const result = await billingService.initiatePayment({
        authContext,
        invoiceId: 'invoice-123',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('BILLING_INVOICE_NOT_FOUND');
      }
    });
  });

  describe('syncPaymentStatus', () => {
    it('should sync payment status from gateway and update invoice', async () => {
      const authContext = createAuthContext();
      const invoice = createMockInvoice({
        status: 'pending',
        gatewayTransactionId: 'gateway-txn-123',
      });
      const gatewayStatus = {
        transactionId: 'gateway-txn-123',
        orderId: 'invoice-123',
        status: 'COMPLETED' as const,
        amount: 100000,
        currency: 'IDR',
        paidAt: new Date(),
        rawResponse: {},
      };
      const updatedInvoice = { ...invoice, status: 'paid' as InvoiceStatus };
      const subscription = createMockSubscription({ status: SubscriptionStatus.PAST_DUE });

      (billingRepository.findInvoicesByTenant as Mock).mockResolvedValue(ok([invoice]));
      (paymentGateway.getPaymentStatus as Mock).mockResolvedValue(ok(gatewayStatus));
      (billingRepository.updateInvoiceStatus as Mock).mockResolvedValue(ok(updatedInvoice));
      (subscriptionStatusService.getSubscriptionByTenantId as Mock).mockResolvedValue(
        ok(subscription),
      );
      (subscriptionStatusService.transitionStatusByTenantId as Mock).mockResolvedValue(
        ok({ ...subscription, status: SubscriptionStatus.ACTIVE }),
      );

      const result = await billingService.syncPaymentStatus({
        authContext,
        invoiceId: 'invoice-123',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.previousStatus).toBe('pending');
        expect(result.data.newStatus).toBe('paid');
        expect(result.data.subscriptionStatusChanged).toBe(true);
      }
    });

    it('should fail if invoice has no gateway transaction', async () => {
      const authContext = createAuthContext();
      const invoice = createMockInvoice({
        status: 'pending',
        gatewayTransactionId: null,
      });

      (billingRepository.findInvoicesByTenant as Mock).mockResolvedValue(ok([invoice]));

      const result = await billingService.syncPaymentStatus({
        authContext,
        invoiceId: 'invoice-123',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('BILLING_NO_TRANSACTION');
      }
    });
  });

  describe('handlePaymentCompleted', () => {
    it('should update invoice to paid and reactivate subscription if PAST_DUE', async () => {
      const invoice = createMockInvoice({
        status: 'pending',
        gatewayTransactionId: 'gateway-txn-123',
      });
      const paidInvoice = { ...invoice, status: 'paid' as InvoiceStatus, paidAt: new Date() };
      const subscription = createMockSubscription({ status: SubscriptionStatus.PAST_DUE });

      (billingRepository.findInvoicesByTenant as Mock).mockResolvedValue(ok([invoice]));
      (billingRepository.updateInvoiceStatus as Mock).mockResolvedValue(ok(paidInvoice));
      (subscriptionStatusService.getSubscriptionByTenantId as Mock).mockResolvedValue(
        ok(subscription),
      );
      (subscriptionStatusService.transitionStatusByTenantId as Mock).mockResolvedValue(
        ok({ ...subscription, status: SubscriptionStatus.ACTIVE }),
      );

      const result = await billingService.handlePaymentCompleted({
        tenantId: 'tenant-123',
        invoiceId: 'invoice-123',
        gatewayTransactionId: 'gateway-txn-123',
        paidAt: new Date(),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.newStatus).toBe('paid');
        expect(result.data.subscriptionStatusChanged).toBe(true);
      }
      expect(subscriptionStatusService.transitionStatusByTenantId).toHaveBeenCalledWith(
        'tenant-123',
        SubscriptionStatus.ACTIVE,
        expect.any(String),
        'system',
        true,
      );
    });
  });

  describe('handlePaymentFailed', () => {
    it('should update invoice to failed and transition subscription to PAST_DUE', async () => {
      const invoice = createMockInvoice({
        status: 'pending',
        gatewayTransactionId: 'gateway-txn-123',
      });
      const failedInvoice = { ...invoice, status: 'failed' as InvoiceStatus };
      const subscription = createMockSubscription({ status: SubscriptionStatus.ACTIVE });

      (billingRepository.findInvoicesByTenant as Mock).mockResolvedValue(ok([invoice]));
      (billingRepository.updateInvoiceStatus as Mock).mockResolvedValue(ok(failedInvoice));
      (subscriptionStatusService.getSubscriptionByTenantId as Mock).mockResolvedValue(
        ok(subscription),
      );
      (subscriptionStatusService.transitionStatusByTenantId as Mock).mockResolvedValue(
        ok({ ...subscription, status: SubscriptionStatus.PAST_DUE }),
      );

      const result = await billingService.handlePaymentFailed({
        tenantId: 'tenant-123',
        invoiceId: 'invoice-123',
        gatewayTransactionId: 'gateway-txn-123',
        failureReason: 'Insufficient funds',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.newStatus).toBe('failed');
        expect(result.data.subscriptionStatusChanged).toBe(true);
      }
      expect(subscriptionStatusService.transitionStatusByTenantId).toHaveBeenCalledWith(
        'tenant-123',
        SubscriptionStatus.PAST_DUE,
        expect.stringContaining('Payment failed'),
        'system',
        true,
      );
    });
  });

  describe('retryFailedPayment', () => {
    it('should retry payment for a failed invoice', async () => {
      const authContext = createAuthContext();
      const failedInvoice = createMockInvoice({
        status: 'failed',
        retryCount: 1,
      });
      const retriedInvoice = { ...failedInvoice, retryCount: 2 };
      const gatewayResponse = {
        gatewayTransactionId: 'gateway-txn-456',
        orderId: 'invoice-123',
        status: 'PENDING' as const,
        paymentUrl: 'https://pay.example.com/pay/gateway-txn-456',
        expiresAt: new Date(),
        rawResponse: {},
      };
      const updatedInvoice = { ...retriedInvoice, gatewayTransactionId: 'gateway-txn-456' };

      // First call for getInvoice in retryFailedPayment, second for initiatePayment
      (billingRepository.findInvoicesByTenant as Mock)
        .mockResolvedValueOnce(ok([failedInvoice]))
        .mockResolvedValueOnce(ok([retriedInvoice]));
      (billingRepository.incrementRetryCount as Mock).mockResolvedValue(ok(retriedInvoice));
      (paymentGateway.initiatePayment as Mock).mockResolvedValue(ok(gatewayResponse));
      (billingRepository.updateInvoiceStatus as Mock).mockResolvedValue(ok(updatedInvoice));

      const result = await billingService.retryFailedPayment({
        authContext,
        invoiceId: 'invoice-123',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.gatewayTransactionId).toBe('gateway-txn-456');
      }
      expect(billingRepository.incrementRetryCount).toHaveBeenCalled();
    });

    it('should fail if max retries exceeded', async () => {
      const authContext = createAuthContext();
      const failedInvoice = createMockInvoice({
        status: 'failed',
        retryCount: 3,
      });

      (billingRepository.findInvoicesByTenant as Mock).mockResolvedValue(ok([failedInvoice]));

      const result = await billingService.retryFailedPayment({
        authContext,
        invoiceId: 'invoice-123',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('BILLING_MAX_RETRIES_EXCEEDED');
      }
    });

    it('should fail if invoice is not failed status', async () => {
      const authContext = createAuthContext();
      const pendingInvoice = createMockInvoice({
        status: 'pending',
      });

      (billingRepository.findInvoicesByTenant as Mock).mockResolvedValue(ok([pendingInvoice]));

      const result = await billingService.retryFailedPayment({
        authContext,
        invoiceId: 'invoice-123',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('BILLING_CANNOT_RETRY');
      }
    });
  });

  describe('getInvoice', () => {
    it('should get invoice by ID', async () => {
      const authContext = createAuthContext();
      const invoice = createMockInvoice();

      (billingRepository.findInvoicesByTenant as Mock).mockResolvedValue(ok([invoice]));

      const result = await billingService.getInvoice({
        authContext,
        invoiceId: 'invoice-123',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('invoice-123');
      }
    });

    it('should fail if invoice not found', async () => {
      const authContext = createAuthContext();

      (billingRepository.findInvoicesByTenant as Mock).mockResolvedValue(ok([]));

      const result = await billingService.getInvoice({
        authContext,
        invoiceId: 'invoice-123',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('BILLING_INVOICE_NOT_FOUND');
      }
    });
  });

  describe('listInvoices', () => {
    it('should list invoices for a tenant', async () => {
      const authContext = createAuthContext();
      const invoices = [
        createMockInvoice({ id: 'invoice-1' }),
        createMockInvoice({ id: 'invoice-2' }),
      ];

      (billingRepository.findInvoicesByTenant as Mock).mockResolvedValue(ok(invoices));

      const result = await billingService.listInvoices({
        authContext,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
      }
    });

    it('should filter by status', async () => {
      const authContext = createAuthContext();
      const pendingInvoices = [createMockInvoice({ status: 'pending' })];

      (billingRepository.findInvoicesByTenant as Mock).mockResolvedValue(ok(pendingInvoices));

      const result = await billingService.listInvoices({
        authContext,
        status: 'pending',
      });

      expect(result.success).toBe(true);
      expect(billingRepository.findInvoicesByTenant).toHaveBeenCalledWith(
        'tenant-123',
        'pending',
      );
    });
  });
});
