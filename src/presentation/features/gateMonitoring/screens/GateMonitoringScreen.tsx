'use client';

import { Spinner } from '@components/atoms/Spinner';
import { Badge } from '@components/atoms/Badge';
import { Button } from '@components/atoms/Button';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useGateMonitoringViewModel } from '../viewModel/useGateMonitoringViewModel';
import type { Gate } from '../viewModel/useGateMonitoringViewModel';

function getOpenDurationWarning(openSince: string | null): string | null {
  if (!openSince) return null;
  const minutes = Math.floor((Date.now() - new Date(openSince).getTime()) / 60000);
  if (minutes > 5) return `Open for ${minutes} min`;
  return null;
}

function GateCard({ gate, onControl, isControlling }: { gate: Gate; onControl: (gateId: string, action: 'open' | 'close') => void; isControlling: boolean }) {
  const warning = getOpenDurationWarning(gate.openSince);
  const statusVariant = gate.status === 'open' ? 'warning' : gate.status === 'closed' ? 'success' : 'default';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{gate.name}</h3>
          <p className="text-xs text-gray-500">{gate.location}</p>
        </div>
        <Badge variant={statusVariant}>{gate.status}</Badge>
      </div>

      {warning && (
        <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">⚠️ {warning}</p>
      )}

      <div className="mt-3 flex gap-2">
        {gate.status === 'closed' && (
          <Button size="sm" variant="secondary" disabled={isControlling} onClick={() => onControl(gate.id, 'open')}>
            Open Gate
          </Button>
        )}
        {gate.status === 'open' && (
          <Button size="sm" variant="primary" disabled={isControlling} onClick={() => onControl(gate.id, 'close')}>
            Close Gate
          </Button>
        )}
      </div>

      <p className="mt-2 text-xs text-gray-400">Last event: {new Date(gate.lastEvent).toLocaleString()}</p>
    </div>
  );
}

export function GateMonitoringScreen() {
  const { gates, isLoading, isError, error, controlGate, isControlling } = useGateMonitoringViewModel();

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Spinner /></div>;
  }

  if (isError) {
    return <ErrorMessage message={error?.message ?? 'Failed to load gates'} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Gate Monitoring</h1>

      {gates.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No gates configured.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {gates.map(gate => (
            <GateCard
              key={gate.id}
              gate={gate}
              onControl={(gateId, action) => controlGate({ gateId, action })}
              isControlling={isControlling}
            />
          ))}
        </div>
      )}
    </div>
  );
}
