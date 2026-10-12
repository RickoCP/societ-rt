/**
 * Seed data dummy untuk halaman-halaman admin & platform.
 *
 * Melengkapi data yang belum di-seed oleh `prisma/seed.ts` dan
 * `prisma/run-seed-tenants.ts` agar halaman admin tidak kosong:
 *   - Tambahan tenant (termasuk status `suspended`) → kartu Active/Suspended
 *   - Invoice `paid` (Monthly Revenue) + `pending` (Pending Invoices)
 *   - Subscription per tenant (halaman /admin/subscription)
 *   - Audit log (halaman /admin/audit-log)
 *   - Incident keamanan (halaman /admin/security)
 *   - Feature flag override (halaman /admin/feature-flags)
 *   - OrgUnit + Membership (halaman /admin/org-units & /admin/members)
 *
 * PRASYARAT: jalankan `npm run prisma:seed` dan `npm run prisma:seed:tenants`
 * lebih dulu agar plan, tenant platform, Super Admin, rt01, dan rt02 tersedia.
 *
 * Idempotent: aman dijalankan berulang kali (upsert pada unique key, dan
 * guard "sudah ada" untuk tabel tanpa natural unique key seperti AuditLog,
 * Incident, dan OrgUnit).
 *
 * Usage: npx tsx prisma/seed-admin-dummy.ts
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashSync } from 'bcryptjs';

// ---------------------------------------------------------------------------
// Pinned IDs (konsisten dengan seed.ts / run-seed-tenants.ts)
// ---------------------------------------------------------------------------

const PLAN_FREE_ID = '00000000-0000-0000-0000-000000000001';
const PLAN_PRO_ID = '00000000-0000-0000-0000-000000000002';
const PLAN_ENTERPRISE_ID = '00000000-0000-0000-0000-000000000003';

const PLATFORM_TENANT_ID = '00000000-0000-0000-0000-000000000010';
const RT01_ID = '00000000-0000-0000-0000-000000000011';
const RT02_ID = '00000000-0000-0000-0000-000000000012';

// Tenant tambahan khusus seed admin ini.
// CATATAN: id TIDAK di-pin — biarkan Prisma meng-generate UUID dan gunakan
// `subdomain` (unique) sebagai kunci idempotensi. Memin id berisiko tabrakan
// primary key bila UUID tsb sudah dipakai baris lain.
const SUPER_ADMIN_EMAIL = 'superadmin@societ.app';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Tanggal relatif terhadap sekarang (offset hari, boleh negatif). */
function daysFromNow(offset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
}

