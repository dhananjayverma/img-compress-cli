# Multi-stage Dockerfile for Pixora Developer Asset Optimization Platform
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json tsconfig.json tsup.config.ts ./
RUN npm ci

COPY src/ ./src/
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /usr/src/app/dist ./dist

# Create user for security
USER node

# Expose ports: 3333 for REST API, 4000 for Dev Server / Dashboard
EXPOSE 3333
EXPOSE 4000

ENV NODE_ENV=production

# Default command starts the Local REST API server
CMD ["node", "dist/cli.js", "api"]
