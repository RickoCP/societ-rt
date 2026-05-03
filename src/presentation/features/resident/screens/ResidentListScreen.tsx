'use client';

import { useState, useCallback } from 'react';
import { DataTable, type DataTableColumn } from '@components/organisms/DataTable';
import { SearchBar } from '@components/molecules/SearchBar';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { Button } from '@components/atoms/Button';
import { useHouseholdListViewModel } from '../viewModel/useHouseholdListViewModel';

interface HouseholdRow {
  id: string;
  householdNumber: string;
  address: string;
  block: string;
  headOfHousehold: string;
  residentCount: number;
  createdAt: string;
}

const columns: DataTableColumn<HouseholdRow>[] = [
  { key: 'householdNumber', header: 'No. KK' },
  { key: 'headOfHousehold', header: 'Head of Household' },
  { key: 'address', header: 'Address' },
  { key: 'block', header: 'Block' },
  {
    key: 'residentCount',
    header: 'Residents',
    render: row => <span>{row.residentCount}</span>,
  },
];

export function ResidentListScreen() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { households, totalPages, isLoading, isError, error } =
    useHouseholdListViewModel(page, search);

  const handleSearch = useCallback((query: string) => {
    setSearch(query);
    setPage(1);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Resident Management
        </h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm">
            <a href="/residents/import">Import CSV</a>
          </Button>
        </div>
      </div>

      <SearchBar
        placeholder="Search households..."
        onSearch={handleSearch}
      />

      {isError && (
        <ErrorMessage message={error?.message ?? 'Failed to load residents'} />
      )}

      <DataTable<HouseholdRow>
        columns={columns}
        data={households}
        loading={isLoading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        rowKey={row => row.id}
        emptyMessage="No households found"
      />
    </div>
  );
}
