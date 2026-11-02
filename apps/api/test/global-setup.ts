import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { Redis } from 'ioredis';
import pg from 'pg';

/**
 * A fresh test database for every run. Only touches a database whose name ends in `_test`. Redis is shared,
 * so only keys with the test prefix are removed; no database is ever flushed.
 */
export default async function setup() {
  try {
    process.loadEnvFile('../../.env');
  } catch {
    // CI provides the variables directly.
  }
  const url = process.env['TEST_DATABASE_URL'] ?? 'postgresql://jobsmith:jobsmith@127.0.0.1:5432/jobsmith_test';
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith('_test')) throw new Error(`Refusing to wipe "${dbName}": test database names must end in _test`);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await client.end();
  execSync('npx prisma migrate deploy', { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url } });

  const redis = new Redis(process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379/5');
  const keys = await redis.keys('jobsmith-test:*');
  if (keys.length) await redis.del(...keys);
  redis.disconnect();
  rmSync('./storage-test', { recursive: true, force: true });
}
