'use client';

import { useState } from 'react';
import { Button } from '@components/atoms/Button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

interface BroadcastAlertFormProps {
  onSubmit: (input: { severity: string; message: string }) => void;
  isSubmitting: boolean;
  error: Error | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITY_OPTIONS: { value: AlertSeverity; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BroadcastAlertForm({ onSubmit, isSubmitting, error }: BroadcastAlertFormProps) {
  const [severity, setSeverity] = useState<AlertSeverity>('medium');
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    onSubmit({ severity, message: message.trim() });
    setMessage('');
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
        Broadcast Neighborhood Alert
      </h3>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Severity selector */}
        <div>
          <label
            htmlFor="alert-severity"
            className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
          >
            Severity
          </label>
          <select
            id="alert-severity"
            value={severity}
            onChange={e => setSeverity(e.target.value as AlertSeverity)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
          >
            {SEVERITY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Message input */}
        <div>
          <label
            htmlFor="alert-message"
            className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
          >
            Alert Message
          </label>
          <textarea
            id="alert-message"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Describe the security alert..."
            rows={3}
            maxLength={500}
            className="w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:placeholder:text-gray-500"
            required
          />
          <p className="mt-0.5 text-xs text-gray-400">{message.length}/500</p>
        </div>

        {/* Error display */}
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">
            {error.message}
          </p>
        )}

        {/* Submit button */}
        <Button
          type="submit"
          loading={isSubmitting}
          disabled={!message.trim() || isSubmitting}
        >
          Broadcast Alert
        </Button>
      </form>
    </div>
  );
}
