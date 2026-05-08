'use client';

import { useState } from 'react';
import { Spinner } from '@components/atoms/Spinner';
import { Badge } from '@components/atoms/Badge';
import { Button } from '@components/atoms/Button';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useDeviceDashboardViewModel } from '../viewModel/useDeviceDashboardViewModel';
import type { Device } from '../viewModel/useDeviceDashboardViewModel';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DeviceCard({ device, onSelect }: { device: Device; onSelect: (id: string) => void }) {
  const statusVariant = device.status === 'online' ? 'success' : device.status === 'pairing' ? 'warning' : 'default';

  return (
    <button
      type="button"
      onClick={() => onSelect(device.id)}
      className="w-full rounded-lg border border-gray-200 bg-white p-4 text-left transition hover:border-blue-300 dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">{device.name}</h3>
        <Badge variant={statusVariant}>{device.status}</Badge>
      </div>
      <p className="mt-1 text-xs text-gray-500">{device.type}</p>
      <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
        {device.batteryLevel !== null && (
          <span>🔋 {device.batteryLevel}%</span>
        )}
        <span>Last: {new Date(device.lastActivity).toLocaleString()}</span>
      </div>
    </button>
  );
}

function PairingWizard({ onPair, isPairing, error }: {
  onPair: (input: { pairingCode: string; deviceName: string }) => void;
  isPairing: boolean;
  error: Error | null;
}) {
  const [step, setStep] = useState(1);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-6 dark:border-blue-800 dark:bg-blue-900/20">
      <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Pair New Device</h3>

      {step === 1 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">Step 1: Enter the pairing code from your device</p>
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="Enter pairing code"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
          <Button size="sm" disabled={!code.trim()} onClick={() => setStep(2)}>Next</Button>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">Step 2: Give your device a name</p>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Device name"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setStep(1)}>Back</Button>
            <Button size="sm" disabled={!name.trim() || isPairing} onClick={() => onPair({ pairingCode: code, deviceName: name })}>
              {isPairing ? 'Pairing...' : 'Pair Device'}
            </Button>
          </div>
          {error && <p className="text-sm text-red-600">{error.message}</p>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function DeviceDashboardScreen() {
  const vm = useDeviceDashboardViewModel();
  const [showPairing, setShowPairing] = useState(false);
  const [commandInput, setCommandInput] = useState('');

  if (vm.isLoading) {
    return <div className="flex items-center justify-center py-12"><Spinner /></div>;
  }

  if (vm.isError) {
    return <ErrorMessage message={vm.error?.message ?? 'Failed to load devices'} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">SocieT-Home Devices</h1>
        <Button size="sm" onClick={() => setShowPairing(!showPairing)}>
          {showPairing ? 'Cancel' : '+ Pair Device'}
        </Button>
      </div>

      {showPairing && (
        <PairingWizard onPair={vm.pairDevice} isPairing={vm.isPairing} error={vm.pairError} />
      )}

      {/* Device grid */}
      {vm.devices.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No devices paired yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vm.devices.map(device => (
            <DeviceCard key={device.id} device={device} onSelect={vm.setSelectedDeviceId} />
          ))}
        </div>
      )}

      {/* Device control panel */}
      {vm.selectedDeviceId && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Device Control</h3>
            <button type="button" onClick={() => vm.setSelectedDeviceId(null)} className="text-gray-400 hover:text-gray-600" aria-label="Close">✕</button>
          </div>

          <div className="mt-4 flex gap-2">
            <input
              type="text"
              value={commandInput}
              onChange={e => setCommandInput(e.target.value)}
              placeholder="Enter command..."
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            <Button
              size="sm"
              disabled={!commandInput.trim() || vm.isSendingCommand}
              onClick={() => {
                vm.sendCommand({ deviceId: vm.selectedDeviceId!, command: commandInput });
                setCommandInput('');
              }}
            >
              Send
            </Button>
          </div>

          {/* Recent events */}
          <div className="mt-4">
            <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Recent Events</h4>
            {vm.deviceEvents.length === 0 ? (
              <p className="text-xs text-gray-400">No events.</p>
            ) : (
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {vm.deviceEvents.slice(0, 10).map(evt => (
                  <div key={evt.id} className="text-xs text-gray-500">
                    <span className="font-medium">{evt.eventType}</span> — {new Date(evt.timestamp).toLocaleString()}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Realtime events feed */}
      {vm.realtimeEvents.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Live Events</h3>
          <div className="max-h-32 space-y-1 overflow-y-auto">
            {vm.realtimeEvents.slice(0, 10).map(evt => (
              <div key={evt.id} className="text-xs text-gray-500">
                <span className="font-medium">{evt.eventType}</span> ({evt.deviceId.slice(0, 8)}) — {new Date(evt.timestamp).toLocaleTimeString()}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
