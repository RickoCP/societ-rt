/**
 * Tenant — Domain entity representing a community organization (RT/RW)
 * registered on the platform.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 1.3, 1.4, 2.1, 2.5
 */

export interface Tenant {
  readonly id: string;
  readonly name: string;
  readonly subdomain: string;
  readonly rtRwNumber: string;
  readonly region: string;
  readonly address: string;
  readonly contactPerson: string;
  readonly logoUrl: string | null;
  readonly primaryColor: string | null;
  readonly secondaryColor: string | null;
  readonly status: 'active' | 'suspended';
  readonly subscriptionPlanId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to register a new tenant. */
export interface CreateTenantInput {
  readonly name: string;
  readonly rtRwNumber: string;
  readonly region: string;
  readonly address: string;
  readonly contactPerson: string;
}

/** Optional branding fields a Ketua_RT can update. */
export interface UpdateTenantBrandingInput {
  readonly logoUrl?: string;
  readonly primaryColor?: string;
  readonly secondaryColor?: string;
}
