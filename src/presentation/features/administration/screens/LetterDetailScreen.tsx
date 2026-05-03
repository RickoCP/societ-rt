'use client';

import { Badge } from '@components/atoms/Badge';
import { Spinner } from '@components/atoms/Spinner';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useLetterDetailViewModel } from '../viewModel/useLetterDetailViewModel';

type StatusVariant = 'warning' | 'success' | 'danger' | 'default';

const statusVariantMap: Record<string, StatusVariant> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

export function LetterDetailScreen({ id }: { id: string }) {
  const { letter, isLoading, isError, error } = useLetterDetailViewModel(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorMessage
        message={error?.message ?? 'Failed to load letter detail'}
      />
    );
  }

  if (!letter) {
    return <ErrorMessage message="Letter request not found" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Letter Request Detail
        </h1>
        <Badge variant={statusVariantMap[letter.status] ?? 'default'}>
          {letter.status}
        </Badge>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Type</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">{letter.type}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Requested By</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">{letter.requestedBy}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Created</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">{letter.createdAt}</dd>
          </div>
          {letter.documentUrl && (
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Document</dt>
              <dd className="mt-1 text-sm text-blue-600 underline dark:text-blue-400">
                <a href={letter.documentUrl} target="_blank" rel="noopener noreferrer">
                  Download
                </a>
              </dd>
            </div>
          )}
          {letter.notes && (
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Notes</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">{letter.notes}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
