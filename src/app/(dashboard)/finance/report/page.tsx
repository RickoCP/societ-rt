'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@components/atoms/Button';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import Link from 'next/link';

interface MonthlyRow {
  month: number;
  year: number;
  monthLabel: string;
  income: number;
  expense: number;
  balance: number;
}

interface SummaryData {
  currentBalance: number;
  totalIncome: number;
  totalExpense: number;
  year: number;
  monthly: MonthlyRow[];
}

function formatRp(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
}

export default function FinanceReportPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/finance/summary?year=${year}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.message ?? 'Failed to load');
        return;
      }
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Ringkasan Keuangan</h1>
        <Link href="/finance" className="text-sm text-blue-600 hover:underline dark:text-blue-400">← Back to Finance</Link>
      </div>

      {/* Year selector */}
      <div className="flex items-end gap-3">
        <div>
          <label htmlFor="summary-year" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Tahun</label>
          <select id="summary-year" value={year} onChange={e => setYear(Number(e.target.value))} className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
            {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <Button onClick={fetchSummary} variant="secondary" size="sm">Refresh</Button>
      </div>

      {error && <ErrorMessage message={error} />}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      ) : data && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
              <p className="text-sm text-gray-500 dark:text-gray-400">Saldo Terbaru</p>
              <p className={`mt-1 text-2xl font-bold ${data.currentBalance >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                {formatRp(data.currentBalance)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Pemasukan</p>
              <p className="mt-1 text-2xl font-bold text-green-700 dark:text-green-400">
                {formatRp(data.totalIncome)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Pengeluaran</p>
              <p className="mt-1 text-2xl font-bold text-red-700 dark:text-red-400">
                {formatRp(data.totalExpense)}
              </p>
            </div>
          </div>

          {/* Monthly Table */}
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Riwayat Keuangan per Bulan — {year}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-3">Bulan</th>
                    <th className="px-4 py-3">Tahun</th>
                    <th className="px-4 py-3 text-right">Pemasukan</th>
                    <th className="px-4 py-3 text-right">Pengeluaran</th>
                    <th className="px-4 py-3 text-right">Saldo Akhir</th>
                  </tr>
                </thead>
                <tbody>
                  {data.monthly.map(row => {
                    const hasActivity = row.income > 0 || row.expense > 0;
                    return (
                      <tr key={row.month} className={`border-b border-gray-100 dark:border-gray-800 ${hasActivity ? '' : 'opacity-50'}`}>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{row.monthLabel}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{row.year}</td>
                        <td className="px-4 py-3 text-right text-green-600 dark:text-green-400">
                          {row.income > 0 ? `+${formatRp(row.income)}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-right text-red-600 dark:text-red-400">
                          {row.expense > 0 ? `-${formatRp(row.expense)}` : '-'}
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold ${row.balance >= 0 ? 'text-gray-900 dark:text-gray-100' : 'text-red-700 dark:text-red-400'}`}>
                          {formatRp(row.balance)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-gray-300 bg-gray-50 font-semibold dark:border-gray-600 dark:bg-gray-900">
                  <tr>
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100" colSpan={2}>Total {year}</td>
                    <td className="px-4 py-3 text-right text-green-700 dark:text-green-400">
                      +{formatRp(data.monthly.reduce((s, r) => s + r.income, 0))}
                    </td>
                    <td className="px-4 py-3 text-right text-red-700 dark:text-red-400">
                      -{formatRp(data.monthly.reduce((s, r) => s + r.expense, 0))}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
                      {formatRp(data.monthly[11]?.balance ?? 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
