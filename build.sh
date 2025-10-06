#!/bin/bash

# Build script for AIVA Backend API

echo "Building AIVA Backend API..."

# Clean dist directory
rm -rf dist

# Build TypeScript files
npx tsc --project tsconfig.json

# Check if build was successful
if [ $? -eq 0 ]; then
    echo "Build completed successfully!"
    
    # List built files
    echo "Built files:"
    ls -la dist/
    
    # Check if index.js exists
    if [ -f "dist/index.js" ]; then
        echo "✅ Main entry point exists"
    else
        echo "❌ Main entry point missing"
        exit 1
    fi
else
    echo "❌ Build failed"
    exit 1
fi