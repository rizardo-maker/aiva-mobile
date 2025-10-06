const { execSync, spawn } = require('child_process');
const path = require('path');

console.log('Starting AIVA Backend Server...');

try {
  // Install dependencies
  console.log('Installing dependencies...');
  execSync('npm install', { stdio: 'inherit' });
  
  // Build TypeScript files
  console.log('Building TypeScript files...');
  execSync('npm run build', { stdio: 'inherit' });
  
  console.log('Build completed successfully.');
  
  // Check if dist directory exists
  const fs = require('fs');
  if (!fs.existsSync('./dist')) {
    console.error('ERROR: dist directory not found after build');
    process.exit(1);
  }
  
  // Check if index.js exists in dist
  if (!fs.existsSync('./dist/index.js')) {
    console.error('ERROR: dist/index.js not found after build');
    process.exit(1);
  }
  
  console.log('Starting the full backend application...');
  
  // Start the built application
  const backend = spawn('node', ['dist/index.js'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production'
    }
  });
  
  backend.on('error', (error) => {
    console.error('Failed to start backend:', error.message);
    process.exit(1);
  });
  
  backend.on('exit', (code) => {
    console.log(`Backend process exited with code ${code}`);
    process.exit(code);
  });
  
  // Handle process termination
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    backend.kill('SIGTERM');
  });
  
  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    backend.kill('SIGINT');
  });
  
} catch (error) {
  console.error('Failed to start server:', error.message);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}