// Jobsmith API entry point: the HTTP server (the worker is worker.ts).
import { config } from './config.js';
import { createApp } from './app.js';

const cfg = config();
const app = await createApp();
await app.listen(cfg.API_PORT, cfg.API_HOST);
console.log(`Jobsmith API listening on http://${cfg.API_HOST}:${cfg.API_PORT}/api/v1`);
