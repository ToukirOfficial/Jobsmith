import 'reflect-metadata';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from './config.js';
import { PrismaClient } from './generated/prisma/client.js';
import { hashPassword } from './auth/passwords.js';
import { createUserWithDefaults } from './users/create-user.js';
import { seedJobSearch } from './seed/job-search.js';
import { seedSnapshots } from './seed/profile.js';
import { seedAllowed } from './seed/guard.js';
import { ProfileService } from './cv/profile.service.js';
import type { PrismaService } from './prisma.service.js';

/**
 * Seed: one demo account with a fictional job search (ASSUMPTIONS.md has the login). It only runs with
 * DEMO_MODE=true or --dev (seed/guard.ts), and the account only works when DEMO_MODE=true. Running it again
 * replaces only that account; nothing else in the database is touched.
 */
export const SEED_EMAIL = 'demo@jobsmith.example';
export const SEED_PASSWORD = 'jobsmith-demo-2026';

const allowed = seedAllowed(process.env, process.argv.slice(2));
if (!allowed.ok) {
  console.error(allowed.reason);
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: config().DATABASE_URL }) });
const passwordHash = await hashPassword(SEED_PASSWORD);
await prisma.user.deleteMany({ where: { email: SEED_EMAIL } });
const userId = await prisma.$transaction(
  async (tx) => {
    await tx.installState.upsert({ where: { id: 1 }, create: { id: 1, completedAt: new Date() }, update: {} });
    // A demo account: it can only log in when DEMO_MODE=true.
    const user = await createUserWithDefaults(tx, { email: SEED_EMAIL, name: 'Alex Morgan', passwordHash, isDemo: true });
    await seedJobSearch(tx, user.id);
    return user.id;
  },
  { timeout: 60_000 },
);
const db = prisma as unknown as PrismaService;
await seedSnapshots(db, userId, await new ProfileService(db).get(userId));
console.log(`Seeded ${SEED_EMAIL}`);
await prisma.$disconnect();
