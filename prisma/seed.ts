/**
 * Database Seed Script
 *
 * Seeds the database with initial data required for the application to function:
 * - SubscriptionPlans: Free, Pro, Enterprise
 * - Default Super_Admin user
 * - Default feature flags for each plan
 *
 * Usage: npx tsx prisma/seed.ts
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashSync } from 'bcryptjs';

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // -----------------------------------------------------------------------
    // 1. Subscription Plans
    // -----------------------------------------------------------------------
    const freePlan = await prisma.subscriptionPlan.upsert({
      where: { id: '00000000-0000-0000-0000-000000000001' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Free',
        maxUsers: 50,
        features: ['announcements', 'residents', 'households'],
        price: 0,
      },
    });

    const proPlan = await prisma.subscriptionPlan.upsert({
      where: { id: '00000000-0000-0000-0000-000000000002' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000002',
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

    const enterprisePlan = await prisma.subscriptionPlan.upsert({
      where: { id: '00000000-0000-0000-0000-000000000003' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000003',
        name: 'Enterprise',
        maxUsers: null, // unlimited
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

    console.log('✅ Subscription plans seeded:', {
      free: freePlan.id,
      pro: proPlan.id,
      enterprise: enterprisePlan.id,
    });

    // -----------------------------------------------------------------------
    // 2. Default Super_Admin User
    // -----------------------------------------------------------------------
    const defaultTenant = await prisma.tenant.upsert({
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
        subscriptionPlanId: enterprisePlan.id,
      },
    });

    const passwordHash = hashSync('Admin@123456', 12);

    await prisma.user.upsert({
      where: {
        tenantId_email: {
          tenantId: defaultTenant.id,
          email: 'admin@societ-rt.com',
        },
      },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000020',
        tenantId: defaultTenant.id,
        name: 'Super Admin',
        email: 'admin@societ-rt.com',
        passwordHash,
        role: 'Super_Admin',
        status: 'active',
      },
    });

    console.log('✅ Default Super_Admin user seeded');

    // -----------------------------------------------------------------------
    // 3. Feature Flags per Plan
    // -----------------------------------------------------------------------
    const allFeatures = [
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
    ];

    const planFeatureMap: Record<string, string[]> = {
      [freePlan.id]: freePlan.features,
      [proPlan.id]: proPlan.features,
      [enterprisePlan.id]: enterprisePlan.features,
    };

    for (const [planId, enabledFeatures] of Object.entries(planFeatureMap)) {
      for (const feature of allFeatures) {
        const enabled = enabledFeatures.includes(feature);
        await prisma.featureFlag.upsert({
          where: {
            id: `ff-${planId.slice(-4)}-${feature}`,
          },
          update: { enabled },
          create: {
            id: `ff-${planId.slice(-4)}-${feature}`,
            featureName: feature,
            planId,
            enabled,
          },
        });
      }
    }

    console.log('✅ Feature flags seeded for all plans');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});
