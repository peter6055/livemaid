# Install dependencies only when needed
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install

# Rebuild the source code only when needed
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache git
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public

# Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED=1

ARG VERSION
ARG APP_VERSION
# Public URL including reverse-proxy prefix. Path is baked into Next basePath
# at build time so /_next and routes work when the proxy does not strip.
ARG BASE_URL
ENV BASE_URL=$BASE_URL

RUN VERSION="${VERSION:-$APP_VERSION}" npm run build

# Never carry local secrets or developer data into the runtime image if a build
# context accidentally includes them.
RUN rm -f .next/standalone/.env .next/standalone/.env.* \
  && rm -rf .next/standalone/data

# Production image, copy all the files and run next
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Ensure data directories exist and are writable
RUN mkdir -p /app/data /app/demo
RUN chown -R nextjs:nodejs /app/data /app/demo

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
# Bind address for the standalone server. This is NOT the public URL — set
# BASE_URL for the public site URL (including any reverse-proxy prefix).
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
