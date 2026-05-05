'use client';

import { Badge } from '@components/atoms/Badge';
import { Button } from '@components/atoms/Button';
import { Spinner } from '@components/atoms/Spinner';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { EmptyState } from '@components/molecules/EmptyState';
import { useEmergencyViewModel } from '../viewModel/useEmergencyViewModel';

type AlertStatus = 'active' | 'responding' | 'resolved';
type StatusVariant = 'danger' | 'warning' | 'success';

const statusVariantMap: Record<AlertStatus, StatusVariant> = {
  active: 'danger',
  responding: 'warning',
  resolved: 'success',
};

export function EmergencyScreen() {
  const {
    alerts,
    isLoading,
    isError,
    error,
    refetch,
    triggerAlert,
    isTriggering,
    triggerError,
    updateStatus,
    isUpdating,
  } = useEmergencyViewModel();

  const handleTrigger = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          triggerAlert({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        },
        () => {
          triggerAlert({ latitude: null, longitude: null });
        },
      );
    } else {
      triggerAlert({ latitude: null, longitude: null });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Emergency Alerts
        </h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Refresh
          </Button>
          <Button variant="danger" loading={isTriggering} onClick={handleTrigger}>
            Trigger Emergency
          </Button>
        </div>
      </div>

      {isError && (
        <ErrorMessage
          message={error?.message ?? 'Failed to load emergency alerts'}
        />
      )}

      {triggerError && (
        <ErrorMessage
          message={triggerError.message ?? 'Failed to trigger emergency alert'}
        />
      )}

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {!isLoading && alerts.length === 0 && (
        <EmptyState
          title="No active emergencies"
          description="All clear. No emergency alerts at this time."
        />
      )}

      <div className="flex flex-col gap-4">
        {alerts.map(alert => (
          <div
            key={alert.id}
            className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant={statusVariantMap[alert.status as AlertStatus] ?? 'danger'}>
                  {alert.status}
                </Badge>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Reported by {alert.reportedBy}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {alert.createdAt}
                </span>
              </div>
              {alert.status !== 'resolved' && (
                <div className="flex gap-2">
                  {alert.status === 'active' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={isUpdating}
                      onClick={() =>
                        updateStatus({
                          id: alert.id,
                          status: 'responding',
                        })
                      }>
                      Respond
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={isUpdating}
                    onClick={() =>
                      updateStatus({ id: alert.id, status: 'resolved' })
                    }>
                    Resolve
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
