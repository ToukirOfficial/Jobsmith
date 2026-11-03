import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../config.js';
import { QUEUES } from '../jobs/queue.service.js';

/**
 * Manual sponsor register import: `pnpm --filter @jobsmith/api sponsors:import` (or, on a server,
 * `node --env-file=.env dist/sponsors/import-cli.js` in the API folder). It queues the import for the
 * running worker rather than doing it here, so it still runs one at a time and never alongside a PDF.
 * The worker downloads only when GOV.UK has published a new file.
 */
const cfg = config();
const connection = new Redis(cfg.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue(QUEUES.register, { connection, prefix: `${cfg.REDIS_PREFIX}:bull` });
// A fixed id per minute: running the command twice by mistake queues one import.
const job = await queue.add('import', {}, { jobId: `sponsor-register-manual-${Math.floor(Date.now() / 60_000)}`, removeOnComplete: 100, removeOnFail: 100 });
console.log(`Sponsor register import queued (${job.id}). The worker runs it next; watch its log for "Sponsor register".`);
await queue.close();
connection.disconnect();
