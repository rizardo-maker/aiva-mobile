# Multi-stage build for AIVA Backend API

# Build stage
FROM node:20-alpine AS builder

# Set the working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies including dev dependencies for building
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript files
RUN npx tsc --project tsconfig.json

# Production stage
FROM node:20-alpine AS production

# Set the working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Copy other necessary files
COPY .env .env
COPY health-check.js ./

# Expose the port the app runs on
EXPOSE $PORT

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node health-check.js

# Start the application
CMD ["node", "dist/index.js"]