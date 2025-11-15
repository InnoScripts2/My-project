# Kiosk Agent Production Dockerfile
# Multistage build: builder + runtime

# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /build

# Copy root package files
COPY package*.json ./

# Copy kiosk-agent package files
COPY apps/kiosk-agent/package*.json apps/kiosk-agent/package-lock.json* ./apps/kiosk-agent/

# Install all dependencies (including devDependencies for build)
# Note: Some packages might be missing, install what we can
RUN cd apps/kiosk-agent && npm ci || npm install

# Copy source code
COPY apps/kiosk-agent ./apps/kiosk-agent

# Build TypeScript to JavaScript
WORKDIR /build/apps/kiosk-agent

# Copy build script
COPY infra/docker/build.sh /tmp/build.sh
RUN chmod +x /tmp/build.sh && /tmp/build.sh

# Stage 2: Runtime
FROM node:20-alpine

# Install runtime dependencies
RUN apk add --no-cache \
    tini \
    sqlite \
    dumb-init

# Create app user
RUN addgroup -g 1001 -S kiosk && \
    adduser -u 1001 -S kiosk -G kiosk

WORKDIR /app

# Copy package files
COPY --chown=kiosk:kiosk apps/kiosk-agent/package*.json ./

# Install production dependencies only
RUN npm ci --production --ignore-scripts || npm install --production --ignore-scripts

# Copy built application from builder
COPY --from=builder --chown=kiosk:kiosk /build/apps/kiosk-agent/dist ./dist

# Copy config if exists (optional)
RUN mkdir -p ./config

# Create directories for runtime data
RUN mkdir -p /app/data /app/logs && \
    chown -R kiosk:kiosk /app/data /app/logs

# Switch to non-root user
USER kiosk

# Expose port
EXPOSE 7070

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:7070/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]

# Start application
CMD ["node", "dist/index.js"]
