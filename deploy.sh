#!/bin/bash

# Azure Web App deployment script for AIVA Backend Server

echo "Starting deployment process..."

# Clean previous builds
echo "Cleaning previous builds..."
rm -rf dist
rm -rf node_modules

# Install dependencies
echo "Installing dependencies..."
npm ci

# Build TypeScript files
echo "Building TypeScript files..."
npm run build

# Check if build was successful
if [ ! -d "dist" ] || [ -z "$(ls -A dist)" ]; then
  echo "ERROR: Build failed or dist directory is empty"
  exit 1
fi

echo "Build successful!"

# List contents of dist directory for verification
echo "Contents of dist directory:"
ls -la dist

# Ensure startup.js exists
if [ ! -f "startup.js" ]; then
  echo "ERROR: startup.js not found"
  exit 1
fi

echo "Deployment package ready!"
echo "Starting server with: node startup.js"