'use client';

import { useState, useRef } from 'react';
import { Button } from '@components/atoms/Button';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import Link from 'next/link';

interface ImportResult {
  createdCount: number;
  skippedRows: Array<{ row: number; errors: string[] }>;
}

export default function ResidentImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setResult(null);
    setError(null);

    // Preview first 5 lines
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').slice(0, 6).join('\n');
      setCsvPreview(lines);
    };
    reader.readAsText(selected);
  };

  const handleImport = async () => {
    if (!file) {
      setError('Please select a CSV file first');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/residents/import', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.message ?? json.code ?? 'Import failed');
        return;
      }

      setResult(json.data);
      // Prevent double import — clear file after success
      setFile(null);
      setCsvPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setCsvPreview(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Import Residents (CSV)
        </h1>
        <Link
          href="/residents"
          className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          ← Back to Residents
        </Link>
      </div>

      {/* Instructions */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <h2 className="mb-2 text-sm font-semibold text-blue-800 dark:text-blue-300">
          CSV Format
        </h2>
        <p className="mb-2 text-xs text-blue-700 dark:text-blue-400">
          The CSV file must have the following columns (in order):
        </p>
        <code className="block overflow-x-auto rounded bg-white p-2 text-xs text-gray-800 dark:bg-gray-800 dark:text-gray-200">
          household_number,name,nik,date_of_birth,gender,phone,status,categories,emergency_contact_name,emergency_contact_phone,emergency_contact_relationship
        </code>
        <p className="mt-2 text-xs text-blue-700 dark:text-blue-400">
          <a
            href="/sample-residents-import.csv"
            download
            className="font-medium underline">
            Download sample CSV
          </a>{' '}
          for reference.
        </p>
      </div>

      {/* File Upload */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Upload CSV File
        </h2>
        <div className="flex flex-col gap-4">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100 dark:text-gray-400 dark:file:bg-blue-900/30 dark:file:text-blue-300"
              aria-label="Select CSV file"
            />
          </div>

          {file && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Selected: <span className="font-medium">{file.name}</span> ({(file.size / 1024).toFixed(1)} KB)
            </p>
          )}

          {csvPreview && (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                Preview (first 5 rows):
              </p>
              <pre className="max-h-40 overflow-auto rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                {csvPreview}
              </pre>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleImport}
              disabled={!file || loading}
              variant="primary">
              {loading ? 'Importing...' : 'Import'}
            </Button>
            <Button onClick={handleReset} variant="secondary">
              Reset
            </Button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && <ErrorMessage message={error} />}

      {/* Result */}
      {result && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Import Result
          </h2>
          <div className="mb-4 flex gap-6">
            <div className="rounded-md bg-green-50 px-4 py-3 dark:bg-green-900/20">
              <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                {result.createdCount}
              </p>
              <p className="text-xs text-green-600 dark:text-green-500">Created</p>
            </div>
            <div className="rounded-md bg-yellow-50 px-4 py-3 dark:bg-yellow-900/20">
              <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">
                {result.skippedRows.length}
              </p>
              <p className="text-xs text-yellow-600 dark:text-yellow-500">Skipped</p>
            </div>
          </div>

          {result.skippedRows.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                Skipped Rows:
              </h3>
              <div className="max-h-60 overflow-auto rounded border border-gray-200 dark:border-gray-700">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.skippedRows.map((sr) => (
                      <tr key={sr.row} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="px-3 py-2 font-mono">{sr.row}</td>
                        <td className="px-3 py-2 text-red-600 dark:text-red-400">
                          {sr.errors.join('; ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