/** Awal bulan berjalan — dipakai untuk periode billing. */
function startOfThisMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Akhir bulan berjalan. */
function endOfThisMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const passwordHash = hashSync('Admin@123456', 12);

  try {
    // -----------------------------------------------------------------------
    // 0. Resolusi dependency wajib (fail securely jika prasyarat belum ada)
    // -----------------------------------------------------------------------
    const platformTenant = await prisma.tenant.findUnique({
      where: { id: PLATFORM_TENANT_ID },
    });
    const superAdmin = await prisma.user.findUnique({
      where: {
        tenantId_email: {
          tenantId: PLATFORM_TENANT_ID,
          email: SUPER_ADMIN_EMAIL,
        },
      },
    });

    if (!platformTenant || !superAdmin) {
      throw new Error(
        'Prasyarat tidak ditemukan. Jalankan `npm run prisma:seed` lalu ' +
          '`npm run prisma:seed:tenants` sebelum seed admin dummy ini.',
      );
    }

    const actorUserId = superAdmin.id;

    // -----------------------------------------------------------------------
    // 1. Tenant tambahan (status beragam → kartu Active/Suspended terisi)
    // -----------------------------------------------------------------------
    const rt03 = await prisma.tenant.upsert({
      where: { subdomain: 'rt03' },
      update: { status: 'active' },
      create: {
        name: 'RT 03 Griya Asri Lestari',
        subdomain: 'rt03',
        rtRwNumber: '003/007',
        region: 'Kelurahan Mekarjaya, Kecamatan Sukmajaya, Kota Depok',
        address: 'Jl. Asri Lestari No. 3, Depok 16412',
        contactPerson: 'Hendra Gunawan',
        primaryColor: '#059669',
        secondaryColor: '#047857',
        status: 'active',
        subscriptionPlanId: PLAN_FREE_ID,
      },
    });
    console.log(`✅ Tenant ${rt03.subdomain} (${rt03.status})`);

    const rt04 = await prisma.tenant.upsert({
      where: { subdomain: 'rt04' },
      update: { status: 'suspended' },
      create: {
        name: 'RT 04 Bumi Pertiwi',
        subdomain: 'rt04',
        rtRwNumber: '004/007',
        region: 'Kelurahan Mekarjaya, Kecamatan Sukmajaya, Kota Depok',
        address: 'Jl. Pertiwi Raya No. 4, Depok 16412',
        contactPerson: 'Dewi Lestari',
        primaryColor: '#dc2626',
        secondaryColor: '#991b1b',
        status: 'suspended',
        subscriptionPlanId: PLAN_PRO_ID,
      },
    });
    console.log(`✅ Tenant ${rt04.subdomain} (${rt04.status})`);

    // Ketua untuk tenant baru (biar halaman members tenant tsb tidak kosong)
    const extraUsers = [
      {
        tenantId: rt03.id,
        name: 'Hendra Gunawan',
        email: 'ketua@rt03.societ.app',
        role: 'Ketua_RT' as const,
      },
      {
        tenantId: rt03.id,
        name: 'Maya Putri',
        email: 'warga@rt03.societ.app',
        role: 'Warga' as const,
      },
      {
        tenantId: rt04.id,
        name: 'Dewi Lestari',
        email: 'ketua@rt04.societ.app',
        role: 'Ketua_RT' as const,
      },
    ];
    for (const u of extraUsers) {
      await prisma.user.upsert({
        where: { tenantId_email: { tenantId: u.tenantId, email: u.email } },
        update: { name: u.name },
        create: {
          tenantId: u.tenantId,
          name: u.name,
          email: u.email,
          passwordHash,
          role: u.role,
          status: 'active',
        },
      });
      console.log(`  ✅ User ${u.role}: ${u.email}`);
    }

    // -----------------------------------------------------------------------
    // 2. Subscription per tenant (halaman /admin/subscription)
    //    tenantId UNIQUE → upsert aman.
    // -----------------------------------------------------------------------
    const subscriptions = [
      {
        tenantId: RT01_ID,
        planId: PLAN_PRO_ID,
        status: 'ACTIVE' as const,
        currentPeriodEnd: daysFromNow(18),
        trialEndsAt: null,
      },
      {
        tenantId: RT02_ID,
        planId: PLAN_ENTERPRISE_ID,
        status: 'ACTIVE' as const,
        currentPeriodEnd: daysFromNow(25),
        trialEndsAt: null,
      },
      {
        tenantId: rt03.id,
        planId: PLAN_FREE_ID,
        status: 'TRIAL' as const,
        currentPeriodEnd: null,
        trialEndsAt: daysFromNow(9),
      },
      {
        tenantId: rt04.id,
        planId: PLAN_PRO_ID,
        status: 'SUSPENDED' as const,
        currentPeriodEnd: daysFromNow(-5),
        trialEndsAt: null,
      },
    ];
    for (const sub of subscriptions) {
      await prisma.subscription.upsert({
        where: { tenantId: sub.tenantId },
        update: {
          planId: sub.planId,
          status: sub.status,
          currentPeriodEnd: sub.currentPeriodEnd,
          trialEndsAt: sub.trialEndsAt,
          suspendedAt: sub.status === 'SUSPENDED' ? daysFromNow(-5) : null,
          statusReason:
            sub.status === 'SUSPENDED' ? 'Overdue payment (dummy)' : null,
        },
        create: {
          tenantId: sub.tenantId,
          planId: sub.planId,
          status: sub.status,
          startedAt: daysFromNow(-40),
          currentPeriodEnd: sub.currentPeriodEnd,
          trialEndsAt: sub.trialEndsAt,
          suspendedAt: sub.status === 'SUSPENDED' ? daysFromNow(-5) : null,
          statusReason:
            sub.status === 'SUSPENDED' ? 'Overdue payment (dummy)' : null,
        },
      });
      console.log(`  💳 Subscription ${sub.tenantId} → ${sub.status}`);
    }

    // -----------------------------------------------------------------------
    // 3. Invoice (Monthly Revenue dari `paid`, Pending Invoices dari `pending`)
    //    idempotencyKey UNIQUE → upsert aman & deterministik.
    // -----------------------------------------------------------------------
    const invoices = [
      // Paid (menyumbang Monthly Revenue)
      {
        key: 'dummy-inv-rt01-paid-01',
        tenantId: RT01_ID,
        planName: 'Pro',
        amount: 99000,
        status: 'paid' as const,
        paidAt: daysFromNow(-20),
      },
      {
        key: 'dummy-inv-rt02-paid-01',
        tenantId: RT02_ID,
        planName: 'Enterprise',
        amount: 299000,
        status: 'paid' as const,
        paidAt: daysFromNow(-18),
      },
      {
        key: 'dummy-inv-rt01-paid-02',
        tenantId: RT01_ID,
        planName: 'Pro',
        amount: 99000,
        status: 'paid' as const,
        paidAt: daysFromNow(-3),
      },
      // Pending (menyumbang Pending Invoices)
      {
        key: 'dummy-inv-rt03-pending-01',
        tenantId: rt03.id,
        planName: 'Free',
        amount: 0,
        status: 'pending' as const,
        paidAt: null,
      },
      {
        key: 'dummy-inv-rt04-pending-01',
        tenantId: rt04.id,
        planName: 'Pro',
        amount: 99000,
        status: 'pending' as const,
        paidAt: null,
      },
      // Failed (variasi untuk filter di UI)
      {
        key: 'dummy-inv-rt04-failed-01',
        tenantId: rt04.id,
        planName: 'Pro',
        amount: 99000,
        status: 'failed' as const,
        paidAt: null,
      },
    ];
    for (const inv of invoices) {
      await prisma.invoice.upsert({
        where: { idempotencyKey: inv.key },
        update: { status: inv.status, amount: inv.amount, paidAt: inv.paidAt },
        create: {
          tenantId: inv.tenantId,
          planName: inv.planName,
          amount: inv.amount,
          billingPeriodStart: startOfThisMonth(),
          billingPeriodEnd: endOfThisMonth(),
          dueDate: daysFromNow(7),
          status: inv.status,
          paidAt: inv.paidAt,
          idempotencyKey: inv.key,
        },
      });
      console.log(`  🧾 Invoice ${inv.key} (${inv.status})`);
    }

    // -----------------------------------------------------------------------
    // 4. Audit log (halaman /admin/audit-log). Tanpa natural unique key →
    //    guard dengan cek resourceId dummy agar idempotent.
    // -----------------------------------------------------------------------
    const auditSeedMarker = 'dummy-admin-seed';
    const existingAudit = await prisma.auditLog.count({
      where: { tenantId: PLATFORM_TENANT_ID, resourceId: auditSeedMarker },
    });
    if (existingAudit === 0) {
      const auditEntries = [
        {
          actionType: 'tenant.suspended',
          resourceType: 'tenant',
          details: { tenant: 'rt04', reason: 'overdue_payment' },
        },
        {
          actionType: 'subscription.plan_changed',
          resourceType: 'subscription',
          details: { tenant: 'rt02', from: 'Pro', to: 'Enterprise' },
        },
        {
          actionType: 'user.role_changed',
          resourceType: 'user',
          details: { tenant: 'rt01', from: 'Warga', to: 'Pengurus' },
        },
        {
          actionType: 'invoice.paid',
          resourceType: 'invoice',
          details: { tenant: 'rt01', amount: 99000 },
        },
        {
          actionType: 'feature_flag.overridden',
          resourceType: 'feature_flag',
          details: { tenant: 'rt03', feature: 'map', enabled: true },
        },
      ];
      for (const [i, entry] of auditEntries.entries()) {
        await prisma.auditLog.create({
          data: {
            tenantId: PLATFORM_TENANT_ID,
            actorUserId,
            actionType: entry.actionType,
            resourceType: entry.resourceType,
            resourceId: auditSeedMarker,
            details: entry.details,
            ipAddress: '203.0.113.10',
            timestamp: daysFromNow(-i),
          },
        });
      }
      console.log(`  📜 ${auditEntries.length} audit log entries`);
    } else {
      console.log('  📜 Audit log dummy sudah ada, dilewati');
    }

    // -----------------------------------------------------------------------
    // 5. Incident keamanan (halaman /admin/security). Guard via title marker.
    // -----------------------------------------------------------------------
    const incidentMarker = '[dummy] ';
    const existingIncident = await prisma.incident.count({
      where: { tenantId: RT01_ID, title: { startsWith: incidentMarker } },
    });
    if (existingIncident === 0) {
      const incidents = [
        {
          title: `${incidentMarker}Percobaan pencurian motor`,
          description: 'Terlihat orang mencurigakan di area parkir blok A.',
          location: 'Parkir Blok A1',
          severity: 'high' as const,
          category: 'theft' as const,
          status: 'open' as const,
        },
        {
          title: `${incidentMarker}Vandalisme pos ronda`,
          description: 'Coretan pada dinding pos ronda RT 01.',
          location: 'Pos Ronda Utama',
          severity: 'medium' as const,
          category: 'vandalism' as const,
          status: 'in_progress' as const,
        },
        {
          title: `${incidentMarker}Aktivitas mencurigakan malam hari`,
          description: 'Laporan warga tentang kendaraan asing berputar-putar.',
          location: 'Jl. Harmoni Raya',
          severity: 'low' as const,
          category: 'suspicious_activity' as const,
          status: 'resolved' as const,
        },
      ];
      for (const inc of incidents) {
        await prisma.incident.create({
          data: {
            tenantId: RT01_ID,
            title: inc.title,
            description: inc.description,
            location: inc.location,
            severity: inc.severity,
            category: inc.category,
            status: inc.status,
            reportedBy: actorUserId,
            evidenceUrls: [],
            resolvedAt: inc.status === 'resolved' ? daysFromNow(-1) : null,
          },
        });
      }
      console.log(`  🛡️ ${incidents.length} incident reports`);
    } else {
      console.log('  🛡️ Incident dummy sudah ada, dilewati');
    }

    // -----------------------------------------------------------------------
    // 6. Feature flag override (halaman /admin/feature-flags).
    //    UNIQUE (tenantId, featureName) → upsert aman.
    // -----------------------------------------------------------------------
    const overrides = [
      { tenantId: rt03.id, featureName: 'map', enabled: true },
      { tenantId: rt03.id, featureName: 'security', enabled: false },
      { tenantId: RT01_ID, featureName: 'billing', enabled: true },
    ];
    for (const ov of overrides) {
      await prisma.featureFlagOverride.upsert({
        where: {
          tenantId_featureName: {
            tenantId: ov.tenantId,
            featureName: ov.featureName,
          },
        },
        update: { enabled: ov.enabled, overriddenBy: actorUserId },
        create: {
          tenantId: ov.tenantId,
          featureName: ov.featureName,
          enabled: ov.enabled,
          overriddenBy: actorUserId,
        },
      });
      console.log(
        `  🚩 FeatureFlagOverride ${ov.featureName}@${ov.tenantId} → ${ov.enabled}`,
      );
    }

    // -----------------------------------------------------------------------
    // 7. OrgUnit + Membership (halaman /admin/org-units & /admin/members)
    //    OrgUnit id di-pin agar idempotent (upsert pada composite id,tenantId).
    // -----------------------------------------------------------------------
    const RT01_RW_ORGUNIT_ID = '00000000-0000-0000-0000-0000000a0001';
    const RT01_RT_ORGUNIT_ID = '00000000-0000-0000-0000-0000000a0002';

    const rwUnit = await prisma.orgUnit.upsert({
      where: { id_tenantId: { id: RT01_RW_ORGUNIT_ID, tenantId: RT01_ID } },
      update: { name: 'RW 05' },
      create: {
        id: RT01_RW_ORGUNIT_ID,
        tenantId: RT01_ID,
        parentId: null,
        type: 'RW',
        name: 'RW 05',
        path: [RT01_RW_ORGUNIT_ID],
        depth: 0,
      },
    });

    await prisma.orgUnit.upsert({
      where: { id_tenantId: { id: RT01_RT_ORGUNIT_ID, tenantId: RT01_ID } },
      update: { name: 'RT 01' },
      create: {
        id: RT01_RT_ORGUNIT_ID,
        tenantId: RT01_ID,
        parentId: rwUnit.id,
        type: 'RT',
        name: 'RT 01',
        path: [RT01_RW_ORGUNIT_ID, RT01_RT_ORGUNIT_ID],
        depth: 1,
      },
    });
    console.log('  🏛️ OrgUnit RW 05 → RT 01');

    // Membership: tautkan ketua RT 01 ke OrgUnit RT sebagai RT_ADMIN.
    const ketuaRt01 = await prisma.user.findUnique({
      where: {
        tenantId_email: {
          tenantId: RT01_ID,
          email: 'ketua@rt01.societ.app',
        },
      },
    });
    if (ketuaRt01) {
      const existingMembership = await prisma.membership.findFirst({
        where: {
          userId: ketuaRt01.id,
          tenantId: RT01_ID,
          orgUnitId: RT01_RT_ORGUNIT_ID,
        },
      });
      if (!existingMembership) {
        await prisma.membership.create({
          data: {
            userId: ketuaRt01.id,
            tenantId: RT01_ID,
            orgUnitId: RT01_RT_ORGUNIT_ID,
            role: 'RT_ADMIN',
            status: 'ACTIVE',
          },
        });
        console.log('  👥 Membership RT_ADMIN untuk ketua@rt01.societ.app');
      } else {
        console.log('  👥 Membership ketua RT 01 sudah ada, dilewati');
      }
    }

    console.log('\n✅ Seed admin dummy selesai.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(err => {
  console.error('❌ Seed admin dummy gagal:', err);
  process.exit(1);
});
