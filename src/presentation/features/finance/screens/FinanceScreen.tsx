'use client';

import { useState } from 'react';
import { DataTable, type DataTableColumn } from '@components/organisms/DataTable';
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

const columns: DataTableColumn<TransactionRow>[] = [
  { key: 'date', header: 'Date' },
  { key: 'description', header: 'Description' },
  { key: 'category', header: 'Category' },
  {
    key: 'type',
    header: 'Type',
    render: row => (
      <Badge variant={row.type === 'income' ? 'success' : 'danger'}>
        {row.type}
      </Badge>
    ),
  },
  {
    key: 'amount',
    header: 'Amount',
    render: row => (
      <span className={row.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
        {row.type === 'income' ? '+' : '-'}{formatCurrency(row.amount)}
      </span>
    ),
  },
];

export function FinanceScreen() {
  const [page, setPage] = useState(1);
  const { transactions, balance, totalPages, isLoading, isError, error, refetch } =
    useTransactionListViewModel(page);

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

  // Iuran status check
  const [iuranCheckHhId, setIuranCheckHhId] = useState('');
  const [iuranCheckMonth, setIuranCheckMonth] = useState('');
  const [iuranStatus, setIuranStatus] = useState<string | null>(null);
  const [iuranCheckError, setIuranCheckError] = useState<string | null>(null);

  // Report
  const [showReport, setShowReport] = useState(false);
  const [reportStart, setReportStart] = useState('');
  const [reportEnd, setReportEnd] = useState('');
  const [reportData, setReportData] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const handleAddTransaction = async () => {
    const amount = parseFloat(txAmount);
    if (!txAmount || isNaN(amount)) {
      setTxError('Valid amount is required');
      return;
    }
    setTxLoading(true);
    setTxError(null);
    setTxSuccess(null);
    try {
      const res = await fetch('/api/finance/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: txType, amount, description: txDesc, category: txCategory, date: txDate }),
      });
      const json = await res.json();
      if (!res.ok) {
        setTxError(json.message ?? json.code ?? 'Failed');
        return;
      }
      setTxSuccess(`Transaction recorded: ${json.data.id}`);
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
      setIuranError('All fields are required');
      return;
    }
    setIuranLoading(true);
    setIuranError(null);
    setIuranSuccess(null);
    try {
      const res = await fetch('/api/finance/iuran', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ householdId: iuranHouseholdId, month: iuranMonth, transactionId: iuranTxId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setIuranError(json.message ?? json.code ?? 'Failed');
        return;
      }
      setIuranSuccess('Iuran payment recorded!');
    } catch (err) {
      setIuranError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIuranLoading(false);
    }
  };

  const handleCheckIuran = async () => {
    if (!iuranCheckHhId || !iuranCheckMonth) {
      setIuranCheckError('Household ID and month are required');
      return;
    }
    setIuranCheckError(null);
    setIuranStatus(null);
    try {
      const res = await fetch(`/api/finance/iuran?householdId=${iuranCheckHhId}&month=${iuranCheckMonth}`);
      const json = await res.json();
      if (!res.ok) {
        setIuranCheckError(json.message ?? json.code ?? 'Not found');
        return;
      }
      setIuranStatus(JSON.stringify(json.data, null, 2));
    } catch (err) {
      setIuranCheckError(err instanceof Error ? err.message : 'Network error');
    }
  };

  const handleGetReport = async () => {
    if (!reportStart || !reportEnd) {
      setReportError('Start and end dates are required');
      return;
    }
    setReportLoading(true);
    setReportError(null);
    setReportData(null);
    try {
      const res = await fetch(`/api/finance/report?startDate=${reportStart}&endDate=${reportEnd}`);
      const json = await res.json();
      if (!res.ok) {
        setReportError(json.message ?? json.code ?? 'Failed');
        return;
      }
      setReportData(JSON.stringify(json.data, null, 2));
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Finance Management</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={() => setShowAddTx(!showAddTx)}>
            {showAddTx ? 'Close' : '+ Transaction'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowIuran(!showIuran)}>
            {showIuran ? 'Close' : 'Iuran'}
          </Button>
          <a href="/finance/iuran">
            <Button variant="secondary" size="sm">Iuran Checklist</Button>
          </a>
          <Button variant="secondary" size="sm" onClick={() => setShowReport(!showReport)}>
            {showReport ? 'Close' : 'Report'}
          </Button>
          <a href="/finance/report">
            <Button variant="secondary" size="sm">Ringkasan</Button>
          </a>
        </div>
      </div>

      {/* Balance Card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
        <p className="text-sm text-gray-500 dark:text-gray-400">Current Balance</p>
        <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(balance)}</p>
      </div>

      {/* Add Transaction Form */}
      {showAddTx && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Record Transaction</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="tx-type" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Type</label>
              <select id="tx-type" value={txType} onChange={e => setTxType(e.target.value as 'income' | 'expense')} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </div>
            <div>
              <label htmlFor="tx-amount" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Amount (Rp)</label>
              <input id="tx-amount" type="number" min="0" value={txAmount} onChange={e => setTxAmount(e.target.value)} placeholder="100000" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor="tx-desc" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
              <input id="tx-desc" type="text" value={txDesc} onChange={e => setTxDesc(e.target.value)} placeholder="Iuran bulanan" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor="tx-category" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Category</label>
              <select id="tx-category" value={txCategory} onChange={e => setTxCategory(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                <option value="iuran">Iuran</option>
                <option value="donasi">Donasi</option>
                <option value="keamanan">Keamanan</option>
                <option value="kebersihan">Kebersihan</option>
                <option value="operasional">Operasional</option>
                <option value="lainnya">Lainnya</option>
              </select>
            </div>
            <div>
              <label htmlFor="tx-date" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Date</label>
              <input id="tx-date" type="date" value={txDate} onChange={e => setTxDate(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={handleAddTransaction} disabled={txLoading} variant="primary">
              {txLoading ? 'Recording...' : 'Record Transaction'}
            </Button>
          </div>
          {txError && <div className="mt-3"><ErrorMessage message={txError} /></div>}
          {txSuccess && <p className="mt-3 text-sm font-medium text-green-700 dark:text-green-400">{txSuccess}</p>}
        </div>
      )}

      {/* Iuran Section */}
      {showIuran && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Iuran Management</h2>
          <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Record Payment</h3>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="iuran-hh" className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Household ID</label>
              <input id="iuran-hh" type="text" value={iuranHouseholdId} onChange={e => setIuranHouseholdId(e.target.value)} placeholder="UUID" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div className="w-full sm:w-36">
              <label htmlFor="iuran-month" className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Month</label>
              <input id="iuran-month" type="month" value={iuranMonth} onChange={e => setIuranMonth(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div className="flex-1">
              <label htmlFor="iuran-tx" className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Transaction ID</label>
              <input id="iuran-tx" type="text" value={iuranTxId} onChange={e => setIuranTxId(e.target.value)} placeholder="UUID from transaction" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <Button onClick={handleRecordIuran} disabled={iuranLoading} variant="primary" size="sm">
              {iuranLoading ? 'Recording...' : 'Record'}
            </Button>
          </div>
          {iuranError && <div className="mb-4"><ErrorMessage message={iuranError} /></div>}
          {iuranSuccess && <p className="mb-4 text-sm font-medium text-green-700 dark:text-green-400">{iuranSuccess}</p>}

          <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Check Status</h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <input type="text" value={iuranCheckHhId} onChange={e => setIuranCheckHhId(e.target.value)} placeholder="Household ID" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" aria-label="Household ID for status check" />
            </div>
            <div className="w-full sm:w-36">
              <input type="month" value={iuranCheckMonth} onChange={e => setIuranCheckMonth(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" aria-label="Month for status check" />
            </div>
            <Button onClick={handleCheckIuran} variant="secondary" size="sm">Check</Button>
          </div>
          {iuranCheckError && <div className="mt-3"><ErrorMessage message={iuranCheckError} /></div>}
          {iuranStatus && (
            <pre className="mt-3 overflow-auto rounded bg-gray-50 p-3 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">{iuranStatus}</pre>
          )}
        </div>
      )}

      {/* Report Section */}
      {showReport && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Financial Report</h2>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div>
              <label htmlFor="report-start" className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Start Date</label>
              <input id="report-start" type="date" value={reportStart} onChange={e => setReportStart(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor="report-end" className="mb-1 block text-xs text-gray-600 dark:text-gray-400">End Date</label>
              <input id="report-end" type="date" value={reportEnd} onChange={e => setReportEnd(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <Button onClick={handleGetReport} disabled={reportLoading} variant="primary" size="sm">
              {reportLoading ? 'Loading...' : 'Get Report'}
            </Button>
          </div>
          {reportError && <ErrorMessage message={reportError} />}
          {reportData && (
            <pre className="max-h-80 overflow-auto rounded bg-gray-50 p-3 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">{reportData}</pre>
          )}
        </div>
      )}

      {/* Transactions Table */}
      {isError && <ErrorMessage message={error?.message ?? 'Failed to load transactions'} />}

      <DataTable<TransactionRow>
        columns={columns}
        data={transactions}
        loading={isLoading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        rowKey={row => row.id}
        emptyMessage="No transactions found"
      />
    </div>
  );
}
