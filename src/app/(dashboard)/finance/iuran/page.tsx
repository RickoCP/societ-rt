'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@components/atoms/Button';
import { Badge } from '@components/atoms/Badge';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import Link from 'next/link';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
  const currentMonth = new Date().getMonth(); // 0-indexed

  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<HouseholdIuran[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [updating, setUpdating] = useState<string | null>(null);

  // Nominal iuran
  const [iuranAmount, setIuranAmount] = useState('100000');

  // Dynamic months — start with Jan to current month, can add more
  const [visibleMonths, setVisibleMonths] = useState(currentMonth + 1); // 1-12

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

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggle = async (householdId: string, householdNumber: string, month: string, currentlyPaid: boolean) => {
    const key = `${householdId}-${month}`;
    setUpdating(key);

    const amount = parseFloat(iuranAmount);

    // Optimistic update
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
        // Revert
        setData(prev => prev.map(h => {
          if (h.householdId !== householdId) return h;
          return { ...h, months: { ...h.months, [month]: currentlyPaid ? 'paid' : 'unpaid' } };
        }));
      }
    } catch {
      // Revert
      setData(prev => prev.map(h => {
        if (h.householdId !== householdId) return h;
        return { ...h, months: { ...h.months, [month]: currentlyPaid ? 'paid' : 'unpaid' } };
      }));
    } finally {
      setUpdating(null);
    }
  };

  const handleAddMonth = () => {
    if (visibleMonths < 12) {
      setVisibleMonths(prev => prev + 1);
    }
  };

  // Generate month keys based on visible months
  const monthKeys = Array.from({ length: visibleMonths }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

  // Filter data
  const filteredData = data.filter(h => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!h.headName.toLowerCase().includes(q) && !h.address.toLowerCase().includes(q) && !h.householdNumber.includes(q)) {
        return false;
      }
    }
    if (filterStatus === 'paid') {
      return monthKeys.every(m => h.months[m] === 'paid');
    }
    if (filterStatus === 'unpaid') {
      return monthKeys.some(m => h.months[m] !== 'paid');
    }
    return true;
  });

  const getPaidCount = (h: HouseholdIuran) => monthKeys.filter(m => h.months[m] === 'paid').length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Iuran Bulanan {year}</h1>
        <Link href="/finance" className="text-sm text-blue-600 hover:underline dark:text-blue-400">← Back to Finance</Link>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="iuran-year" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Tahun</label>
          <select id="iuran-year" value={year} onChange={e => setYear(Number(e.target.value))} className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
            {[currentYear - 1, currentYear, currentYear + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="iuran-nominal" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Nominal Iuran (Rp)</label>
          <input
            id="iuran-nominal"
            type="number"
            min="0"
            value={iuranAmount}
            onChange={e => setIuranAmount(e.target.value)}
            className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="iuran-search" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Cari</label>
          <input
            id="iuran-search"
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cari nama, alamat, atau No. KK..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
        </div>
        <div>
          <label htmlFor="iuran-filter" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Filter</label>
          <select id="iuran-filter" value={filterStatus} onChange={e => setFilterStatus(e.target.value as 'all' | 'paid' | 'unpaid')} className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
            <option value="all">Semua</option>
            <option value="paid">Lunas</option>
            <option value="unpaid">Belum Lunas</option>
          </select>
        </div>
        <Button onClick={fetchData} variant="secondary" size="sm">Refresh</Button>
      </div>

      {/* Info */}
      <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
        Centang checkbox = warga sudah bayar iuran (otomatis tercatat sebagai pemasukan Rp {Number(iuranAmount || 0).toLocaleString('id-ID')})
      </div>

      {error && <ErrorMessage message={error} />}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      ) : filteredData.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Tidak ada data household.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
              <tr>
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 dark:bg-gray-900">Nama / No. KK</th>
                <th className="px-3 py-2">Alamat</th>
                <th className="px-3 py-2 text-center">Total</th>
                {monthKeys.map((mk, i) => (
                  <th key={mk} className="px-2 py-2 text-center text-xs whitespace-nowrap">
                    {MONTH_LABELS[i]} {year}
                  </th>
                ))}
                {visibleMonths < 12 && (
                  <th className="px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={handleAddMonth}
                      className="rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300"
                      aria-label="Tambah kolom bulan berikutnya"
                    >
                      + Bulan
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredData.map(h => {
                const paidCount = getPaidCount(h);
                return (
                  <tr key={h.householdId} className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 dark:bg-gray-800">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{h.headName}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{h.householdNumber}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                      <div>{h.address}</div>
                      {h.block && <div className="text-xs text-gray-400">Blok {h.block}</div>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant={paidCount === visibleMonths ? 'success' : paidCount > 0 ? 'warning' : 'danger'}>
                        {paidCount}/{visibleMonths}
                      </Badge>
                    </td>
                    {monthKeys.map(monthKey => {
                      const isPaid = h.months[monthKey] === 'paid';
                      const isUpdating = updating === `${h.householdId}-${monthKey}`;
                      return (
                        <td key={monthKey} className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={isPaid}
                            disabled={isUpdating}
                            onChange={() => handleToggle(h.householdId, h.householdNumber, monthKey, isPaid)}
                            className="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-wait disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700"
                            aria-label={`${h.headName} - ${monthKey} - ${isPaid ? 'lunas' : 'belum'}`}
                          />
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

      {/* Summary */}
      {!loading && filteredData.length > 0 && (
        <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
          <span>Total KK: <strong>{filteredData.length}</strong></span>
          <span>Lunas Semua: <strong>{filteredData.filter(h => getPaidCount(h) === visibleMonths).length}</strong></span>
          <span>Belum Lunas: <strong>{filteredData.filter(h => getPaidCount(h) < visibleMonths).length}</strong></span>
          <span>Total Pemasukan Iuran: <strong>Rp {(filteredData.reduce((sum, h) => sum + getPaidCount(h), 0) * Number(iuranAmount || 0)).toLocaleString('id-ID')}</strong></span>
        </div>
      )}
    </div>
  );
}
