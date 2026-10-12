'use client';

import { useState } from 'react';
import { Button } from '@components/atoms/Button';
import { Badge } from '@components/atoms/Badge';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { SearchableSelect } from '@components/molecules/SearchableSelect';
import {
  useDoorSensorAdminViewModel,
  type InstallationRequestRow,
} from '../viewModel/useDoorSensorAdminViewModel';

function statusVariant(status: InstallationRequestRow['status']) {
  if (status === 'approved') return 'success' as const;
  if (status === 'rejected') return 'warning' as const;
  return 'default' as const;
}

export function DoorSensorAdminScreen() {
  const {
    households,
    householdsLoading,
    requests,
    requestsLoading,
    requestsError,
    registerSensor,
    isRegistering,
    registerError,
    registerSuccess,
    resolveRequest,
    isResolving,
    resolvingId,
  } = useDoorSensorAdminViewModel();

  const [householdId, setHouseholdId] = useState('');
  const [tuyaDeviceId, setTuyaDeviceId] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [sirenZone, setSirenZone] = useState('');

  const canSubmit =
    householdId && tuyaDeviceId.trim() && deviceName.trim() && sirenZone.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    registerSensor(
      {
        householdId,
        tuyaDeviceId: tuyaDeviceId.trim(),
        deviceName: deviceName.trim(),
        sirenZone: sirenZone.trim(),
      },
      {
        onSuccess: () => {
          setTuyaDeviceId('');
          setDeviceName('');
          setSirenZone('');
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Registrasi Sensor Pintu
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Daftarkan perangkat sensor pintu Tuya untuk sebuah rumah dan tetapkan
          zona sirine pos keamanan yang dipicu saat pintu terbuka di jam
          monitoring.
        </p>
      </div>

      {/* Register form */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
      >
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Daftarkan perangkat baru
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="household" className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Rumah
            </label>
            <SearchableSelect
              id="household"
              value={householdId}
              onChange={setHouseholdId}
              options={households.map(h => ({
                value: h.id,
                label:
                  `Rumah ${h.householdNumber} — ${h.address}` +
                  (h.headOfHousehold !== '-' ? ` (${h.headOfHousehold})` : ''),
              }))}
              isLoading={householdsLoading}
              loadingText="Memuat rumah…"
              placeholder="Pilih rumah…"
              searchPlaceholder="Cari rumah…"
              noResultsText="Rumah tidak ditemukan"
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="tuyaId" className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Tuya Device ID
            </label>
            <input
              id="tuyaId"
              type="text"
              value={tuyaDeviceId}
              onChange={e => setTuyaDeviceId(e.target.value)}
              placeholder="cth. a38950d3d819b7d448gimn"
              className="rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="deviceName" className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Nama perangkat
            </label>
            <input
              id="deviceName"
              type="text"
              value={deviceName}
              onChange={e => setDeviceName(e.target.value)}
              placeholder="cth. Sensor Pintu Depan"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="sirenZone" className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Zona sirine
            </label>
            <input
              id="sirenZone"
              type="text"
              value={sirenZone}
              onChange={e => setSirenZone(e.target.value)}
              placeholder="cth. pos-utara"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              required
            />
          </div>
        </div>

        {registerError && <ErrorMessage message={registerError} />}
        {registerSuccess && (
          <p className="text-sm font-medium text-green-600 dark:text-green-400" role="status">
            ✓ Sensor berhasil didaftarkan.
          </p>
        )}

        <div>
          <Button
            type="submit"
            variant="primary"
            loading={isRegistering}
            disabled={isRegistering || !canSubmit}
          >
            Daftarkan sensor
          </Button>
        </div>
      </form>

      {/* Installation requests */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Pengajuan pemasangan dari RT
        </h2>

        {requestsError && (
          <ErrorMessage message={requestsError.message ?? 'Gagal memuat pengajuan'} />
        )}

        {requestsLoading ? (
          <p className="text-sm text-gray-500">Memuat…</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-gray-500">Belum ada pengajuan.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {requests.map(r => {
              const busy = isResolving && resolvingId === r.id;
              return (
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
                      Diajukan: {new Date(r.createdAt).toLocaleString('id-ID')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                    {r.status === 'pending' && (
                      <>
                        <Button
                          size="sm"
                          variant="primary"
                          loading={busy}
                          disabled={busy}
                          onClick={() =>
                            resolveRequest({ requestId: r.id, decision: 'approved' })
                          }
                        >
                          Setujui
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            resolveRequest({ requestId: r.id, decision: 'rejected' })
                          }
                        >
                          Tolak
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
