'use client';

import { Badge } from '@components/atoms/Badge';
import { Button } from '@components/atoms/Button';
import { Spinner } from '@components/atoms/Spinner';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useFeatureFlagViewModel } from '../viewModel/useFeatureFlagViewModel';

export function FeatureFlagScreen() {
  const { flags, isLoading, isError, error, toggleOverride, isToggling } =
    useFeatureFlagViewModel();

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
        Feature Flags
      </h1>

      {isError && (
        <ErrorMessage message={error?.message ?? 'Failed to load feature flags'} />
      )}

      <div className="flex flex-col gap-3">
        {flags.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">No feature flags configured</p>
        )}
        {flags.map(flag => (
          <div
            key={flag.id}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {flag.key}
                </span>
                <Badge variant={flag.enabled ? 'success' : 'default'}>
                  {flag.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
                {flag.overriddenForTenant && (
                  <Badge variant="warning">Override</Badge>
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{flag.description}</p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                toggleOverride({
                  flagKey: flag.key,
                  enabled: !flag.enabled,
                  tenantId: '',
                })
              }
              disabled={isToggling}
            >
              {flag.enabled ? 'Disable' : 'Enable'}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
