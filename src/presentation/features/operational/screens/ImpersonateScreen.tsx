'use client';

import { Button } from '@components/atoms/Button';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useImpersonationViewModel } from '../viewModel/useOperationalViewModel';

export function ImpersonateScreen({ tenantId }: { tenantId: string }) {
  const {
    impersonate,
    isImpersonating,
    impersonateError,
    impersonateSuccess,
    endImpersonation,
    isEndingImpersonation,
    endError,
  } = useImpersonationViewModel();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        Impersonate Tenant
      </h1>

      <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Tenant ID: <span className="font-mono">{tenantId}</span>
        </p>

        {impersonateError && (
          <ErrorMessage message={impersonateError.message} />
        )}
        {endError && <ErrorMessage message={endError.message} />}

        {impersonateSuccess ? (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-sm text-green-600 dark:text-green-400">
              Impersonation active. You are viewing as this tenant.
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => endImpersonation()}
              disabled={isEndingImpersonation}
            >
              {isEndingImpersonation ? 'Ending…' : 'End Impersonation'}
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            className="mt-4"
            onClick={() => impersonate(tenantId)}
            disabled={isImpersonating}
          >
            {isImpersonating ? 'Starting…' : 'Start Impersonation'}
          </Button>
        )}
      </div>
    </div>
  );
}
