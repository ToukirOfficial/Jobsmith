# Jobsmith API and worker (one image, two commands). Build from the repository root:
#   docker build -f apps/api/Dockerfile -t jobsmith-api .
FROM node:24-bookworm-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @jobsmith/api... build
# Keep only production dependencies for the runtime image.
RUN pnpm install --frozen-lockfile --prod --config.confirmModulesPurge=false

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data/storage && chown -R node:node /data
COPY --from=build --chown=node:node /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/apps/api ./apps/api
COPY --from=build --chown=node:node /app/data ./data
COPY --from=build --chown=node:node /app/prompts ./prompts
USER node
WORKDIR /app/apps/api
EXPOSE 8135
# The API applies database migrations before it starts; the worker is started with: node dist/worker.js
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node dist/main.js"]
