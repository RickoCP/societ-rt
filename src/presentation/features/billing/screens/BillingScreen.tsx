'use client';

import { Spinner } from '@components/atoms/Spinner';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useBillingPlansViewModel } from '../viewModel/useBillingViewModel';

export function BillingScreen() {
  const { plans, isLoading, isError, error } = useBillingPlansViewModel();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        Billing &amp; Subscription
      </h1>

      {isError && (
        <ErrorMessage message={error?.message ?? 'Failed to load plans'} />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map(plan => (
          <div
            key={plan.id}
            className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900"
          >
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {plan.name}
            </h2>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Rp {plan.price.toLocaleString()}
              <span className="text-sm font-normal text-gray-500">/month</span>
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Up to {plan.maxUsers} users
            </p>
            <ul className="flex flex-col gap-1">
              {plan.features.map(f => (
                <li key={f} className="text-sm text-gray-600 dark:text-gray-400">
                  ✓ {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
