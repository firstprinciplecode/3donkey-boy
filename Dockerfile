FROM node:20-alpine AS base

# Dependencies stage
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
ENV npm_config_optional=true
RUN npm ci --include=optional

# Build stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production stage
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN npm install -g serve
COPY --from=builder /app/dist ./public

EXPOSE 3000
CMD ["sh", "-c", "serve -s public -l ${PORT}"]
