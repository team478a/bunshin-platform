# syntax=docker/dockerfile:1.6
FROM node:24-bookworm-slim AS node
FROM mcr.microsoft.com/playwright:v1.65.1-noble

COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /workspace
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg open-jtalk=1.11-5 \
       open-jtalk-mecab-naist-jdic=1.11-5 hts-voice-nitech-jp-atr503-m001=1.05-8 \
    && rm -rf /var/lib/apt/lists/*
ADD --checksum=sha256:f3be49a6838904a6c218790b64e07c3e83c1886e995dca284b413caab19184de https://raw.githubusercontent.com/r9y9/pyopenjtalk/v0.4.1/pyopenjtalk/htsvoice/mei_normal.htsvoice /usr/share/hts-voice/mei/mei_normal.htsvoice
ADD --checksum=sha256:af8a05b6ce28e513658fdf0480f36dbf49cbe878d2571d97dd017e8052c71391 https://raw.githubusercontent.com/r9y9/pyopenjtalk/v0.4.1/pyopenjtalk/htsvoice/LICENSE_mei_normal.htsvoice /usr/share/hts-voice/mei/LICENSE
RUN chmod 0644 /usr/share/hts-voice/mei/mei_normal.htsvoice /usr/share/hts-voice/mei/LICENSE
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
