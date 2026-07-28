# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /source
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY apps ./apps
COPY packages ./packages
COPY evals ./evals
RUN pnpm install --frozen-lockfile
RUN pnpm build
RUN pnpm deploy --filter @atlas-mcp/cli --prod /release

FROM node:22-bookworm-slim AS runtime

LABEL org.opencontainers.image.source="https://github.com/XAGI-Lab/atlas-mcp"
LABEL org.opencontainers.image.licenses="Apache-2.0"
LABEL org.opencontainers.image.title="ATLAS MCP"
LABEL org.opencontainers.image.description="Safe, reliable, and verifiable MCP execution runtime"

RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV ATLAS_MCP_BROWSER=/usr/bin/chromium
ENV ATLAS_MCP_WORKSPACE=/workspace
ENV ATLAS_MCP_HOME=/data

WORKDIR /opt/atlas-mcp
COPY --from=build --chown=node:node /release ./

RUN mkdir -p /workspace /data \
    && chown -R node:node /workspace /data

USER node
VOLUME ["/workspace", "/data"]
ENTRYPOINT ["node", "/opt/atlas-mcp/dist/index.js"]
CMD ["serve"]
