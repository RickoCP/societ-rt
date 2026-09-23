'use client';

import { useState } from 'react';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useMonitoringWindowViewModel } from '../viewModel/useMonitoringWindowViewModel';

export interface MonitoringWindowScreenProps {
  /** The resident's household id. Ownership is verified server-side. */
  householdId: string;
}

export function MonitoringWindowScreen({
  householdId,
}: MonitoringWindowScreenProps) {
  const { config, isLoading, isError, error, save, isSaving, saveError, saved } =
    useMonitoringWindowViewModel(householdId);

  const [monitorStart, setMonitorStart] = useState('22:00');
  const [monitorEnd, setMonitorEnd] = useState('05:00');
  const [enabled, setEnabled] = useState(false);

  // Hydrate the form from the loaded config exactly once, using the
  // "adjust state during render on change" pattern (no setState in effect).
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  if (config && hydratedFor !== config.householdId) {
    setHydratedFor(config.householdId);
    setMonitorStart(config.monitorStart);
    setMonitorEnd(config.monitorEnd);
    setEnabled(config.enabled);
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    save({ monitorStart, monitorEnd, enabled });
  };

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Jam Monitoring Pintu
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Atur kapan pintu rumah Anda dipantau. Jika pintu terbuka di jam ini,
          sirine pos keamanan akan berbunyi.
        </p>
      </div>

      {isError && <ErrorMessage message={error?.message ?? 'Terjadi kesalahan'} />}

      {config && !config.deviceConfigured && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          Sensor pintu belum terpasang untuk rumah ini. Anda tetap dapat
          mengatur jam, namun pemantauan aktif setelah admin memasang sensor.
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="font-medium text-gray-900 dark:text-gray-100">
            Aktifkan pemantauan pintu
          </span>
        </label>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="monitorStart"
              className="text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              Mulai
            </label>
            <input
              id="monitorStart"
              type="time"
              value={monitorStart}
              onChange={e => setMonitorStart(e.target.value)}
              className="rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="monitorEnd"
              className="text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              Selesai
            </label>
            <input
              id="monitorEnd"
              type="time"
              value={monitorEnd}
              onChange={e => setMonitorEnd(e.target.value)}
              className="rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
              required
            />
          </div>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          Jam boleh melewati tengah malam (mis. 22:00–05:00 untuk pemantauan
          malam hari).
        </p>

        {saveError && <ErrorMessage message={saveError.message} />}
        {saved && (
          <p className="text-sm font-medium text-green-600" role="status">
            Jam monitoring tersimpan.
          </p>
        )}

        <button
          type="submit"
          disabled={isSaving || isLoading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isSaving ? 'Menyimpan…' : 'Simpan'}
        </button>
      </form>
    </div>
  );
}
