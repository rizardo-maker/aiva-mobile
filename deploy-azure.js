const { execSync } = require('child_process');
const fs = require('fs');

console.log('Preparing deployment package for Azure...');

try {
  // Clean previous builds
  console.log('Cleaning previous builds...');
  if (fs.existsSync('dist')) {
    fs.rmSync('dist', { recursive: true });
  }
  
  // Install dependencies
  console.log('Installing production dependencies...');
  execSync('npm ci --only=production', { stdio: 'inherit' });
  
  // Build TypeScript files
  console.log('Building TypeScript files...');
  execSync('npm run build', { stdio: 'inherit' });
  
  // Verify build
  console.log('Verifying build...');
  if (!fs.existsSync('dist')) {
    throw new Error('Build failed: dist directory not found');
  }
  
  if (!fs.existsSync('dist/index.js')) {
    throw new Error('Build failed: dist/index.js not found');
  }
  
  console.log('Build verification successful!');
  console.log('Deployment package is ready for Azure App Service.');
  console.log('');
  console.log('Next steps:');
  console.log('1. Deploy this directory to Azure App Service');
  console.log('2. Ensure the startup command is set to: node startup.js');
  console.log('3. Verify that all environment variables are set in Azure App Settings');
  
} catch (error) {
  console.error('Deployment preparation failed:', error.message);
  process.exit(1);
}