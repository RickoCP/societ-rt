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

  const totalYearIncome = data?.monthly.reduce((s, r) => s + r.income, 0) ?? 0;
  const totalYearExpense = data?.monthly.reduce((s, r) => s + r.expense, 0) ?? 0;
  const maxBarValue = data ? Math.max(...data.monthly.map(r => Math.max(r.income, r.expense)), 1) : 1;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/finance" className="mb-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400">
            ← Kembali ke Keuangan
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Laporan Keuangan
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Ringkasan pemasukan dan pengeluaran tahun {year}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label htmlFor="summary-year" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Tahun</label>
            <select id="summary-year" value={year} onChange={e => setYear(Number(e.target.value))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
              {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <Button onClick={fetchSummary} variant="secondary" size="sm">🔄 Refresh</Button>
        </div>
      </div>

      {error && <ErrorMessage message={error} />}

      {loading ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 dark:border-gray-700 dark:bg-gray-800">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Memuat laporan...</p>
        </div>
      ) : data && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 shadow-sm dark:border-gray-700 dark:from-gray-800 dark:to-gray-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/40">
                  <span className="text-lg">💰</span>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Saldo Terbaru</p>
                  <p className={`text-xl font-bold ${data.currentBalance >= 0 ? 'text-gray-900 dark:text-gray-100' : 'text-red-700 dark:text-red-400'}`}>
                    {formatRp(data.currentBalance)}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 dark:bg-green-900/40">
                  <span className="text-lg">📈</span>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Total Pemasukan {year}</p>
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">{formatRp(data.totalIncome)}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 dark:bg-red-900/40">
                  <span className="text-lg">📉</span>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Total Pengeluaran {year}</p>
                  <p className="text-xl font-bold text-red-600 dark:text-red-400">{formatRp(data.totalExpense)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Mini Bar Chart */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">Grafik Bulanan</h2>
            <div className="flex items-end gap-1 overflow-x-auto pb-2" style={{ minHeight: '160px' }}>
              {data.monthly.map(row => {
                const incomeHeight = maxBarValue > 0 ? (row.income / maxBarValue) * 120 : 0;
                const expenseHeight = maxBarValue > 0 ? (row.expense / maxBarValue) * 120 : 0;
                return (
                  <div key={row.month} className="flex flex-1 flex-col items-center gap-1" style={{ minWidth: '48px' }}>
                    <div className="flex items-end gap-0.5" style={{ height: '120px' }}>
                      <div
                        className="w-3 rounded-t bg-green-400 dark:bg-green-500 transition-all"
                        style={{ height: `${Math.max(incomeHeight, 2)}px` }}
                        title={`Pemasukan: ${formatRp(row.income)}`}
                      />
                      <div
                        className="w-3 rounded-t bg-red-400 dark:bg-red-500 transition-all"
                        style={{ height: `${Math.max(expenseHeight, 2)}px` }}
                        title={`Pengeluaran: ${formatRp(row.expense)}`}
                      />
                    </div>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">{row.monthLabel.slice(0, 3)}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-1">
                <div className="h-2.5 w-2.5 rounded-sm bg-green-400" />
                <span>Pemasukan</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2.5 w-2.5 rounded-sm bg-red-400" />
                <span>Pengeluaran</span>
              </div>
            </div>
          </div>

          {/* Monthly Table */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Detail per Bulan — {year}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
                  <tr>
                    <th className="px-5 py-3">Bulan</th>
                    <th className="px-5 py-3 text-right">Pemasukan</th>
                    <th className="px-5 py-3 text-right">Pengeluaran</th>
                    <th className="px-5 py-3 text-right">Saldo Akhir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {data.monthly.map(row => {
                    const hasActivity = row.income > 0 || row.expense > 0;
                    return (
                      <tr key={row.month} className={`transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 ${hasActivity ? '' : 'opacity-40'}`}>
                        <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-100">{row.monthLabel}</td>
                        <td className="px-5 py-3 text-right">
                          {row.income > 0 ? (
                            <span className="font-medium text-green-600 dark:text-green-400">+{formatRp(row.income)}</span>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600">-</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {row.expense > 0 ? (
                            <span className="font-medium text-red-600 dark:text-red-400">-{formatRp(row.expense)}</span>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600">-</span>
                          )}
                        </td>
                        <td className={`px-5 py-3 text-right font-semibold ${row.balance >= 0 ? 'text-gray-900 dark:text-gray-100' : 'text-red-700 dark:text-red-400'}`}>
                          {formatRp(row.balance)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-900">
                  <tr className="font-semibold">
                    <td className="px-5 py-3 text-gray-900 dark:text-gray-100">Total {year}</td>
                    <td className="px-5 py-3 text-right text-green-700 dark:text-green-400">+{formatRp(totalYearIncome)}</td>
                    <td className="px-5 py-3 text-right text-red-700 dark:text-red-400">-{formatRp(totalYearExpense)}</td>
                    <td className="px-5 py-3 text-right text-gray-900 dark:text-gray-100">
                      {formatRp(data.monthly[data.monthly.length - 1]?.balance ?? 0)}
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
