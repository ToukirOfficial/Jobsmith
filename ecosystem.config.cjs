/**
 * PM2 processes on the server, started by deploy.sh from a release folder. Nothing about the server is
 * written here: names and ports come from the environment deploy.sh passes (from the gitignored
 * deploy.env), and secrets come from api/.env and web/.env, which link to the release's shared folder.
 */
const path = require('node:path');

const need = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set (deploy.sh passes it from deploy.env)`);
  return v;
};
const prefix = need('PM2_PREFIX');
// Memory caps: small on purpose, so a demo server can run several apps side by side.
const apiEnv = path.join(__dirname, 'apps/api/.env');
const webEnv = path.join(__dirname, 'web/.env');

module.exports = {
  apps: [
    {
      name: `${prefix}-api`,
      cwd: path.join(__dirname, 'apps/api'),
      script: 'dist/main.js',
      // Absolute path: PM2 doesn't start node inside cwd, so a relative --env-file isn't found.
      node_args: `--env-file=${apiEnv}`,
      max_memory_restart: '300M',
      env: { NODE_ENV: 'production', API_PORT: need('API_PORT'), API_HOST: '127.0.0.1' },
    },
    {
      name: `${prefix}-worker`,
      cwd: path.join(__dirname, 'apps/api'),
      script: 'dist/worker.js',
      // A heap limit well under the memory cap, so V8 collects garbage before PM2 would restart the worker.
      node_args: `--env-file=${apiEnv} --max-old-space-size=160`,
      max_memory_restart: '350M',
      env: { NODE_ENV: 'production' },
    },
    {
      name: `${prefix}-web`,
      cwd: path.join(__dirname, 'web'),
      script: 'apps/web/server.js',
      node_args: `--env-file=${webEnv}`,
      max_memory_restart: '300M',
      env: { NODE_ENV: 'production', PORT: need('WEB_PORT'), HOSTNAME: '127.0.0.1' },
    },
  ],
};
