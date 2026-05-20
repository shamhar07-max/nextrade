FROM node:22-alpine

WORKDIR /app

# Install dependencies first (cached layer)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY src/ ./src/
COPY .env.example ./.env.example

# Create data directory for SQLite
RUN mkdir -p /app/data

# Non-root user for security
RUN addgroup -S nextrade && adduser -S nextrade -G nextrade
RUN chown -R nextrade:nextrade /app
USER nextrade

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

CMD ["node", "src/server.js"]
