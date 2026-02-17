# ==============================================================================
# EmSeePee Backend - Dockerfile
# ==============================================================================
# Multi-stage build for the Node.js/TypeScript backend gateway server
# ==============================================================================

# ---- Stage 1: Install dependencies ----
FROM node:20-slim AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy only files needed for dependency resolution
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Dashboard package.json is needed for pnpm workspace resolution
COPY dashboard/package.json ./dashboard/

RUN pnpm install --frozen-lockfile --filter emseepee

# ---- Stage 2: Build TypeScript ----
FROM node:20-slim AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY src ./src
COPY bin ./bin

RUN pnpm run build

# ---- Stage 3: Production image ----
FROM node:20-slim AS runner

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

ENV NODE_ENV=production

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY bin ./bin
COPY config.json ./

# Create data directory for SQLite fallback
RUN mkdir -p /app/data

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:8000/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
