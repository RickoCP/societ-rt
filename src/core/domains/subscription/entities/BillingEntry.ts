/**
 * BillingEntry — Domain entity for Admin UI billing history display.
 *
 * This entity represents individual billing/payment records for the
 * Billing History section of the Subscription Management screen.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 16.1-16.11 (Billing History)
 * @see Design Components > 9. Subscription Management > 9.3 Billing History
 */

import type { CurrencyCode } from './AdminSubscriptionPlan';

// ---------------------------------------------------------------------------
// Value Types
// ---------------------------------------------------------------------------

/**
 * Billing entry status representing payment state.
 *
 * @see Requirements 16.4 (Status column with colors)
 */
export type BillingStatus = 'PAID' | 'PENDING' | 'FAILED' | 'REFUNDED';

/**
 * All valid billing status values.
 */
export const ALL_BILLING_STATUSES: readonly BillingStatus[] = [
  'PAID',
  'PENDING',
  'FAILED',
  'REFUNDED',
] as const;

/**
 * Billing entry type for categorization.
 */
export type BillingEntryType =
  | 'SUBSCRIPTION'    // Regular subscription payment
  | 'UPGRADE'         // Plan upgrade charge
  | 'DOWNGRADE'       // Plan downgrade credit
  | 'ADDON'           // Add-on feature charge
  | 'REFUND'          // Refund issued
  | 'ADJUSTMENT';     // Manual adjustment

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/**
 * BillingEntry entity — individual billing record for Admin UI.
 *
 * Each entry represents a financial transaction related to the subscription.
 *
 * INVARIANTS:
 * - Entry ID is unique across the platform
 * - Amount is in smallest currency unit (e.g., cents/rupiah)
 * - Invoice URL is only available for PAID entries
 * - Retry action is only available for FAILED entries
 *
 * @see Requirements 16.1-16.11
 * @see Design > BillingHistoryTable
 */
export interface BillingEntry {
  /** Unique identifier for the billing entry */
  readonly id: string;

  /** Tenant ID this entry belongs to */
  readonly tenantId: string;

  /** Subscription ID reference */
  readonly subscriptionId: string;

  /** Date of the billing entry */
  readonly date: Date;

  /** Description of the charge (i18n key or formatted text) */
  readonly description: string;

  /** Amount in smallest currency unit (positive for charges, negative for credits) */
  readonly amount: number;

  /** Currency code */
  readonly currency: CurrencyCode;

  /** Payment/billing status */
  readonly status: BillingStatus;

  /** Type of billing entry for categorization */
  readonly entryType: BillingEntryType;

  /** Invoice URL for download (null if not available) */
  readonly invoiceUrl: string | null;

  /** Whether invoice is available for download */
  readonly invoiceAvailable: boolean;

  /** Payment method used (masked) */
  readonly paymentMethod: PaymentMethodSummary | null;

  /** Failure reason for FAILED entries */
  readonly failureReason: string | null;

  /** Whether retry is available for this entry */
  readonly canRetry: boolean;

  /** Reference to the billing period */
  readonly billingPeriod: BillingPeriodReference | null;

  /** When the entry was created */
  readonly createdAt: Date;

  /** When the entry was last updated */
  readonly updatedAt: Date;
}

/**
 * Payment method summary (masked for security).
 */
export interface PaymentMethodSummary {
  /** Payment method type */
  readonly type: PaymentMethodType;

  /** Masked card number or account (e.g., '****1234') */
  readonly maskedNumber: string;

  /** Card brand or bank name */
  readonly brand: string | null;
}

/**
 * Payment method types.
 */
export type PaymentMethodType =
  | 'CARD'
  | 'BANK_TRANSFER'
  | 'EWALLET'
  | 'VIRTUAL_ACCOUNT'
  | 'OTHER';

/**
 * Reference to the billing period for the entry.
 */
