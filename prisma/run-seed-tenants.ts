/**
 * Script untuk menjalankan seed tenant dummy
 * Usage: npx tsx prisma/run-seed-tenants.ts
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashSync } from 'bcryptjs';

type Gender = 'male' | 'female';
type ResidencyStatus = 'tetap' | 'kontrak' | 'kos' | 'pindah';

interface SeedResident {
  name: string;
  nik: string;
  dateOfBirth: string;
  gender: Gender;
  phone: string | null;
  status: ResidencyStatus;
  categories: string[];
}

interface SeedHousehold {
  householdNumber: string;
  address: string;
  block: string;
  residents: SeedResident[];
}

/**
 * Seed households beserta residents (warga) untuk satu tenant.
 * Idempotent: aman dijalankan berulang kali karena menggunakan upsert.
 */
async function seedHouseholdsAndResidents(
  prisma: PrismaClient,
  tenantId: string,
  households: SeedHousehold[],
): Promise<void> {
  for (const household of households) {
    const upsertedHousehold = await prisma.household.upsert({
      where: {
        tenantId_householdNumber: {
          tenantId,
          householdNumber: household.householdNumber,
        },
      },
      update: {
        address: household.address,
        block: household.block,
      },
      create: {
        tenantId,
        householdNumber: household.householdNumber,
        address: household.address,
        block: household.block,
      },
    });
    console.log(`  🏠 Household ${household.householdNumber} (${household.block})`);

    for (const resident of household.residents) {
      await prisma.resident.upsert({
        where: { tenantId_nik: { tenantId, nik: resident.nik } },
        update: {
          name: resident.name,
          phone: resident.phone,
          status: resident.status,
          categories: resident.categories,
        },
        create: {
          tenantId,
          householdId: upsertedHousehold.id,
          name: resident.name,
          nik: resident.nik,
          dateOfBirth: new Date(resident.dateOfBirth),
          gender: resident.gender,
          phone: resident.phone,
          status: resident.status,
          categories: resident.categories,
        },
      });
      console.log(`    👤 Warga: ${resident.name} (${resident.status})`);
    }
  }
}

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const passwordHash = hashSync('Admin@123456', 12);

  const PRO_PLAN_ID = '00000000-0000-0000-0000-000000000002';
  const ENTERPRISE_PLAN_ID = '00000000-0000-0000-0000-000000000003';

  try {
    // -------------------------------------------------------------------------
    // 0. Prasyarat: pastikan subscription plan & tenant platform tersedia
    //    (idempotent — biasanya sudah dibuat oleh prisma/seed.ts)
    // -------------------------------------------------------------------------
    await prisma.subscriptionPlan.upsert({
      where: { id: PRO_PLAN_ID },
      update: {},
      create: {
        id: PRO_PLAN_ID,
        name: 'Pro',
        maxUsers: 500,
        features: [
          'announcements',
          'residents',
          'households',
          'finance',
          'voting',
          'events',
          'security',
          'packages',
          'visitors',
        ],
        price: 99000,
      },
    });

    await prisma.subscriptionPlan.upsert({
      where: { id: ENTERPRISE_PLAN_ID },
      update: {},
      create: {
        id: ENTERPRISE_PLAN_ID,
        name: 'Enterprise',
        maxUsers: null,
        features: [
          'announcements',
          'residents',
          'households',
          'finance',
          'voting',
          'events',
          'security',
          'packages',
          'visitors',
          'emergency',
          'letters',
          'map',
          'audit',
          'billing',
        ],
        price: 299000,
      },
    });

    const platformTenant = await prisma.tenant.upsert({
      where: { subdomain: 'platform' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000010',
        name: 'Platform Admin',
        subdomain: 'platform',
        rtRwNumber: '000/000',
        region: 'System',
        address: 'System',
        contactPerson: 'Admin',
        status: 'active',
        subscriptionPlanId: ENTERPRISE_PLAN_ID,
      },
    });

    // Platform-level admins (Super_Admin)
    const platformUsers = [
      {
        name: 'Super Admin',
        email: 'admin@societ-rt.com',
        role: 'Super_Admin' as const,
      },
      {
        name: 'Super Admin RT',
        email: 'superadmin@societ.app',
        role: 'Super_Admin' as const,
      },
      {
        name: 'Platform Operator',
        email: 'operator@societ.app',
        role: 'Super_Admin' as const,
      },
    ];

    for (const user of platformUsers) {
      await prisma.user.upsert({
        where: {
          tenantId_email: { tenantId: platformTenant.id, email: user.email },
        },
        update: { name: user.name },
        create: {
          tenantId: platformTenant.id,
          name: user.name,
          email: user.email,
          passwordHash,
          role: user.role,
          status: 'active',
        },
      });
      console.log(`✅ Platform user ${user.role}: ${user.email}`);
    }

    // -------------------------------------------------------------------------
    // 1. Tenant RT 01 - Perumahan Harmoni Indah
    // -------------------------------------------------------------------------
    const rt01 = await prisma.tenant.upsert({
      where: { subdomain: 'rt01' },
      update: {
        name: 'RT 01 Perumahan Harmoni Indah',
        rtRwNumber: '001/005',
        region: 'Kelurahan Sukamaju, Kecamatan Cilodong, Kota Depok',
        address: 'Jl. Harmoni Raya No. 1, Perumahan Harmoni Indah, Depok 16415',
        contactPerson: 'Budi Santoso',
        primaryColor: '#2563eb',
        secondaryColor: '#1e40af',
      },
      create: {
        id: '00000000-0000-0000-0000-000000000011',
        name: 'RT 01 Perumahan Harmoni Indah',
        subdomain: 'rt01',
        rtRwNumber: '001/005',
        region: 'Kelurahan Sukamaju, Kecamatan Cilodong, Kota Depok',
        address: 'Jl. Harmoni Raya No. 1, Perumahan Harmoni Indah, Depok 16415',
        contactPerson: 'Budi Santoso',
        primaryColor: '#2563eb',
        secondaryColor: '#1e40af',
        status: 'active',
        subscriptionPlanId: '00000000-0000-0000-0000-000000000002', // Pro Plan
      },
    });
    console.log('✅ Tenant RT 01 created:', rt01.subdomain);

    // Users untuk RT 01
    const rt01Users = [
      {
        name: 'Budi Santoso',
        email: 'ketua@rt01.societ.app',
        role: 'Ketua_RT' as const,
      },
      {
        name: 'Siti Rahayu',
        email: 'sekretaris@rt01.societ.app',
        role: 'Pengurus' as const,
      },
      {
        name: 'Eko Prasetyo',
        email: 'bendahara@rt01.societ.app',
        role: 'Pengurus' as const,
      },
      {
        name: 'Ahmad Wijaya',
        email: 'ahmad@rt01.societ.app',
        role: 'Warga' as const,
      },
      {
        name: 'Sri Wahyuni',
        email: 'warga2@rt01.societ.app',
        role: 'Warga' as const,
      },
      {
        name: 'Joko Susilo',
        email: 'satpam@rt01.societ.app',
        role: 'Security_Guard' as const,
      },
      {
        name: 'Bambang Sutrisno',
        email: 'satpam2@rt01.societ.app',
        role: 'Security_Guard' as const,
      },
    ];

    for (const user of rt01Users) {
      await prisma.user.upsert({
        where: { tenantId_email: { tenantId: rt01.id, email: user.email } },
        update: { name: user.name },
        create: {
          tenantId: rt01.id,
          name: user.name,
          email: user.email,
          passwordHash,
          role: user.role,
          status: 'active',
        },
      });
      console.log(`  ✅ User ${user.role}: ${user.email}`);
    }

    // Households & Residents (warga) untuk RT 01
    await seedHouseholdsAndResidents(prisma, rt01.id, [
      {
        householdNumber: '3276010001010001',
        address: 'Jl. Harmoni Raya No. 1, Blok A1',
        block: 'A1',
        residents: [
          {
            name: 'Budi Santoso',
            nik: '3276010001010001',
            dateOfBirth: '1980-05-15',
            gender: 'male',
            phone: '081234500101',
            status: 'tetap',
            categories: ['kepala_keluarga'],
          },
          {
            name: 'Rina Santoso',
            nik: '3276010001010002',
            dateOfBirth: '1983-09-21',
            gender: 'female',
            phone: '081234500102',
            status: 'tetap',
            categories: ['istri'],
          },
          {
            name: 'Andi Santoso',
            nik: '3276010001010003',
            dateOfBirth: '2010-03-11',
            gender: 'male',
            phone: null,
            status: 'tetap',
            categories: ['anak'],
          },
        ],
      },
      {
        householdNumber: '3276010001010004',
        address: 'Jl. Harmoni Raya No. 5, Blok A2',
        block: 'A2',
        residents: [
          {
            name: 'Ahmad Wijaya',
            nik: '3276010001010004',
            dateOfBirth: '1988-11-02',
            gender: 'male',
            phone: '081234500104',
            status: 'tetap',
            categories: ['kepala_keluarga'],
          },
          {
            name: 'Sri Wahyuni',
            nik: '3276010001010005',
            dateOfBirth: '1990-06-30',
            gender: 'female',
            phone: '081234500105',
            status: 'tetap',
            categories: ['istri', 'ibu_hamil'],
          },
        ],
      },
      {
        householdNumber: '3276010001010006',
        address: 'Jl. Harmoni Raya No. 9, Blok A3',
        block: 'A3',
        residents: [
          {
            name: 'Slamet Riyadi',
            nik: '3276010001010006',
            dateOfBirth: '1955-01-17',
            gender: 'male',
            phone: '081234500106',
            status: 'tetap',
            categories: ['kepala_keluarga', 'lansia'],
          },
          {
            name: 'Sumarni',
            nik: '3276010001010007',
            dateOfBirth: '1958-04-25',
            gender: 'female',
            phone: null,
            status: 'tetap',
            categories: ['istri', 'lansia'],
          },
        ],
      },
    ]);

    // -------------------------------------------------------------------------
    // 2. Tenant RT 02 - Cluster Bunga Melati
    // -------------------------------------------------------------------------
    const rt02 = await prisma.tenant.upsert({
      where: { subdomain: 'rt02' },
      update: {
        name: 'RT 02 Cluster Bunga Melati',
        rtRwNumber: '002/005',
        region: 'Kelurahan Sukamaju, Kecamatan Cilodong, Kota Depok',
        address: 'Jl. Melati Raya Blok A, Cluster Bunga Melati, Depok 16415',
        contactPerson: 'Hendra Kusuma',
        primaryColor: '#059669',
        secondaryColor: '#047857',
      },
      create: {
        id: '00000000-0000-0000-0000-000000000012',
        name: 'RT 02 Cluster Bunga Melati',
        subdomain: 'rt02',
        rtRwNumber: '002/005',
        region: 'Kelurahan Sukamaju, Kecamatan Cilodong, Kota Depok',
        address: 'Jl. Melati Raya Blok A, Cluster Bunga Melati, Depok 16415',
        contactPerson: 'Hendra Kusuma',
        primaryColor: '#059669',
        secondaryColor: '#047857',
        status: 'active',
        subscriptionPlanId: '00000000-0000-0000-0000-000000000003', // Enterprise Plan
      },
    });
    console.log('✅ Tenant RT 02 created:', rt02.subdomain);

    // Users untuk RT 02
    const rt02Users = [
      {
        name: 'Hendra Kusuma',
        email: 'ketua@rt02.societ.app',
        role: 'Ketua_RT' as const,
      },
      {
        name: 'Dewi Lestari',
        email: 'bendahara@rt02.societ.app',
        role: 'Pengurus' as const,
      },
      {
        name: 'Fitri Handayani',
        email: 'sekretaris@rt02.societ.app',
        role: 'Pengurus' as const,
      },
      {
        name: 'Rizki Pratama',
        email: 'rizki@rt02.societ.app',
        role: 'Warga' as const,
      },
      {
        name: 'Nadia Pratama',
        email: 'warga2@rt02.societ.app',
        role: 'Warga' as const,
      },
      {
        name: 'Agus Setiawan',
        email: 'satpam@rt02.societ.app',
        role: 'Security_Guard' as const,
      },
    ];

    for (const user of rt02Users) {
      await prisma.user.upsert({
        where: { tenantId_email: { tenantId: rt02.id, email: user.email } },
        update: { name: user.name },
        create: {
          tenantId: rt02.id,
          name: user.name,
          email: user.email,
          passwordHash,
          role: user.role,
          status: 'active',
        },
      });
      console.log(`  ✅ User ${user.role}: ${user.email}`);
    }

    // Households & Residents (warga) untuk RT 02
    await seedHouseholdsAndResidents(prisma, rt02.id, [
      {
        householdNumber: '3276010002010001',
        address: 'Jl. Melati Raya Blok A No. 1',
        block: 'A',
        residents: [
          {
            name: 'Hendra Kusuma',
            nik: '3276010002010001',
            dateOfBirth: '1979-07-08',
            gender: 'male',
            phone: '081234500201',
            status: 'tetap',
            categories: ['kepala_keluarga'],
          },
          {
            name: 'Dewi Lestari',
            nik: '3276010002010002',
            dateOfBirth: '1982-12-19',
            gender: 'female',
            phone: '081234500202',
            status: 'tetap',
            categories: ['istri'],
          },
          {
            name: 'Bagas Kusuma',
            nik: '3276010002010003',
            dateOfBirth: '2012-08-14',
            gender: 'male',
            phone: null,
            status: 'tetap',
            categories: ['anak'],
          },
        ],
      },
      {
        householdNumber: '3276010002010004',
        address: 'Jl. Melati Raya Blok B No. 3',
        block: 'B',
        residents: [
          {
            name: 'Rizki Pratama',
            nik: '3276010002010004',
            dateOfBirth: '1991-02-27',
            gender: 'male',
            phone: '081234500204',
            status: 'kontrak',
            categories: ['kepala_keluarga'],
          },
          {
            name: 'Nadia Pratama',
            nik: '3276010002010005',
            dateOfBirth: '1993-05-16',
            gender: 'female',
            phone: '081234500205',
            status: 'kontrak',
            categories: ['istri'],
          },
        ],
      },
      {
        householdNumber: '3276010002010006',
        address: 'Jl. Melati Raya Blok C No. 7',
        block: 'C',
        residents: [
          {
            name: 'Agus Setiawan',
            nik: '3276010002010006',
            dateOfBirth: '1986-10-03',
            gender: 'male',
            phone: '081234500206',
            status: 'kos',
            categories: ['kepala_keluarga'],
          },
        ],
      },
    ]);

    // -------------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------------
    console.log('\n========================================');
    console.log('SEED COMPLETED SUCCESSFULLY!');
    console.log('========================================');
    console.log('\nLogin credentials (password: Admin@123456):');
    console.log('\nPlatform (Super Admin):');
    console.log('  - Super Admin: admin@societ-rt.com');
    console.log('  - Super Admin: superadmin@societ.app');
    console.log('  - Operator: operator@societ.app');
    console.log('\nRT 01 (rt01.societ.app):');
    console.log('  - Ketua RT: ketua@rt01.societ.app');
    console.log('  - Sekretaris (Pengurus): sekretaris@rt01.societ.app');
    console.log('  - Bendahara (Pengurus): bendahara@rt01.societ.app');
    console.log('  - Warga: ahmad@rt01.societ.app');
    console.log('  - Warga: warga2@rt01.societ.app');
    console.log('  - Satpam: satpam@rt01.societ.app');
    console.log('  - Satpam: satpam2@rt01.societ.app');
    console.log('\nRT 02 (rt02.societ.app):');
    console.log('  - Ketua RT: ketua@rt02.societ.app');
    console.log('  - Bendahara (Pengurus): bendahara@rt02.societ.app');
    console.log('  - Sekretaris (Pengurus): sekretaris@rt02.societ.app');
    console.log('  - Warga: rizki@rt02.societ.app');
    console.log('  - Warga: warga2@rt02.societ.app');
    console.log('  - Satpam: satpam@rt02.societ.app');

    // Verifikasi jumlah data warga per tenant
    const [rt01Households, rt01Residents, rt02Households, rt02Residents] =
      await Promise.all([
        prisma.household.count({ where: { tenantId: rt01.id } }),
        prisma.resident.count({ where: { tenantId: rt01.id } }),
        prisma.household.count({ where: { tenantId: rt02.id } }),
        prisma.resident.count({ where: { tenantId: rt02.id } }),
      ]);

    console.log('\n--- Data Warga ---');
    console.log(`RT 01: ${rt01Households} KK, ${rt01Residents} warga`);
    console.log(`RT 02: ${rt02Households} KK, ${rt02Residents} warga`);

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});
