/**
 * SubscriptionAdminRepositoryImpl — Infrastructure implementation of ISubscriptionAdminRepository.
 *
 * This repository provides Admin UI subscription operations by calling the backend API
 * (SubscriptionPlanService endpoints). It maps API responses to domain entities and
 * handles errors appropriately.
 *
 * **ENDPOINTS USED:**
 * - GET /api/admin/subscriptions/:tenantId/overview - Subscription overview
 * - GET /api/admin/subscriptions/plans - List all plans
 * - GET /api/admin/subscriptions/plans/:planId - Get single plan
 * - POST /api/admin/subscriptions/:tenantId/usage-check - Check usage limits
 * - POST /api/admin/subscriptions/:tenantId/change-plan - Change plan
 * - GET /api/admin/subscriptions/:tenantId/billing-history - Billing history
 * - GET /api/admin/subscriptions/:tenantId/invoices/:id/download - Download invoice
 * - POST /api/admin/subscriptions/:tenantId/billing/:id/retry - Retry payment
 *
 * **ERROR HANDLING:**
 * - Maps API errors to appropriate AppError types
 * - Returns DomainResult<T> for explicit success/error handling
 * - Never exposes internal error details to callers
 *
 * @see Requirements 14.1-14.9, 15.5-15.9, 16.1-16.11
 * @see ISubscriptionAdminRepository interface for full contract
 */

import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, notFoundError, validationError } from '@core/utils';
import type {
  ISubscriptionAdminRepository,
  PlanChangeResult,
  InvoiceDownload,
  PaymentRetryResult,
} from '@core/domains/subscription/repositories/ISubscriptionAdminRepository';
import type { SubscriptionPlan } from '@core/domains/subscription/entities';
import type {
  BillingEntry,
  BillingStatus,
  BillingHistoryQueryOptions,
  PaginatedBillingHistory,
} from '@core/domains/subscription/entities/BillingEntry';
import type { CurrencyCode } from '@core/domains/subscription/entities/AdminSubscriptionPlan';
import type {
  SubscriptionOverview,
  UsageMetrics,
  UsageLimitCheck,
} from '@core/domains/subscription/usecases/GetSubscriptionUseCase';
import type { SubscriptionStatus } from '@core/domains/subscription/types';
import type { HttpProtocol } from '@core/protocols';

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

/**
 * API response for subscription plan.
 */
