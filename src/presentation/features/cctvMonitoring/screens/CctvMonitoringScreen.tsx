'use client';

import { useState } from 'react';
import { Spinner } from '@components/atoms/Spinner';
import { Badge } from '@components/atoms/Badge';
import { Button } from '@components/atoms/Button';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useCctvMonitoringViewModel } from '../viewModel/useCctvMonitoringViewModel';
import type { Camera } from '../viewModel/useCctvMonitoringViewModel';

function CameraCard({ camera, onCapture, isCapturing, onViewStream }: {
  camera: Camera;
  onCapture: (id: string) => void;
  isCapturing: boolean;
  onViewStream: (camera: Camera) => void;
}) {
  const statusVariant = camera.status === 'online' ? 'success' : camera.status === 'recording' ? 'info' : 'default';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">{camera.name}</h3>
        <Badge variant={statusVariant}>{camera.status}</Badge>
      </div>
      <p className="mt-1 text-xs text-gray-500">{camera.location}</p>

      {camera.lastSnapshot && (
        <div className="mt-2 h-24 w-full overflow-hidden rounded bg-gray-100 dark:bg-gray-700">
          <img src={camera.lastSnapshot} alt={`${camera.name} snapshot`} className="h-full w-full object-cover" />
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="secondary" disabled={isCapturing || camera.status === 'offline'} onClick={() => onCapture(camera.id)}>
          📷 Snapshot
        </Button>
        {camera.streamUrl && camera.status !== 'offline' && (
          <Button size="sm" variant="primary" onClick={() => onViewStream(camera)}>
            ▶ Live
          </Button>
        )}
      </div>
    </div>
  );
}

export function CctvMonitoringScreen() {
  const { cameras, isLoading, isError, error, captureSnapshot, isCapturing } = useCctvMonitoringViewModel();
  const [activeStream, setActiveStream] = useState<Camera | null>(null);

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Spinner /></div>;
  }

  if (isError) {
    return <ErrorMessage message={error?.message ?? 'Failed to load cameras'} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">CCTV Monitoring</h1>

      {/* Live stream viewer */}
      {activeStream && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Live: {activeStream.name}</h3>
            <button type="button" onClick={() => setActiveStream(null)} className="text-gray-400 hover:text-gray-600" aria-label="Close stream">✕</button>
          </div>
          <div className="mt-2 aspect-video w-full rounded bg-black">
            <div className="flex h-full items-center justify-center text-sm text-gray-400">
              WebRTC stream: {activeStream.streamUrl}
            </div>
          </div>
        </div>
      )}

      {/* Camera grid */}
      {cameras.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No cameras configured.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cameras.map(camera => (
            <CameraCard
              key={camera.id}
              camera={camera}
              onCapture={captureSnapshot}
              isCapturing={isCapturing}
              onViewStream={setActiveStream}
            />
          ))}
        </div>
      )}
    </div>
  );
}
