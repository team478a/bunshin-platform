FROM node:24-bookworm-slim AS node
FROM mcr.microsoft.com/playwright:v1.65.1-noble

COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /workspace
RUN npm install --global pnpm@10.10.0
COPY . .
RUN pnpm install --frozen-lockfile --filter @bunshin/browser-worker... \
    && pnpm --filter @bunshin/database db:generate \
    && mkdir -m 0700 /evidence \
    && chown pwuser:pwuser /evidence

USER pwuser
ENV BROWSER_WORKER_OUTPUT=/evidence
WORKDIR /workspace/apps/browser-worker
ENTRYPOINT ["./node_modules/.bin/tsx", "src/cli.ts"]
CMD ["smoke"]
