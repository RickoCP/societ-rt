'use client';

import { Spinner } from '@components/atoms/Spinner';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useSecurityCenterViewModel } from '../viewModel/useSecurityCenterViewModel';
import { SecurityDashboardPanel } from '../components/SecurityDashboardPanel';
import { IncidentTimelinePanel } from '../components/IncidentTimelinePanel';
import { BroadcastAlertForm } from '../components/BroadcastAlertForm';
import { SecurityAnalyticsPanel } from '../components/SecurityAnalyticsPanel';
import { CriticalEventAlert } from '../components/CriticalEventAlert';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SecurityCenterScreen() {
  const {
    metrics,
    isLoading,
    isError,
    error,
    isConnected,
    broadcastAlert,
    isBroadcasting,
    broadcastError,
    criticalEvent,
    dismissCriticalEvent,
  } = useSecurityCenterViewModel();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorMessage message={error?.message ?? 'Failed to load security center'} />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        Security Center
      </h1>

      {/* Critical event alert banner */}
      {criticalEvent && (
        <CriticalEventAlert
          event={criticalEvent}
          onDismiss={dismissCriticalEvent}
        />
      )}

      {/* Dashboard metrics panel */}
      {metrics && (
        <SecurityDashboardPanel metrics={metrics} isConnected={isConnected} />
      )}

      {/* Two-column layout for timeline and broadcast */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Timeline takes 2/3 */}
        <div className="lg:col-span-2">
          <IncidentTimelinePanel />
        </div>

        {/* Broadcast form takes 1/3 */}
        <div>
          <BroadcastAlertForm
            onSubmit={broadcastAlert}
            isSubmitting={isBroadcasting}
            error={broadcastError}
          />
        </div>
      </div>

      {/* Analytics panel */}
      <SecurityAnalyticsPanel />
    </div>
  );
}