export interface BillingPeriodReference {
  /** Start date of the billing period */
  readonly startDate: Date;

  /** End date of the billing period */
  readonly endDate: Date;
}

// ---------------------------------------------------------------------------
// Query Types
// ---------------------------------------------------------------------------

/**
 * Query options for billing history.
 *
 * @see Requirements 16.7-16.8 (Pagination and date range filtering)
 */
export interface BillingHistoryQueryOptions {
  /** Tenant ID to fetch billing history for */
  readonly tenantId: string;

  /** Filter by status */
  readonly status?: BillingStatus | readonly BillingStatus[];

  /** Filter by entry type */
  readonly entryType?: BillingEntryType | readonly BillingEntryType[];

  /** Filter by date range - start */
  readonly dateFrom?: Date;

  /** Filter by date range - end */
  readonly dateTo?: Date;

  /** Page number (1-indexed) */
  readonly page: number;

  /** Page size (default 10) */
  readonly pageSize: number;

  /** Sort field */
  readonly sortBy?: 'date' | 'amount' | 'status';

  /** Sort direction */
  readonly sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated billing history response.
 */
export interface PaginatedBillingHistory {
  /** List of billing entries for the current page */
  readonly entries: readonly BillingEntry[];

  /** Total count of entries matching the query */
  readonly totalCount: number;

  /** Current page number (1-indexed) */
  readonly page: number;

  /** Page size */
  readonly pageSize: number;

  /** Total number of pages */
  readonly totalPages: number;

  /** Whether there are more pages */
  readonly hasNextPage: boolean;

  /** Whether there are previous pages */
  readonly hasPreviousPage: boolean;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Default page size for billing history.
 */
export const DEFAULT_BILLING_PAGE_SIZE = 10;

/**
 * Get CSS color variant for billing status.
 *
 * @see Requirements 16.4 (Status colors)
 */
export function getBillingStatusColor(
  status: BillingStatus,
): 'success' | 'warning' | 'destructive' | 'muted' {
  switch (status) {
    case 'PAID':
      return 'success';   // Green
    case 'PENDING':
      return 'warning';   // Yellow
    case 'FAILED':
      return 'destructive'; // Red
    case 'REFUNDED':
      return 'muted';     // Gray
    default:
      return 'muted';
  }
}

/**
 * Get i18n key for billing status.
 */
export function getBillingStatusKey(status: BillingStatus): string {
  return `billing.status.${status.toLowerCase()}`;
}

/**
 * Check if retry is available for a billing entry.
 *
 * @see Requirements 16.10 (Retry payment for failed entries)
 */
export function canRetryPayment(entry: BillingEntry): boolean {
  return entry.status === 'FAILED' && entry.canRetry;
}

/**
 * Check if invoice download is available.
 *
 * @see Requirements 16.5-16.6 (Download invoice for paid entries)
 */
export function canDownloadInvoice(entry: BillingEntry): boolean {
  return entry.status === 'PAID' && entry.invoiceAvailable && entry.invoiceUrl !== null;
}

/**
 * Format amount for display with currency.
 */
export function formatBillingAmount(
  amount: number,
  currency: CurrencyCode,
): string {
  // Amount is in smallest currency unit, convert for display
  const formatter = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'IDR' ? 0 : 2,
    maximumFractionDigits: currency === 'IDR' ? 0 : 2,
  });

  // IDR is already in rupiah, USD needs conversion from cents
  const displayAmount = currency === 'IDR' ? amount : amount / 100;
  return formatter.format(displayAmount);
}

/**
 * Generate invoice filename for download.
 *
 * @see Requirements 18.7 (Filename pattern)
 */
export function generateInvoiceFilename(entry: BillingEntry, tenantSlug: string): string {
  const dateStr = entry.date.toISOString().split('T')[0];
  return `invoice-${tenantSlug}-${dateStr}-${entry.id.slice(0, 8)}.pdf`;
}
