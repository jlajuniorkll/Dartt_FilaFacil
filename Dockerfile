# FilaFácil — imagem de produção (Next.js standalone + SQLite em volume)
# Não contém segredos. SQLITE_PATH aponta para /data (volume externo).

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Toolchain para better-sqlite3 (node-gyp dispara via binding.gyp; prebuild nem sempre é usado)
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=America/Sao_Paulo \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    SQLITE_PATH=/data/filafacil.db

RUN mkdir -p /data && chown node:node /data

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# CLIs manuais para o operador (criar primeiro admin / resetar senha):
COPY --from=builder --chown=node:node /app/scripts/create-admin.mjs ./scripts/create-admin.mjs
COPY --from=builder --chown=node:node /app/scripts/reset-password.mjs ./scripts/reset-password.mjs
# Healthcheck compatível com Coolify: executado como `node /app/scripts/healthcheck.mjs`
COPY --from=builder --chown=node:node /app/scripts/healthcheck.mjs ./scripts/healthcheck.mjs

USER node
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/queue/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
