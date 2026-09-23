'use client';

import { useState } from 'react';
import { Button } from '@components/atoms/Button';
import { Badge } from '@components/atoms/Badge';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import {
  useDoorInstallationRequestViewModel,
} from '../viewModel/useDoorInstallationRequestViewModel';
import type { InstallationRequestRow } from '../viewModel/useDoorSensorAdminViewModel';

function statusVariant(status: InstallationRequestRow['status']) {
  if (status === 'approved') return 'success' as const;
  if (status === 'rejected') return 'warning' as const;
  return 'default' as const;
}

export function DoorInstallationRequestScreen() {
  const {
    households,
    householdsLoading,
    requests,
    requestsLoading,
    submitRequest,
    isSubmitting,
    submitError,
    submitSuccess,
  } = useDoorInstallationRequestViewModel();

  const [householdId, setHouseholdId] = useState('');
  const [note, setNote] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!householdId) return;
    submitRequest(
      { householdId, note: note.trim() || undefined },
      { onSuccess: () => setNote('') },
    );
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Ajukan Pemasangan Sensor Pintu
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Ajukan pemasangan sensor pintu untuk sebuah rumah. Pengajuan akan
          ditinjau dan didaftarkan oleh admin platform.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="household" className="text-sm font-medium text-gray-700 dark:text-gray-200">
            Rumah
          </label>
          <select
            id="household"
            value={householdId}
            onChange={e => setHouseholdId(e.target.value)}
            disabled={householdsLoading}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            required
          >
            <option value="">
              {householdsLoading ? 'Memuat rumah…' : 'Pilih rumah…'}
            </option>
            {households.map(h => (
              <option key={h.id} value={h.id}>
                Rumah {h.householdNumber} — {h.address}
                {h.headOfHousehold !== '-' ? ` (${h.headOfHousehold})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="note" className="text-sm font-medium text-gray-700 dark:text-gray-200">
            Catatan (opsional)
          </label>
          <textarea
            id="note"
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="cth. warga meminta pemasangan untuk keamanan malam hari"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
        </div>

        {submitError && <ErrorMessage message={submitError} />}
        {submitSuccess && (
          <p className="text-sm font-medium text-green-600 dark:text-green-400" role="status">
            ✓ Pengajuan terkirim. Menunggu persetujuan admin.
          </p>
        )}

        <div>
          <Button
            type="submit"
            variant="primary"
            loading={isSubmitting}
            disabled={isSubmitting || !householdId}
          >
            Kirim pengajuan
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Pengajuan RT ini
        </h2>
        {requestsLoading ? (
          <p className="text-sm text-gray-500">Memuat…</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-gray-500">Belum ada pengajuan.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {requests.map(r => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700"
              >
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    Rumah {r.householdNumber}
                    {r.householdBlock ? ` — Blok ${r.householdBlock}` : ''}
                  </p>
                  <p className="text-gray-500">{r.householdAddress}</p>
                  {r.note && <p className="text-gray-500">Catatan: {r.note}</p>}
                  <p className="text-xs text-gray-400">
                    {new Date(r.createdAt).toLocaleString('id-ID')}
                  </p>
                </div>
                <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
