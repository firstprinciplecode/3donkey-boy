FROM node:20-alpine AS base

# Dependencies stage
FROM base AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* ./
ENV npm_config_optional=true
RUN npm ci --include=optional

# Build stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production stage. The host publishes the port named in uplink.host.json.
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/data/scores.db

COPY --from=deps /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=deps /app/node_modules/bindings ./node_modules/bindings
COPY --from=deps /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path
COPY server ./server
COPY --from=builder /app/dist ./public
RUN mkdir -p /data

EXPOSE 3000
CMD ["node", "server/index.mjs"]
