'use client';

import { Spinner } from '@components/atoms/Spinner';
import { Badge } from '@components/atoms/Badge';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { usePatrolManagementViewModel } from '../viewModel/usePatrolManagementViewModel';

export function PatrolManagementScreen() {
  const { routes, activePatrols, analytics, isLoading, isError, error } = usePatrolManagementViewModel();

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Spinner /></div>;
  }

  if (isError) {
    return <ErrorMessage message={error?.message ?? 'Failed to load patrol data'} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Patrol Management</h1>

      {/* Analytics summary */}
      {analytics && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs text-gray-500">Patrols Today</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{analytics.totalPatrolsToday}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs text-gray-500">Avg Duration</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{analytics.averageDurationMinutes}m</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs text-gray-500">Completion Rate</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{analytics.completionRate}%</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs text-gray-500">Missed Checkpoints</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{analytics.missedCheckpoints}</p>
          </div>
        </div>
      )}

      {/* Active patrols */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">Active Patrols</h2>
        {activePatrols.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No active patrols.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activePatrols.map(patrol => (
              <div key={patrol.id} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">{patrol.guardName}</h3>
                  <Badge variant={patrol.status === 'active' ? 'success' : patrol.status === 'paused' ? 'warning' : 'default'}>
                    {patrol.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-gray-500">Route: {patrol.routeName}</p>
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Checkpoints</span>
                    <span>{patrol.checkpointsCompleted}/{patrol.totalCheckpoints}</span>
                  </div>
                  <div className="mt-1 h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className="h-2 rounded-full bg-blue-500"
                      style={{ width: `${(patrol.checkpointsCompleted / patrol.totalCheckpoints) * 100}%` }}
                    />
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-400">Started: {new Date(patrol.startedAt).toLocaleTimeString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Routes */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">Patrol Routes ({routes.length})</h2>
        {routes.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No routes configured.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {routes.map(route => (
              <div key={route.id} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{route.name}</h3>
                <p className="text-xs text-gray-500">{route.checkpoints.length} checkpoints</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
