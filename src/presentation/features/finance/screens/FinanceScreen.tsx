'use client';

import { useState } from 'react';
import { Badge } from '@components/atoms/Badge';
import { Button } from '@components/atoms/Button';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useTransactionListViewModel } from '../viewModel/useTransactionListViewModel';

interface TransactionRow {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  category: string;
  date: string;
  createdBy: string;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const categoryIcons: Record<string, string> = {
  iuran: '💳',
  donasi: '🎁',
  keamanan: '🔒',
  kebersihan: '🧹',
  operasional: '⚙️',
  lainnya: '📦',
};

export function FinanceScreen() {
  const [page, setPage] = useState(1);
  const {
    transactions, balance, totalPages, isLoading, isError, error, refetch,
    createTransaction, isCreatingTx,
    recordIuran, isRecordingIuran,
    checkIuran,
    fetchReport, isFetchingReport,
  } = useTransactionListViewModel(page);

  // Add Transaction form
  const [showAddTx, setShowAddTx] = useState(false);
  const [txType, setTxType] = useState<'income' | 'expense'>('income');
  const [txAmount, setTxAmount] = useState('');
  const [txDesc, setTxDesc] = useState('');
  const [txCategory, setTxCategory] = useState('iuran');
  const [txDate, setTxDate] = useState(new Date().toISOString().slice(0, 10));
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [txSuccess, setTxSuccess] = useState<string | null>(null);

  // Iuran form
  const [showIuran, setShowIuran] = useState(false);
  const [iuranHouseholdId, setIuranHouseholdId] = useState('');
  const [iuranMonth, setIuranMonth] = useState(new Date().toISOString().slice(0, 7));
  const [iuranTxId, setIuranTxId] = useState('');
  const [iuranLoading, setIuranLoading] = useState(false);
  const [iuranError, setIuranError] = useState<string | null>(null);
  const [iuranSuccess, setIuranSuccess] = useState<string | null>(null);

  const handleAddTransaction = async () => {
    const amount = parseFloat(txAmount);
    if (!txAmount || isNaN(amount)) {
      setTxError('Jumlah harus diisi dengan angka valid');
      return;
    }
    setTxLoading(true);
    setTxError(null);
    setTxSuccess(null);
    try {
      await createTransaction({ type: txType, amount, description: txDesc, category: txCategory, date: txDate });
      setTxSuccess('Transaksi berhasil dicatat');
      setTxAmount('');
      setTxDesc('');
      refetch();
    } catch (err) {
      setTxError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setTxLoading(false);
    }
  };

  const handleRecordIuran = async () => {
    if (!iuranHouseholdId || !iuranMonth || !iuranTxId) {
      setIuranError('Semua field wajib diisi');
      return;
    }
    setIuranLoading(true);
    setIuranError(null);
    setIuranSuccess(null);
    try {
      await recordIuran({ householdId: iuranHouseholdId, month: iuranMonth, transactionId: iuranTxId });
      setIuranSuccess('Pembayaran iuran berhasil dicatat!');
    } catch (err) {
      setIuranError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIuranLoading(false);
    }
  };

  // Calculate totals
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Keuangan
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Kelola kas dan transaksi RT
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={() => { setShowAddTx(!showAddTx); setShowIuran(false); }}>
            {showAddTx ? 'Tutup' : '+ Transaksi'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { setShowIuran(!showIuran); setShowAddTx(false); }}>
            {showIuran ? 'Tutup' : '💳 Iuran'}
          </Button>
          <a href="/finance/iuran"><Button variant="secondary" size="sm">📋 Checklist</Button></a>
          <a href="/finance/report"><Button variant="secondary" size="sm">📊 Laporan</Button></a>
        </div>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 shadow-sm dark:border-gray-700 dark:from-gray-800 dark:to-gray-800">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Saldo Kas</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(balance)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/40">
              <span className="text-sm">📈</span>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Pemasukan</p>
              <p className="text-lg font-bold text-green-600 dark:text-green-400">{formatCurrency(totalIncome)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/40">
              <span className="text-sm">📉</span>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Pengeluaran</p>
              <p className="text-lg font-bold text-red-600 dark:text-red-400">{formatCurrency(totalExpense)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Add Transaction Form */}
      {showAddTx && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm dark:border-blue-800 dark:bg-blue-900/20">
          <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">Catat Transaksi</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="tx-type" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Tipe</label>
              <select id="tx-type" value={txType} onChange={e => setTxType(e.target.value as 'income' | 'expense')} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                <option value="income">Pemasukan</option>
                <option value="expense">Pengeluaran</option>
              </select>
            </div>
            <div>
              <label htmlFor="tx-amount" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Jumlah (Rp)</label>
              <input id="tx-amount" type="number" min="0" value={txAmount} onChange={e => setTxAmount(e.target.value)} placeholder="100000" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor="tx-desc" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Keterangan</label>
              <input id="tx-desc" type="text" value={txDesc} onChange={e => setTxDesc(e.target.value)} placeholder="Iuran bulanan" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor="tx-category" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Kategori</label>
              <select id="tx-category" value={txCategory} onChange={e => setTxCategory(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                <option value="iuran">Iuran</option>
                <option value="donasi">Donasi</option>
                <option value="keamanan">Keamanan</option>
                <option value="kebersihan">Kebersihan</option>
                <option value="operasional">Operasional</option>
                <option value="lainnya">Lainnya</option>
              </select>
            </div>
            <div>
              <label htmlFor="tx-date" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Tanggal</label>
              <input id="tx-date" type="date" value={txDate} onChange={e => setTxDate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={handleAddTransaction} disabled={txLoading} variant="primary">
              {txLoading ? 'Menyimpan...' : 'Simpan Transaksi'}
            </Button>
          </div>
          {txError && <div className="mt-3"><ErrorMessage message={txError} /></div>}
          {txSuccess && <p className="mt-3 text-sm font-medium text-green-700 dark:text-green-400">✓ {txSuccess}</p>}
        </div>
      )}

      {/* Iuran Section */}
      {showIuran && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm dark:border-amber-800 dark:bg-amber-900/20">
          <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">Catat Pembayaran Iuran</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="iuran-hh" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Household ID</label>
              <input id="iuran-hh" type="text" value={iuranHouseholdId} onChange={e => setIuranHouseholdId(e.target.value)} placeholder="UUID" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div className="w-full sm:w-36">
              <label htmlFor="iuran-month" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Bulan</label>
              <input id="iuran-month" type="month" value={iuranMonth} onChange={e => setIuranMonth(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div className="flex-1">
              <label htmlFor="iuran-tx" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Transaction ID</label>
              <input id="iuran-tx" type="text" value={iuranTxId} onChange={e => setIuranTxId(e.target.value)} placeholder="UUID" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <Button onClick={handleRecordIuran} disabled={iuranLoading} variant="primary" size="sm">
              {iuranLoading ? '...' : 'Catat'}
            </Button>
          </div>
          {iuranError && <div className="mt-3"><ErrorMessage message={iuranError} /></div>}
          {iuranSuccess && <p className="mt-3 text-sm font-medium text-green-700 dark:text-green-400">✓ {iuranSuccess}</p>}
        </div>
      )}

      {isError && <ErrorMessage message={error?.message ?? 'Failed to load transactions'} />}

      {/* Transactions List */}
      {isLoading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-gray-200 dark:bg-gray-700" />
                <div className="flex-1">
                  <div className="h-4 w-40 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="mt-1 h-3 w-24 rounded bg-gray-100 dark:bg-gray-700" />
                </div>
                <div className="h-5 w-24 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && transactions.length === 0 && !isError && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-16 dark:border-gray-600">
          <span className="text-4xl">💰</span>
          <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">Belum ada transaksi</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Klik &quot;+ Transaksi&quot; untuk mencatat transaksi pertama</p>
        </div>
      )}

      {!isLoading && transactions.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Riwayat Transaksi
            </h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {transactions.map((tx: TransactionRow) => (
              <div key={tx.id} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
                {/* Icon */}
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  tx.type === 'income'
                    ? 'bg-green-100 dark:bg-green-900/40'
                    : 'bg-red-100 dark:bg-red-900/40'
                }`}>
                  <span className="text-sm">{categoryIcons[tx.category] ?? '📦'}</span>
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {tx.description || tx.category}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>{formatDate(tx.date)}</span>
                    <span>•</span>
                    <span className="capitalize">{tx.category}</span>
                  </div>
                </div>

                {/* Type Badge */}
                <Badge variant={tx.type === 'income' ? 'success' : 'danger'}>
                  {tx.type === 'income' ? 'Masuk' : 'Keluar'}
                </Badge>

                {/* Amount */}
                <p className={`shrink-0 text-sm font-semibold ${
                  tx.type === 'income'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                </p>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
