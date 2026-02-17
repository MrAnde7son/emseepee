# ==============================================================================
# EmSeePee Dashboard - Dockerfile
# ==============================================================================
# Multi-stage build for the Next.js frontend dashboard
# ==============================================================================

# ---- Stage 1: Install dependencies ----
FROM node:20-slim AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY dashboard/package.json ./dashboard/

RUN pnpm install --frozen-lockfile --filter dashboard

# ---- Stage 2: Build Next.js ----
FROM node:20-slim AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/dashboard/node_modules ./dashboard/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY dashboard ./dashboard

# Build-time env vars for Next.js (baked into the client bundle)
ARG NEXT_PUBLIC_GATEWAY_URL=http://localhost:8000
ENV NEXT_PUBLIC_GATEWAY_URL=$NEXT_PUBLIC_GATEWAY_URL

WORKDIR /app/dashboard

RUN pnpm run build

# ---- Stage 3: Production image ----
FROM node:20-slim AS runner

WORKDIR /app/dashboard

ENV NODE_ENV=production

# Next.js standalone output or standard output
COPY --from=builder /app/dashboard/.next ./.next
COPY --from=builder /app/dashboard/public ./public
COPY --from=builder /app/dashboard/package.json ./package.json
COPY --from=builder /app/dashboard/node_modules ./node_modules

# Root workspace files needed by pnpm
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=builder /app/node_modules /app/node_modules

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node_modules/.bin/next", "start", "-p", "3000"]
