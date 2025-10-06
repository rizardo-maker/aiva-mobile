#!/bin/bash

# Railway startup script for AIVA Backend API

echo "Starting AIVA Backend API on Railway..."

# Install dependencies
echo "Installing dependencies..."
npm ci --only=production

# Build TypeScript files
echo "Building TypeScript files..."
npm run build

# Check if dist directory exists
if [ ! -d "./dist" ]; then
  echo "ERROR: dist directory not found after build"
  exit 1
fi

# Check if index.js exists in dist
if [ ! -f "./dist/index.js" ]; then
  echo "ERROR: dist/index.js not found after build"
  exit 1
fi

echo "Build completed successfully."

# Start the application
echo "Starting the application..."
node dist/index.js