interface PlanApiResponse {
  id: string;
  name: string;
  maxUsers: number | null;
  features: string[];
  price: number;
  description?: string;
  isSystemPlan?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * API response for subscription overview.
 */
interface SubscriptionOverviewApiResponse {
  subscriptionId: string;
  currentPlan: PlanApiResponse;
  status: string;
  billingPeriod: {
    start: string;
    end: string | null;
  };
  trialEndsAt: string | null;
  usage: {
    members: { current: number; max: number };
    orgUnits: { current: number; max: number };
    storage: { current: number; max: number };
  };
  features: string[];
}

/**
 * API response for usage limit check.
 */
interface UsageLimitCheckApiResponse {
  passed: boolean;
  exceededLimits: Array<{
    metric: string;
    currentUsage: number;
    newLimit: number;
  }>;
}

/**
 * API response for plan change.
 */
interface PlanChangeApiResponse {
  subscriptionId: string;
  newStatus: string;
  newPeriodEnd: string | null;
}

/**
 * API response for billing entry.
 */
interface BillingEntryApiResponse {
  id: string;
  tenantId: string;
  subscriptionId: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
  hasInvoice: boolean;
  invoiceUrl: string | null;
  canRetryPayment: boolean;
  periodStart: string;
  periodEnd: string;
  transactionId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * API response for paginated billing history.
 */
interface PaginatedBillingHistoryApiResponse {
  entries: BillingEntryApiResponse[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

/**
 * API response for invoice download.
 */
interface InvoiceDownloadApiResponse {
  downloadUrl: string;
  filename: string;
  contentType: string;
}

/**
 * API response for payment retry.
 */
interface PaymentRetryApiResponse {
  initiated: boolean;
  paymentUrl: string | null;
  newStatus: string;
}

/**
 * API error response.
 */
interface ApiErrorResponse {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/**
 * Maps API plan response to domain SubscriptionPlan entity.
 */
function mapPlanFromApi(api: PlanApiResponse): SubscriptionPlan {
  return {
    id: api.id,
    name: api.name,
    maxUsers: api.maxUsers,
    features: api.features,
    price: api.price,
    description: api.description,
    isSystemPlan: api.isSystemPlan,
    createdAt: new Date(api.createdAt),
    updatedAt: new Date(api.updatedAt),
  };
}

/**
 * Maps API subscription overview to domain SubscriptionOverview.
 */
function mapSubscriptionOverviewFromApi(api: SubscriptionOverviewApiResponse): SubscriptionOverview {
  // Calculate trial days remaining
  let trialDaysRemaining: number | null = null;
  if (api.trialEndsAt) {
    const trialEnd = new Date(api.trialEndsAt);
    const now = new Date();
    const diffMs = trialEnd.getTime() - now.getTime();
    if (diffMs > 0) {
      trialDaysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    } else {
      trialDaysRemaining = 0;
    }
  }

  return {
    subscriptionId: api.subscriptionId,
    currentPlan: mapPlanFromApi(api.currentPlan),
    status: api.status as SubscriptionStatus,
    billingPeriod: {
      start: new Date(api.billingPeriod.start),
      end: api.billingPeriod.end ? new Date(api.billingPeriod.end) : null,
    },
    trialDaysRemaining,
    usage: api.usage,
    usageWarnings: [], // Calculated by use case
    features: api.features,
  };
}

/**
 * Maps API billing entry to domain BillingEntry.
 */
function mapBillingEntryFromApi(api: BillingEntryApiResponse): BillingEntry {
  return {
    id: api.id,
    tenantId: api.tenantId,
    subscriptionId: api.subscriptionId,
    date: new Date(api.date),
    description: api.description,
    amount: api.amount,
    currency: api.currency as CurrencyCode,
    status: api.status as BillingStatus,
    entryType: 'SUBSCRIPTION', // Default to subscription, backend should provide this
    invoiceUrl: api.invoiceUrl,
    invoiceAvailable: api.hasInvoice,
    paymentMethod: null, // Not provided by current API
    failureReason: null, // Not provided by current API
    canRetry: api.canRetryPayment,
    billingPeriod: {
      startDate: new Date(api.periodStart),
      endDate: new Date(api.periodEnd),
    },
    createdAt: new Date(api.createdAt),
    updatedAt: new Date(api.updatedAt),
  };
}

/**
 * Maps API paginated billing history to domain PaginatedBillingHistory.
 */
function mapPaginatedBillingHistoryFromApi(
  api: PaginatedBillingHistoryApiResponse,
): PaginatedBillingHistory {
  return {
    entries: api.entries.map(mapBillingEntryFromApi),
    page: api.page,
    pageSize: api.pageSize,
    totalCount: api.totalCount,
    totalPages: api.totalPages,
    hasNextPage: api.page < api.totalPages,
    hasPreviousPage: api.page > 1,
  };
}

/**
 * Maps API error to DomainResult failure.
 */
function mapApiError<T>(error: unknown): DomainResult<T> {
  // Handle axios-like error response
  const errorResponse = error as { response?: { status?: number; data?: ApiErrorResponse } };
  const status = errorResponse?.response?.status;
  const data = errorResponse?.response?.data;

  if (status === 404) {
    return fail(notFoundError(
      data?.code ?? 'SUBSCRIPTION_NOT_FOUND',
      data?.message ?? 'Subscription not found',
    ));
  }

  if (status === 400) {
    return fail(validationError(
      data?.code ?? 'VALIDATION_ERROR',
      data?.message ?? 'Invalid request',
    ));
  }

  if (status === 403) {
    return fail({
      type: 'authorization',
      code: data?.code ?? 'AUTH_FORBIDDEN',
      message: data?.message ?? 'Access denied',
      retryable: false,
    });
  }

  if (status === 409) {
    return fail({
      type: 'business',
      code: data?.code ?? 'SUBSCRIPTION_CONFLICT',
      message: data?.message ?? 'Operation not allowed',
      retryable: false,
    });
  }

  // Generic technical error for unknown cases
  return fail(technicalError(
    data?.code ?? 'SUBSCRIPTION_API_ERROR',
    data?.message ?? 'Failed to process subscription operation',
    { retryable: true },
  ));
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a SubscriptionAdminRepository implementation.
 *
 * @param dependencies - The repository dependencies
 * @returns An implementation of ISubscriptionAdminRepository
 */
export const SubscriptionAdminRepositoryImpl = ({
  httpProtocol,
}: {
  httpProtocol: HttpProtocol;
}): ISubscriptionAdminRepository => {
  const baseUrl = '/api/admin/subscriptions';

  return {
    // -------------------------------------------------------------------------
    // Subscription Overview
    // -------------------------------------------------------------------------

    /**
     * Get complete subscription overview for a tenant.
     *
     * @see ISubscriptionAdminRepository.getSubscriptionOverview
     */
    async getSubscriptionOverview(
      tenantId: string,
    ): Promise<DomainResult<SubscriptionOverview | null>> {
      try {
        const response = await httpProtocol.get<SubscriptionOverviewApiResponse>(
          `${baseUrl}/${tenantId}/overview`,
        );

        return ok(mapSubscriptionOverviewFromApi(response));
      } catch (error) {
        // Handle 404 as null (no subscription)
        const errorResponse = error as { response?: { status?: number } };
        if (errorResponse?.response?.status === 404) {
          return ok(null);
        }
        return mapApiError<SubscriptionOverview | null>(error);
      }
    },

    // -------------------------------------------------------------------------
    // Plan Management
    // -------------------------------------------------------------------------

    /**
     * Get a subscription plan by ID.
     *
     * @see ISubscriptionAdminRepository.getPlan
     */
    async getPlan(planId: string): Promise<DomainResult<SubscriptionPlan | null>> {
      try {
        const response = await httpProtocol.get<PlanApiResponse>(
          `${baseUrl}/plans/${planId}`,
        );

        return ok(mapPlanFromApi(response));
      } catch (error) {
        // Handle 404 as null
        const errorResponse = error as { response?: { status?: number } };
        if (errorResponse?.response?.status === 404) {
          return ok(null);
        }
        return mapApiError<SubscriptionPlan | null>(error);
      }
    },

    /**
     * List all available subscription plans.
     *
     * @see ISubscriptionAdminRepository.listPlans
     */
    async listPlans(): Promise<DomainResult<SubscriptionPlan[]>> {
      try {
        const response = await httpProtocol.get<PlanApiResponse[]>(
          `${baseUrl}/plans`,
        );

        return ok(response.map(mapPlanFromApi));
      } catch (error) {
        return mapApiError<SubscriptionPlan[]>(error);
      }
    },

    /**
     * Check if current usage fits within a plan's limits.
     *
     * @see ISubscriptionAdminRepository.checkUsageLimits
     */
    async checkUsageLimits(
      tenantId: string,
      targetPlanId: string,
    ): Promise<DomainResult<UsageLimitCheck>> {
      try {
        const response = await httpProtocol.post<UsageLimitCheckApiResponse>(
          `${baseUrl}/${tenantId}/usage-check`,
          { targetPlanId },
        );

        return ok({
          passed: response.passed,
          exceededLimits: response.exceededLimits,
        });
      } catch (error) {
        return mapApiError<UsageLimitCheck>(error);
      }
    },

    /**
     * Change the subscription plan for a tenant.
     *
     * @see ISubscriptionAdminRepository.changePlan
     */
    async changePlan(
      tenantId: string,
      targetPlanId: string,
      actorUserId: string,
    ): Promise<DomainResult<PlanChangeResult>> {
      try {
        const response = await httpProtocol.post<PlanChangeApiResponse>(
          `${baseUrl}/${tenantId}/change-plan`,
          {
            targetPlanId,
            actorUserId,
          },
        );

        return ok({
          subscriptionId: response.subscriptionId,
          newStatus: response.newStatus as SubscriptionStatus,
          newPeriodEnd: response.newPeriodEnd ? new Date(response.newPeriodEnd) : null,
        });
      } catch (error) {
        return mapApiError<PlanChangeResult>(error);
      }
    },

    // -------------------------------------------------------------------------
    // Billing History
    // -------------------------------------------------------------------------

    /**
     * Get paginated billing history for a tenant.
     *
     * @see ISubscriptionAdminRepository.getBillingHistory
     */
    async getBillingHistory(
      options: BillingHistoryQueryOptions,
    ): Promise<DomainResult<PaginatedBillingHistory>> {
      try {
        // Build query parameters
        const params = new URLSearchParams();
        params.set('page', String(options.page));
        params.set('pageSize', String(options.pageSize));

        if (options.dateFrom) {
          params.set('dateFrom', options.dateFrom.toISOString());
        }
        if (options.dateTo) {
          params.set('dateTo', options.dateTo.toISOString());
        }
        if (options.status) {
          params.set('status', options.status);
        }

        const response = await httpProtocol.get<PaginatedBillingHistoryApiResponse>(
          `${baseUrl}/${options.tenantId}/billing-history?${params.toString()}`,
        );

        return ok(mapPaginatedBillingHistoryFromApi(response));
      } catch (error) {
        return mapApiError<PaginatedBillingHistory>(error);
      }
    },

    /**
     * Download invoice for a billing entry.
     *
     * @see ISubscriptionAdminRepository.downloadInvoice
     */
    async downloadInvoice(
      tenantId: string,
      billingEntryId: string,
    ): Promise<DomainResult<InvoiceDownload>> {
      try {
        const response = await httpProtocol.get<InvoiceDownloadApiResponse>(
          `${baseUrl}/${tenantId}/invoices/${billingEntryId}/download`,
        );

        return ok({
          downloadUrl: response.downloadUrl,
          filename: response.filename,
          contentType: response.contentType,
        });
      } catch (error) {
        return mapApiError<InvoiceDownload>(error);
      }
    },

    /**
     * Retry a failed payment.
     *
     * @see ISubscriptionAdminRepository.retryPayment
     */
    async retryPayment(
      tenantId: string,
      billingEntryId: string,
    ): Promise<DomainResult<PaymentRetryResult>> {
      try {
        const response = await httpProtocol.post<PaymentRetryApiResponse>(
          `${baseUrl}/${tenantId}/billing/${billingEntryId}/retry`,
          {},
        );

        return ok({
          initiated: response.initiated,
          paymentUrl: response.paymentUrl,
          newStatus: response.newStatus,
        });
      } catch (error) {
        return mapApiError<PaymentRetryResult>(error);
      }
    },
  };
};
