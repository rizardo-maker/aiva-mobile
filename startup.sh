#!/bin/bash

# Install dependencies
echo "Installing dependencies..."
npm install

# Build the TypeScript server
echo "Building TypeScript server..."
npm run build

# Check if build was successful
if [ $? -ne 0 ]; then
  echo "Build failed. Check the logs above for errors."
  exit 1
fi

# Verify that dist folder exists and has files
if [ ! -d "dist" ] || [ -z "$(ls -A dist)" ]; then
  echo "Build completed but dist folder is empty or missing."
  exit 1
fi

echo "Build successful. Starting server..."
node combined.js