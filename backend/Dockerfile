# Stage 1: Build dependencies
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Stage 2: Final runner image
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=5550

# Copy node_modules from builder
COPY --from=builder /usr/src/app/node_modules ./node_modules
# Copy source files
COPY package*.json ./
COPY server.js ./
COPY src/ ./src/
COPY contractData.json* ./
COPY globalPayData.json* ./
COPY scheduledTransferData.json* ./

# Use a non-privileged system user for running the application
USER node

EXPOSE 5550

CMD ["node", "server.js"]
