'use client';

/**
 * TenantSelector — PLATFORM_ADMIN-only control for choosing which tenant's data
 * the admin pages display (members, org-units, settings, subscription).
 *
 * A platform admin logs into the platform tenant, which owns no customer data,
 * so the admin pages are empty by default. Selecting a tenant here stores the
 * choice in a shared Zustand store; the admin view-models append the selected
 * tenant id to their API calls as `?tenantId=`, which the server honors for
 * PLATFORM_ADMIN only and audits (see resolveTargetTenant on the BFF side).
 *
 * Renders nothing for non-platform-admins (the control is irrelevant and the
 * server would reject any cross-tenant request anyway — fail securely).
 *
 * @see 05-security-guideline (least privilege; server is the source of truth)
 * @see 03-configuration-convention (i18n for user-facing text)
 */

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MembershipRole } from '@core/domains/membership/types';
import { usePermissions } from '@presentation/hooks/usePermissions';
import { useAdminTenantSelectionStore } from '@infrastructure/stateManagement';

interface TenantOption {
  id: string;
  name: string;
  subdomain: string;
  status: string;
}

interface TenantListResponse {
  data: TenantOption[];
  total: number;
  page: number;
  totalPages: number;
}

async function fetchTenantOptions(): Promise<TenantOption[]> {
  const res = await fetch('/api/tenants?page=1', { credentials: 'include' });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch tenants');
  }
  const json = (await res.json()) as TenantListResponse;
  return json.data;
}

export function TenantSelector() {
  const { t } = useTranslation();
  const { role } = usePermissions();
  const selectedTenantId = useAdminTenantSelectionStore(s => s.selectedTenantId);
  const selectTenant = useAdminTenantSelectionStore(s => s.selectTenant);

  const isPlatformAdmin = role === MembershipRole.PLATFORM_ADMIN;

  const { data: tenants, isLoading } = useQuery({
    queryKey: ['tenant-selector-options'],
    queryFn: fetchTenantOptions,
    enabled: isPlatformAdmin,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Only platform admins can view other tenants' data.
  if (!isPlatformAdmin) {
    return null;
  }

  const handleChange = (value: string) => {
    if (!value) {
      selectTenant(null, null);
      return;
    }
    const match = tenants?.find(item => item.id === value) ?? null;
    selectTenant(value, match?.name ?? null);
  };

  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
      <span className="text-sm" aria-hidden="true">
        🏢
      </span>
      <label
        htmlFor="admin-tenant-selector"
        className="text-sm font-medium text-amber-900 dark:text-amber-200">
        {t('admin.tenantSelector.label', 'Lihat data tenant')}
      </label>
      <select
        id="admin-tenant-selector"
        value={selectedTenantId ?? ''}
        onChange={e => handleChange(e.target.value)}
        disabled={isLoading}
        className="flex-1 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-60 dark:border-amber-800 dark:bg-gray-900 dark:text-gray-100">
        <option value="">
          {t('admin.tenantSelector.ownTenant', 'Tenant saya (platform)')}
        </option>
        {tenants?.map(tenant => (
          <option key={tenant.id} value={tenant.id}>
            {tenant.name} ({tenant.subdomain})
            {tenant.status === 'suspended'
              ? ` — ${t('admin.tenantSelector.suspended', 'suspended')}`
              : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

export default TenantSelector;
