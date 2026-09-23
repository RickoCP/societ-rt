'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@components/atoms/Button';
import { Badge } from '@components/atoms/Badge';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { ConfirmDialog } from '@components/molecules/ConfirmDialog';
import Link from 'next/link';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];

interface HouseholdIuran {
  householdId: string;
  householdNumber: string;
  address: string;
  block: string;
  headName: string;
  months: Record<string, string>;
}

export default function IuranStatusPage() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<HouseholdIuran[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [updating, setUpdating] = useState<string | null>(null);
  const [iuranAmount, setIuranAmount] = useState('100000');
  const [visibleMonths, setVisibleMonths] = useState(currentMonth + 1);

  // Pending "uncheck" (membatalkan status lunas) awaiting confirmation.
  const [pendingUncheck, setPendingUncheck] = useState<{
    householdId: string;
    householdNumber: string;
    headName: string;
    month: string;
    monthLabel: string;
  } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/finance/iuran/batch?year=${year}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.message ?? 'Failed to load');
        return;
      }
      setData(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [year]);

  // Data-fetching effect: reload the iuran grid when the year filter changes.
  // The setState calls live inside fetchData (loading/data), which is the
  // intended data-sync pattern here, not a cascading render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggle = async (householdId: string, householdNumber: string, month: string, currentlyPaid: boolean) => {
    const key = `${householdId}-${month}`;
    setUpdating(key);
    const amount = parseFloat(iuranAmount);

    setData(prev => prev.map(h => {
      if (h.householdId !== householdId) return h;
      return { ...h, months: { ...h.months, [month]: currentlyPaid ? 'unpaid' : 'paid' } };
    }));

    try {
      const res = await fetch('/api/finance/iuran/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          householdId,
          month,
          paid: !currentlyPaid,
          amount: !currentlyPaid && amount > 0 ? amount : undefined,
          householdNumber,
        }),
      });
      if (!res.ok) {
        setData(prev => prev.map(h => {
          if (h.householdId !== householdId) return h;
          return { ...h, months: { ...h.months, [month]: currentlyPaid ? 'paid' : 'unpaid' } };
        }));
      }
    } catch {
      setData(prev => prev.map(h => {
        if (h.householdId !== householdId) return h;
        return { ...h, months: { ...h.months, [month]: currentlyPaid ? 'paid' : 'unpaid' } };
      }));
    } finally {
      setUpdating(null);
    }
  };

  const monthKeys = Array.from({ length: visibleMonths }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

  const filteredData = data.filter(h => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!h.headName.toLowerCase().includes(q) && !h.address.toLowerCase().includes(q) && !h.householdNumber.includes(q)) {
        return false;
      }
    }
    if (filterStatus === 'paid') return monthKeys.every(m => h.months[m] === 'paid');
    if (filterStatus === 'unpaid') return monthKeys.some(m => h.months[m] !== 'paid');
    return true;
  });

  const getPaidCount = (h: HouseholdIuran) => monthKeys.filter(m => h.months[m] === 'paid').length;
  const totalPaid = filteredData.reduce((sum, h) => sum + getPaidCount(h), 0);
  const totalLunas = filteredData.filter(h => getPaidCount(h) === visibleMonths).length;
  const totalBelum = filteredData.filter(h => getPaidCount(h) < visibleMonths).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Iuran Bulanan
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Checklist pembayaran iuran warga tahun {year}
          </p>
        </div>
        <Link href="/finance" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400">
          ← Kembali ke Keuangan
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total KK</p>
          <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{filteredData.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Lunas Semua</p>
          <p className="mt-1 text-xl font-bold text-green-600 dark:text-green-400">{totalLunas}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Belum Lunas</p>
          <p className="mt-1 text-xl font-bold text-red-600 dark:text-red-400">{totalBelum}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Pemasukan</p>
          <p className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">
            Rp {(totalPaid * Number(iuranAmount || 0)).toLocaleString('id-ID')}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div>
          <label htmlFor="iuran-year" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Tahun</label>
          <select id="iuran-year" value={year} onChange={e => setYear(Number(e.target.value))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
            {[currentYear - 1, currentYear, currentYear + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="iuran-nominal" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Nominal (Rp)</label>
          <input id="iuran-nominal" type="number" min="0" value={iuranAmount} onChange={e => setIuranAmount(e.target.value)} className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label htmlFor="iuran-search" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Cari</label>
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input id="iuran-search" type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Nama, alamat, No. KK..." className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
          </div>
        </div>
        <div>
          <label htmlFor="iuran-filter" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Filter</label>
          <select id="iuran-filter" value={filterStatus} onChange={e => setFilterStatus(e.target.value as 'all' | 'paid' | 'unpaid')} className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
            <option value="all">Semua</option>
            <option value="paid">Lunas</option>
            <option value="unpaid">Belum Lunas</option>
          </select>
        </div>
        <Button onClick={fetchData} variant="secondary" size="sm">🔄 Refresh</Button>
      </div>

      {/* Info Banner */}
      <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-900/20">
        <span className="text-sm">💡</span>
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Centang checkbox = warga sudah bayar iuran (otomatis tercatat sebagai pemasukan Rp {Number(iuranAmount || 0).toLocaleString('id-ID')})
        </p>
      </div>

      {error && <ErrorMessage message={error} />}

      {/* Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 dark:border-gray-700 dark:bg-gray-800">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Memuat data iuran...</p>
        </div>
      ) : filteredData.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-16 dark:border-gray-600">
          <span className="text-4xl">💳</span>
          <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">Tidak ada data</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            {searchQuery ? 'Coba kata kunci lain' : 'Tambahkan data rumah tangga terlebih dahulu'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
              <tr>
                <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase text-gray-500 dark:bg-gray-900 dark:text-gray-400">Warga</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Progress</th>
                {monthKeys.map((mk, i) => (
                  <th key={mk} className="px-2 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {MONTH_LABELS[i]}
                  </th>
                ))}
                {visibleMonths < 12 && (
                  <th className="px-2 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => setVisibleMonths(prev => Math.min(12, prev + 1))}
                      className="rounded-lg bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300"
                      aria-label="Tambah bulan"
                    >
                      +
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredData.map(h => {
                const paidCount = getPaidCount(h);
                const progress = Math.round((paidCount / visibleMonths) * 100);
                return (
                  <tr key={h.householdId} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="sticky left-0 z-10 bg-white px-4 py-3 dark:bg-gray-800">
                      <p className="font-medium text-gray-900 dark:text-gray-100">{h.headName}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{h.householdNumber} {h.block ? `• Blok ${h.block}` : ''}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <Badge variant={paidCount === visibleMonths ? 'success' : paidCount > 0 ? 'warning' : 'danger'}>
                          {paidCount}/{visibleMonths}
                        </Badge>
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                          <div
                            className={`h-full rounded-full transition-all ${
                              progress === 100 ? 'bg-green-500' : progress > 0 ? 'bg-amber-500' : 'bg-gray-300'
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    {monthKeys.map(monthKey => {
                      const isPaid = h.months[monthKey] === 'paid';
                      const isUpdating = updating === `${h.householdId}-${monthKey}`;
                      return (
                        <td key={monthKey} className="px-2 py-3 text-center">
                          <label className="inline-flex cursor-pointer items-center">
                            <input
                              type="checkbox"
                              checked={isPaid}
                              disabled={isUpdating}
                              onChange={() => {
                                if (isPaid) {
                                  // Uncheck = membatalkan status lunas → konfirmasi dulu.
                                  setPendingUncheck({
                                    householdId: h.householdId,
                                    householdNumber: h.householdNumber,
                                    headName: h.headName,
                                    month: monthKey,
                                    monthLabel: MONTH_LABELS[monthKeys.indexOf(monthKey)] ?? monthKey,
                                  });
                                } else {
                                  // Check = tandai lunas, langsung simpan.
                                  handleToggle(h.householdId, h.householdNumber, monthKey, isPaid);
                                }
                              }}
                              className="h-4 w-4 cursor-pointer rounded border-gray-300 text-green-600 focus:ring-green-500 disabled:cursor-wait disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700"
                              aria-label={`${h.headName} - ${MONTH_LABELS[monthKeys.indexOf(monthKey)]} - ${isPaid ? 'lunas' : 'belum'}`}
                            />
                          </label>
                        </td>
                      );
                    })}
                    {visibleMonths < 12 && <td />}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Konfirmasi pembatalan status lunas */}
      <ConfirmDialog
        open={pendingUncheck !== null}
        title="Batalkan status lunas?"
        description={
          pendingUncheck
            ? `Tandai iuran ${pendingUncheck.monthLabel} ${year} untuk ${pendingUncheck.headName} sebagai BELUM lunas? Pemasukan yang tercatat untuk pembayaran ini akan dibatalkan.`
            : undefined
        }
        confirmLabel="Ya, batalkan"
        cancelLabel="Batal"
        variant="danger"
        loading={
          pendingUncheck
            ? updating === `${pendingUncheck.householdId}-${pendingUncheck.month}`
            : false
        }
        onConfirm={() => {
          if (!pendingUncheck) return;
          const p = pendingUncheck;
          setPendingUncheck(null);
          // currentlyPaid = true karena ini aksi uncheck.
          handleToggle(p.householdId, p.householdNumber, p.month, true);
        }}
        onCancel={() => setPendingUncheck(null)}
      />
    </div>
  );
}
