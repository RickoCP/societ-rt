// test-login.mjs
import { PrismaClient } from './src/generated/prisma/client/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  try {
    console.log('Testing database connection...');
    const user = await prisma.user.findFirst({
      where: { 
        email: 'ahmad@menteng.societ-rt.id',
        tenantId: 'tenant_menteng'
      }
    });
    
    if (user) {
      console.log('User found:', user.email, user.name);
      console.log('Password hash:', user.passwordHash);
      
      // Test password
      const match = await bcrypt.compare('Admin@123456', user.passwordHash);
      console.log('Password match:', match);
    } else {
      console.log('User not found');
    }
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await prisma.\();
    await pool.end();
  }
}

main();
