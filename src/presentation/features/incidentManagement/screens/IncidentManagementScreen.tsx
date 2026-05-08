'use client';

import { useState } from 'react';
import { Spinner } from '@components/atoms/Spinner';
import { Button } from '@components/atoms/Button';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useIncidentManagementViewModel } from '../viewModel/useIncidentManagementViewModel';
import { IncidentFiltersBar } from '../components/IncidentFiltersBar';
import { IncidentListCard } from '../components/IncidentListCard';
import { IncidentDetailPanel } from '../components/IncidentDetailPanel';
import { IncidentCreateForm } from '../components/IncidentCreateForm';

export function IncidentManagementScreen() {
  const vm = useIncidentManagementViewModel();
  const [showCreateForm, setShowCreateForm] = useState(false);

  if (vm.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (vm.isError) {
    return <ErrorMessage message={vm.error?.message ?? 'Failed to load incidents'} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Incident Management</h1>
        <Button onClick={() => setShowCreateForm(!showCreateForm)} variant="danger" size="sm">
          {showCreateForm ? 'Cancel' : '+ Report Incident'}
        </Button>
      </div>

      {showCreateForm && (
        <IncidentCreateForm
          onSubmit={vm.createIncident}
          isSubmitting={vm.isCreating}
          error={vm.createError}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      <IncidentFiltersBar filters={vm.filters} onFilterChange={vm.updateFilters} />

      {/* Detail panel */}
      {vm.selectedIncidentId && vm.incidentDetail && (
        <IncidentDetailPanel
          incident={vm.incidentDetail}
          timeline={vm.timeline}
          onUpdateStatus={vm.updateStatus}
          isUpdating={vm.isUpdatingStatus}
          onClose={() => vm.setSelectedIncidentId(null)}
        />
      )}

      {/* Incident list */}
      {vm.incidents.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No incidents found.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {vm.incidents.map(incident => (
            <IncidentListCard
              key={incident.id}
              incident={incident}
              onSelect={vm.setSelectedIncidentId}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {vm.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="secondary" disabled={vm.page <= 1} onClick={() => vm.setPage(vm.page - 1)}>
            Previous
          </Button>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Page {vm.page} of {vm.totalPages}
          </span>
          <Button size="sm" variant="secondary" disabled={vm.page >= vm.totalPages} onClick={() => vm.setPage(vm.page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
