'use client';

import { Button } from '@components/atoms/Button';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { usePrivacyViewModel } from '../viewModel/usePrivacyViewModel';

export function PrivacyScreen() {
  const {
    requestExport,
    isExporting,
    exportData,
    exportError,
    requestDeletion,
    isDeleting,
    deletionData,
    deletionError,
    updateConsent,
    isUpdatingConsent,
    consentError,
    consentSuccess,
  } = usePrivacyViewModel();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        Privacy &amp; Data Management
      </h1>

      <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Data Export</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Request a copy of all your personal data.
        </p>
        {exportError && <ErrorMessage message={exportError.message} />}
        {exportData && (
          <p className="mt-2 text-sm text-green-600 dark:text-green-400">
            Export ready.{' '}
            <a href={exportData.downloadUrl} className="underline" target="_blank" rel="noopener noreferrer">
              Download
            </a>
          </p>
        )}
        <Button size="sm" className="mt-3" onClick={() => requestExport()} disabled={isExporting}>
          {isExporting ? 'Requesting…' : 'Request Export'}
        </Button>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Data Deletion</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Request permanent deletion of your account and data.
        </p>
        {deletionError && <ErrorMessage message={deletionError.message} />}
        {deletionData && (
          <p className="mt-2 text-sm text-green-600 dark:text-green-400">
            Deletion request submitted (ID: {deletionData.requestId}).
          </p>
        )}
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => requestDeletion()} disabled={isDeleting}>
          {isDeleting ? 'Requesting…' : 'Request Deletion'}
        </Button>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Consent Preferences</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage your data processing consent.
        </p>
        {consentError && <ErrorMessage message={consentError.message} />}
        {consentSuccess && (
          <p className="mt-2 text-sm text-green-600 dark:text-green-400">Consent updated.</p>
        )}
        <div className="mt-3 flex gap-3">
          <Button
            size="sm"
            onClick={() => updateConsent({ analytics: true, marketing: true })}
            disabled={isUpdatingConsent}
          >
            Accept All
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => updateConsent({ analytics: false, marketing: false })}
            disabled={isUpdatingConsent}
          >
            Reject All
          </Button>
        </div>
      </section>
    </div>
  );
}
