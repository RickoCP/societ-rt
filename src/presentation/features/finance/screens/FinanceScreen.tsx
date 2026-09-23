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
  saldo_awal: '🏦',
  lainnya: '📦',
};

const INPUT_CLASS =
  'w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100';
const LABEL_CLASS =
  'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300';

type ManageForm = 'transaction' | 'iuran' | 'opening';

export function FinanceScreen() {
  const [page, setPage] = useState(1);
  const {
    transactions, balance, totalIncome, totalExpense, totalPages,
    isLoading, isError, error, refetch,
    createTransaction,
    recordIuran,
    setOpeningBalance,
    canManageKas,
  } = useTransactionListViewModel(page);

  // Which manage form is open (null = none).
  const [activeForm, setActiveForm] = useState<ManageForm | null>(null);
  const toggleForm = (form: ManageForm) =>
    setActiveForm(prev => (prev === form ? null : form));

  // Add Transaction form
  const [txType, setTxType] = useState<'income' | 'expense'>('income');
  const [txAmount, setTxAmount] = useState('');
  const [txDesc, setTxDesc] = useState('');
  const [txCategory, setTxCategory] = useState('iuran');
  const [txDate, setTxDate] = useState(new Date().toISOString().slice(0, 10));
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [txSuccess, setTxSuccess] = useState<string | null>(null);

  // Saldo Awal (carry-over) form
  const [openingAmount, setOpeningAmount] = useState('');
  const [openingYear, setOpeningYear] = useState(
    String(new Date().getFullYear() - 1),
  );
  const [openingLoading, setOpeningLoading] = useState(false);
  const [openingError, setOpeningError] = useState<string | null>(null);
  const [openingSuccess, setOpeningSuccess] = useState<string | null>(null);

  // Iuran form
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

  const handleAddOpeningBalance = async () => {
    const amount = parseFloat(openingAmount);
    const year = parseInt(openingYear, 10);
    if (!openingAmount || isNaN(amount) || amount <= 0) {
      setOpeningError('Jumlah saldo awal harus angka positif');
      return;
    }
    if (isNaN(year) || year < 1970 || year > 9999) {
      setOpeningError('Tahun tidak valid');
      return;
    }
    setOpeningLoading(true);
    setOpeningError(null);
    setOpeningSuccess(null);
    try {
      // Saldo awal bersifat REPLACE per tahun (bukan menambah). Submit ulang
      // untuk tahun yang sama akan menimpa nilai sebelumnya.
      await setOpeningBalance({ year, amount });
      setOpeningSuccess(`Saldo awal tahun ${year} berhasil disimpan`);
      setOpeningAmount('');
      refetch();
    } catch (err) {
      setOpeningError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setOpeningLoading(false);
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

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Keuangan
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Kelola kas dan transaksi RT
          </p>
        </div>

        {/* Action bar.
            Mobile: manage-group on rows, utility links on the next.
            sm+: everything inline. */}
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {canManageKas && (
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:flex sm:items-center">
              <button
                type="button"
                onClick={() => toggleForm('transaction')}
                aria-pressed={activeForm === 'transaction'}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activeForm === 'transaction'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700'
                }`}>
                <span className="text-base leading-none">➕</span>
                Transaksi
              </button>
              <button
                type="button"
                onClick={() => toggleForm('iuran')}
                aria-pressed={activeForm === 'iuran'}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activeForm === 'iuran'
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700'
                }`}>
                <span className="text-base leading-none">💳</span>
                Iuran
              </button>
              <button
                type="button"
                onClick={() => toggleForm('opening')}
                aria-pressed={activeForm === 'opening'}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activeForm === 'opening'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700'
                }`}>
                <span className="text-base leading-none">🏦</span>
                Saldo Awal
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <a href="/finance/iuran" className="flex-1 sm:flex-none">
              <Button variant="secondary" size="md" className="w-full">
                📋 Checklist
              </Button>
            </a>
            <a href="/finance/report" className="flex-1 sm:flex-none">
              <Button variant="secondary" size="md" className="w-full">
                📊 Laporan
              </Button>
            </a>
          </div>
        </div>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="relative overflow-hidden rounded-xl border border-blue-200 bg-gradient-to-br from-blue-500 to-indigo-600 p-5 shadow-md dark:border-blue-900/50">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-blue-100">Saldo Kas</p>
              <p className="mt-1 text-2xl font-bold text-white">
                {formatCurrency(balance)}
              </p>
            </div>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 text-xl backdrop-blur-sm">
              💰
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-100 dark:bg-green-900/40">
              <span className="text-lg">📈</span>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Pemasukan
              </p>
              <p className="text-lg font-bold text-green-600 dark:text-green-400">
                {formatCurrency(totalIncome)}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-100 dark:bg-red-900/40">
              <span className="text-lg">📉</span>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Pengeluaran
              </p>
              <p className="text-lg font-bold text-red-600 dark:text-red-400">
                {formatCurrency(totalExpense)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Add Transaction Form */}
      {canManageKas && activeForm === 'transaction' && (
        <div className="overflow-hidden rounded-xl border border-blue-200 bg-white shadow-sm dark:border-blue-900/60 dark:bg-gray-800">
          <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50 px-5 py-3 dark:border-blue-900/40 dark:bg-blue-900/20">
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
              <span>➕</span> Catat Transaksi
            </h2>
            <button
              type="button"
              onClick={() => setActiveForm(null)}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/70 hover:text-gray-600 dark:hover:bg-gray-700"
              aria-label="Tutup form transaksi">
              ✕
            </button>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label htmlFor="tx-type" className={LABEL_CLASS}>Tipe</label>
                <select id="tx-type" value={txType} onChange={e => setTxType(e.target.value as 'income' | 'expense')} className={INPUT_CLASS}>
                  <option value="income">Pemasukan</option>
                  <option value="expense">Pengeluaran</option>
                </select>
              </div>
              <div>
                <label htmlFor="tx-amount" className={LABEL_CLASS}>Jumlah (Rp)</label>
                <input id="tx-amount" type="number" min="0" value={txAmount} onChange={e => setTxAmount(e.target.value)} placeholder="100000" className={INPUT_CLASS} />
              </div>
              <div>
                <label htmlFor="tx-desc" className={LABEL_CLASS}>Keterangan</label>
                <input id="tx-desc" type="text" value={txDesc} onChange={e => setTxDesc(e.target.value)} placeholder="Iuran bulanan" className={INPUT_CLASS} />
              </div>
              <div>
                <label htmlFor="tx-category" className={LABEL_CLASS}>Kategori</label>
                <select id="tx-category" value={txCategory} onChange={e => setTxCategory(e.target.value)} className={INPUT_CLASS}>
                  <option value="iuran">Iuran</option>
                  <option value="donasi">Donasi</option>
                  <option value="keamanan">Keamanan</option>
                  <option value="kebersihan">Kebersihan</option>
                  <option value="operasional">Operasional</option>
                  <option value="lainnya">Lainnya</option>
                </select>
              </div>
              <div>
                <label htmlFor="tx-date" className={LABEL_CLASS}>Tanggal</label>
                <input id="tx-date" type="date" value={txDate} onChange={e => setTxDate(e.target.value)} className={INPUT_CLASS} />
              </div>
            </div>
            <div className="mt-4">
              <Button onClick={handleAddTransaction} disabled={txLoading} loading={txLoading} variant="primary">
                {txLoading ? 'Menyimpan...' : 'Simpan Transaksi'}
              </Button>
            </div>
            {txError && <div className="mt-3"><ErrorMessage message={txError} /></div>}
            {txSuccess && <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700 dark:bg-green-900/20 dark:text-green-400">✓ {txSuccess}</p>}
          </div>
        </div>
      )}

      {/* Iuran Section */}
      {canManageKas && activeForm === 'iuran' && (
        <div className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm dark:border-amber-900/60 dark:bg-gray-800">
          <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50 px-5 py-3 dark:border-amber-900/40 dark:bg-amber-900/20">
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
              <span>💳</span> Catat Pembayaran Iuran
            </h2>
            <button
              type="button"
              onClick={() => setActiveForm(null)}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/70 hover:text-gray-600 dark:hover:bg-gray-700"
              aria-label="Tutup form iuran">
              ✕
            </button>
          </div>
          <div className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label htmlFor="iuran-hh" className={LABEL_CLASS}>Household ID</label>
                <input id="iuran-hh" type="text" value={iuranHouseholdId} onChange={e => setIuranHouseholdId(e.target.value)} placeholder="UUID" className={INPUT_CLASS} />
              </div>
              <div className="w-full sm:w-36">
                <label htmlFor="iuran-month" className={LABEL_CLASS}>Bulan</label>
                <input id="iuran-month" type="month" value={iuranMonth} onChange={e => setIuranMonth(e.target.value)} className={INPUT_CLASS} />
              </div>
              <div className="flex-1">
                <label htmlFor="iuran-tx" className={LABEL_CLASS}>Transaction ID</label>
                <input id="iuran-tx" type="text" value={iuranTxId} onChange={e => setIuranTxId(e.target.value)} placeholder="UUID" className={INPUT_CLASS} />
              </div>
              <Button onClick={handleRecordIuran} disabled={iuranLoading} loading={iuranLoading} variant="primary">
                {iuranLoading ? '...' : 'Catat'}
              </Button>
            </div>
            {iuranError && <div className="mt-3"><ErrorMessage message={iuranError} /></div>}
            {iuranSuccess && <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700 dark:bg-green-900/20 dark:text-green-400">✓ {iuranSuccess}</p>}
          </div>
        </div>
      )}

      {/* Saldo Awal (carry-over) Section */}
      {canManageKas && activeForm === 'opening' && (
        <div className="overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm dark:border-emerald-900/60 dark:bg-gray-800">
          <div className="flex items-center justify-between border-b border-emerald-100 bg-emerald-50 px-5 py-3 dark:border-emerald-900/40 dark:bg-emerald-900/20">
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
              <span>🏦</span> Tambah Saldo Awal Kas
            </h2>
            <button
              type="button"
              onClick={() => setActiveForm(null)}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/70 hover:text-gray-600 dark:hover:bg-gray-700"
              aria-label="Tutup form saldo awal">
              ✕
            </button>
          </div>
          <div className="p-5">
            <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
              Masukkan sisa uang kas dari tahun sebelumnya agar ikut dihitung ke total saldo kas.
              Nilai bersifat menggantikan (replace) per tahun — mengisi ulang tahun yang sama akan menimpa nilai sebelumnya.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="w-full sm:w-32">
                <label htmlFor="opening-year" className={LABEL_CLASS}>Tahun</label>
                <input id="opening-year" type="number" min="1970" max="9999" value={openingYear} onChange={e => setOpeningYear(e.target.value)} placeholder="2025" className={INPUT_CLASS} />
              </div>
              <div className="flex-1">
                <label htmlFor="opening-amount" className={LABEL_CLASS}>Jumlah Saldo Awal (Rp)</label>
                <input id="opening-amount" type="number" min="0" value={openingAmount} onChange={e => setOpeningAmount(e.target.value)} placeholder="5000000" className={INPUT_CLASS} />
              </div>
              <Button onClick={handleAddOpeningBalance} disabled={openingLoading} loading={openingLoading} variant="primary">
                {openingLoading ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </div>
            {openingError && <div className="mt-3"><ErrorMessage message={openingError} /></div>}
            {openingSuccess && <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700 dark:bg-green-900/20 dark:text-green-400">✓ {openingSuccess}</p>}
          </div>
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
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Klik &quot;Transaksi&quot; untuk mencatat transaksi pertama</p>
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
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
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
