'use client';

import { Badge } from '@components/atoms/Badge';
import { Spinner } from '@components/atoms/Spinner';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useTenantHealthViewModel } from '../viewModel/useOperationalViewModel';

type HealthVariant = 'success' | 'warning' | 'danger' | 'default';

const healthVariantMap: Record<string, HealthVariant> = {
  healthy: 'success',
  degraded: 'warning',
  down: 'danger',
};

export function TenantHealthScreen() {
  const { tenants, isLoading, isError, error } = useTenantHealthViewModel();

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
        Tenant Health
      </h1>

      {isError && (
        <ErrorMessage message={error?.message ?? 'Failed to load tenant health'} />
      )}

      <div className="flex flex-col gap-3">
        {tenants.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">No tenants found</p>
        )}
        {tenants.map(t => (
          <div
            key={t.tenantId}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {t.tenantName}
                </span>
                <Badge variant={healthVariantMap[t.status] ?? 'default'}>
                  {t.status}
                </Badge>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t.userCount} users · {t.storageUsedMb} MB · Last active: {t.lastActivityAt}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
