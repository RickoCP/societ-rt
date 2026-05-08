'use client';

import { Spinner } from '@components/atoms/Spinner';
import { Badge } from '@components/atoms/Badge';
import { Button } from '@components/atoms/Button';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useAlarmManagementViewModel } from '../viewModel/useAlarmManagementViewModel';
import type { AlarmDevice } from '../viewModel/useAlarmManagementViewModel';

function AlarmDeviceCard({ device, onActivate, onDeactivate, isActivating, isDeactivating }: {
  device: AlarmDevice;
  onActivate: (id: string) => void;
  onDeactivate: (id: string) => void;
  isActivating: boolean;
  isDeactivating: boolean;
}) {
  const statusVariant = device.status === 'armed' ? 'success' : device.status === 'triggered' ? 'danger' : device.status === 'disarmed' ? 'warning' : 'default';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{device.name}</h3>
          <p className="text-xs text-gray-500">{device.type} • {device.zoneName}</p>
        </div>
        <Badge variant={statusVariant}>{device.status}</Badge>
      </div>

      {device.lastTriggered && (
        <p className="mt-2 text-xs text-gray-400">Last triggered: {new Date(device.lastTriggered).toLocaleString()}</p>
      )}

      <div className="mt-3 flex gap-2">
        {device.status === 'disarmed' && (
          <Button size="sm" variant="danger" disabled={isActivating} onClick={() => onActivate(device.id)}>
            Arm
          </Button>
        )}
        {(device.status === 'armed' || device.status === 'triggered') && (
          <Button size="sm" variant="secondary" disabled={isDeactivating} onClick={() => onDeactivate(device.id)}>
            Disarm
          </Button>
        )}
      </div>
    </div>
  );
}

export function AlarmManagementScreen() {
  const { devices, zones, isLoading, isError, error, activateAlarm, deactivateAlarm, isActivating, isDeactivating } = useAlarmManagementViewModel();

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Spinner /></div>;
  }

  if (isError) {
    return <ErrorMessage message={error?.message ?? 'Failed to load alarms'} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Alarm Management</h1>

      {/* Alarm devices */}
      {devices.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No alarm devices configured.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map(device => (
            <AlarmDeviceCard
              key={device.id}
              device={device}
              onActivate={activateAlarm}
              onDeactivate={deactivateAlarm}
              isActivating={isActivating}
              isDeactivating={isDeactivating}
            />
          ))}
        </div>
      )}

      {/* Alarm zones */}
      {zones.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">Alarm Zones</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {zones.map(zone => (
              <div key={zone.id} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{zone.name}</h3>
                <p className="text-xs text-gray-500">{zone.deviceCount} devices • {zone.polygon.length} vertices</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
