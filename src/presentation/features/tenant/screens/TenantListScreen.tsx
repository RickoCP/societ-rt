'use client';

import { useRef, useState } from 'react';
import { DataTable, type DataTableColumn } from '@components/organisms/DataTable';
import { Badge } from '@components/atoms/Badge';
import { Button } from '@components/atoms/Button';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import {
  useTenantListViewModel,
  type SirenImportSummary,
} from '../viewModel/useTenantListViewModel';

interface TenantRow {
  id: string;
  name: string;
  subdomain: string;
  status: string;
  rtRwNumber: string;
  region: string;
  sirenDeviceId: string | null;
  createdAt: string;
}

export function TenantListScreen() {
  const [page, setPage] = useState(1);
  const {
    tenants,
    totalPages,
    isLoading,
    isError,
    error,
    updateSirenDevice,
    importSirenCsv,
    isImportingSiren,
    sirenExportUrl,
  } = useTenantListViewModel(page);

  // Per-row siren editor state, keyed by tenant id.
  const [sirenDrafts, setSirenDrafts] = useState<Record<string, string>>({});
  const [sirenSavingId, setSirenSavingId] = useState<string | null>(null);
  const [sirenFeedback, setSirenFeedback] = useState<
    Record<string, { ok: boolean; message: string }>
  >({});

  // Bulk import state.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importSummary, setImportSummary] = useState<SirenImportSummary | null>(
    null,
  );
  const [importError, setImportError] = useState<string | null>(null);

  const handleImportFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    // Reset the input so selecting the same file again re-triggers onChange.
    e.target.value = '';
    if (!file) return;

    setImportError(null);
    setImportSummary(null);
    try {
      const summary = await importSirenCsv(file);
      setImportSummary(summary);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : 'Gagal mengimpor CSV',
      );
    }
  };

  const draftFor = (row: TenantRow) =>
    sirenDrafts[row.id] ?? row.sirenDeviceId ?? '';

  const handleSaveSiren = async (row: TenantRow) => {
    const value = draftFor(row).trim();
    setSirenSavingId(row.id);
    setSirenFeedback(prev => ({ ...prev, [row.id]: undefined as never }));
    try {
      await updateSirenDevice({
        tenantId: row.id,
        sirenDeviceId: value.length > 0 ? value : null,
      });
      setSirenFeedback(prev => ({
        ...prev,
        [row.id]: {
          ok: true,
          message: value.length > 0 ? 'Tersimpan' : 'Dikosongkan',
        },
      }));
      // Clear the local draft so the refreshed server value is shown.
      setSirenDrafts(prev => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
    } catch (err) {
      setSirenFeedback(prev => ({
        ...prev,
        [row.id]: {
          ok: false,
          message: err instanceof Error ? err.message : 'Gagal menyimpan',
        },
      }));
    } finally {
      setSirenSavingId(null);
    }
  };

  const columns: DataTableColumn<TenantRow>[] = [
    { key: 'name', header: 'Nama RT' },
    { key: 'subdomain', header: 'Subdomain' },
    { key: 'rtRwNumber', header: 'RT/RW' },
    { key: 'region', header: 'Wilayah' },
    {
      key: 'status',
      header: 'Status',
      render: row => (
        <Badge variant={row.status === 'active' ? 'success' : 'warning'}>
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'sirenDeviceId',
      header: 'Device ID Sirine',
      render: row => {
        const feedback = sirenFeedback[row.id];
        const isSaving = sirenSavingId === row.id;
        const dirty = draftFor(row).trim() !== (row.sirenDeviceId ?? '');
        return (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={draftFor(row)}
                onChange={e =>
                  setSirenDrafts(prev => ({ ...prev, [row.id]: e.target.value }))
                }
                placeholder="cth. a38950d3d819b7d448gimn"
                aria-label={`Device ID sirine untuk ${row.name}`}
                className="w-52 rounded-lg border border-gray-300 px-2.5 py-1.5 font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                onKeyDown={e => e.key === 'Enter' && handleSaveSiren(row)}
              />
              <Button
                size="sm"
                variant="primary"
                disabled={isSaving || !dirty}
                loading={isSaving}
                onClick={() => handleSaveSiren(row)}>
                Simpan
              </Button>
            </div>
            {feedback && (
              <span
                className={`text-[11px] font-medium ${
                  feedback.ok
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                {feedback.ok ? '✓ ' : ''}
                {feedback.message}
              </span>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Manajemen RT
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Kelola RT dan atur device ID sirine untuk tombol darurat (panic
            button) masing-masing RT.
          </p>
        </div>

        {/* Bulk actions: Export (download CSV/template) + Import (upload CSV) */}
        <div className="flex flex-wrap items-center gap-2">
          <a href={sirenExportUrl}>
            <Button variant="secondary" size="md">
              📥 Export CSV
            </Button>
          </a>
          <Button
            variant="primary"
            size="md"
            loading={isImportingSiren}
            disabled={isImportingSiren}
            onClick={() => fileInputRef.current?.click()}>
            📤 Import CSV
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>
      </div>

      {/* Import result panel */}
      {importError && <ErrorMessage message={importError} />}
      {importSummary && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 font-medium text-green-700 dark:bg-green-900/20 dark:text-green-300">
              ✓ {importSummary.updatedCount} diperbarui
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {importSummary.clearedCount} dikosongkan
            </span>
            {importSummary.skippedRows.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                {importSummary.skippedRows.length} dilewati
              </span>
            )}
          </div>
          {importSummary.skippedRows.length > 0 && (
            <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-amber-100 bg-amber-50/50 p-3 text-xs dark:border-amber-900/40 dark:bg-amber-900/10">
              <p className="mb-1 font-semibold text-amber-800 dark:text-amber-200">
                Baris yang dilewati:
              </p>
              <ul className="space-y-0.5 text-amber-700 dark:text-amber-300">
                {importSummary.skippedRows.map(s => (
                  <li key={s.row}>
                    Baris {s.row}: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Info banner */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/15 dark:text-amber-200">
        <p className="flex items-start gap-2">
          <span>🚨</span>
          <span>
            Saat warga menekan tombol darurat, sistem membunyikan sirine sesuai{' '}
            <strong>Device ID</strong> RT tersebut. Kosongkan untuk memakai
            perangkat default (dari konfigurasi server). Untuk input massal:{' '}
            <strong>Export CSV</strong> untuk mengunduh template berisi semua RT,
            edit kolom <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/40">sirenDeviceId</code>{' '}
            di Excel, lalu <strong>Import CSV</strong>.
          </span>
        </p>
      </div>

      {isError && (
        <ErrorMessage message={error?.message ?? 'Gagal memuat data RT'} />
      )}

      <DataTable<TenantRow>
        columns={columns}
        data={tenants}
        loading={isLoading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        rowKey={row => row.id}
        emptyMessage="Belum ada data RT"
      />
    </div>
  );
}
