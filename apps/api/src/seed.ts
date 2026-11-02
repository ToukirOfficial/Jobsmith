import 'reflect-metadata';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from './config.js';
import { PrismaClient } from './generated/prisma/client.js';
import { hashPassword } from './auth/passwords.js';
import { createUserWithDefaults } from './users/create-user.js';
import { seedJobSearch } from './seed/job-search.js';
import { seedSnapshots } from './seed/profile.js';
import { ProfileService } from './cv/profile.service.js';
import type { PrismaService } from './prisma.service.js';

/**
 * Local seed: one demo login with a fictional job search (ASSUMPTIONS.md has the login). Running it again
 * replaces only that demo account; nothing else in the database is touched.
 */
export const SEED_EMAIL = 'demo@jobsmith.example';
export const SEED_PASSWORD = 'jobsmith-demo-2026';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: config().DATABASE_URL }) });
const passwordHash = await hashPassword(SEED_PASSWORD);
await prisma.user.deleteMany({ where: { email: SEED_EMAIL } });
const userId = await prisma.$transaction(
  async (tx) => {
    await tx.installState.upsert({ where: { id: 1 }, create: { id: 1, completedAt: new Date() }, update: {} });
    const user = await createUserWithDefaults(tx, { email: SEED_EMAIL, name: 'Alex Morgan', passwordHash });
    await seedJobSearch(tx, user.id);
    return user.id;
  },
  { timeout: 60_000 },
);
const db = prisma as unknown as PrismaService;
await seedSnapshots(db, userId, await new ProfileService(db).get(userId));
console.log(`Seeded ${SEED_EMAIL}`);
await prisma.$disconnect();
