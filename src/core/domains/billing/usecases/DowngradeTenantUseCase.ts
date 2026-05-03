/**
 * DowngradeTenantUseCase — Downgrades a tenant to the Free plan
 * if their subscription is unpaid for more than 14 days.
 *
 * Logic:
 * 1. Find pending invoices past due date by >14 days
 * 2. If found, change plan to Free
 * 3. Notify Ketua_RT via NotificationQueueProtocol
 * 4. Enqueue audit log (fire-and-forget)
 * 5. Return ok(void)
 *
 * @see Requirements 16.5, 16.7
 */

import type {
  AuthContext,
  AuditQueueProtocol,
  NotificationQueueProtocol,
} from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail, businessError } from '@core/utils';
import type { BillingRepository } from '../repositories/BillingRepository';
import type { TenantRepository } from '@core/domains/tenant/repositories/TenantRepository';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRACE_PERIOD_DAYS = 14;

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface DowngradeTenantUseCase {
  execute(params: {
    authContext: AuthContext;
  }): Promise<DomainResult<void>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const DowngradeTenantUseCaseImpl = ({
  billingRepository,
  tenantRepository,
  notificationQueueProtocol,
  auditQueueProtocol,
}: {
  billingRepository: BillingRepository;
  tenantRepository: TenantRepository;
  notificationQueueProtocol: NotificationQueueProtocol;
  auditQueueProtocol: AuditQueueProtocol;
}): DowngradeTenantUseCase => ({
  execute: async ({ authContext }) => {
    // 1. Find pending/failed invoices for this tenant
    const invoicesResult = await billingRepository.findInvoicesByTenant(
      authContext.tenantId,
    );

    if (!invoicesResult.success) {
      return fail(invoicesResult.error);
    }

    // Check if any invoice is overdue by more than 14 days
    const now = new Date();
    const overdueInvoice = invoicesResult.data.find((inv) => {
      if (inv.status === 'paid') return false;
      const daysPastDue = Math.floor(
        (now.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      return daysPastDue > GRACE_PERIOD_DAYS;
    });

    if (!overdueInvoice) {
      return fail(
        businessError(
          'BILLING_NO_OVERDUE_INVOICE',
          'No overdue invoices found exceeding the grace period',
        ),
      );
    }

    // 2. Get current plan to check if already Free
    const planResult = await billingRepository.getActivePlan(
      authContext.tenantId,
    );

    if (!planResult.success) {
      return fail(planResult.error);
    }

    if (planResult.data.name === 'Free') {
      // Already on Free plan, nothing to downgrade
      return ok(undefined);
    }

    // 3. Change plan to Free
    const changeResult = await billingRepository.changePlan(
      authContext.tenantId,
      'Free',
    );

    if (!changeResult.success) {
      return fail(changeResult.error);
    }

    // 4. Notify Ketua_RT
    const tenantResult = await tenantRepository.findById(authContext.tenantId);
    if (tenantResult.success && tenantResult.data) {
      notificationQueueProtocol
        .enqueueNotification({
          tenantId: authContext.tenantId,
          userId: authContext.userId,
          type: 'subscription_downgraded',
          title: 'Subscription Downgraded',
          body: `Your subscription has been downgraded to Free due to unpaid invoice past the ${GRACE_PERIOD_DAYS}-day grace period.`,
          channels: ['email', 'inbox'],
        })
        .catch(() => {
          /* notification must not block the response */
        });
    }

    // 5. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: 'system',
        actionType: 'tenant_downgraded',
        resourceType: 'tenant',
        resourceId: authContext.tenantId,
        details: {
          previousPlan: planResult.data.name,
          newPlan: 'Free',
          overdueInvoiceId: overdueInvoice.id,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    return ok(undefined);
  },
});
