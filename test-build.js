// Simple test script to verify TypeScript build
const { exec } = require('child_process');
const path = require('path');

console.log('Testing TypeScript build...');

// Run TypeScript build
exec('npx tsc --project tsconfig.json --noEmit', (error, stdout, stderr) => {
  if (error) {
    console.error('TypeScript build failed:');
    console.error(stderr);
    process.exit(1);
  }
  
  console.log('TypeScript build successful!');
  console.log(stdout);
  
  // Check if dist directory would be created
  exec('npx tsc --project tsconfig.json --outDir temp-dist --noEmitOnError --listFiles', (error2, stdout2, stderr2) => {
    if (error2) {
      console.error('TypeScript compilation check failed:');
      console.error(stderr2);
      process.exit(1);
    }
    
    console.log('TypeScript compilation check successful!');
    console.log('Files that would be compiled:');
    console.log(stdout2);
    
    process.exit(0);
  });
});