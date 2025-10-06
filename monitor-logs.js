#!/usr/bin/env node

// Simple log monitoring script for production environments
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Log file to monitor
const logFile = process.argv[2] || path.join(__dirname, 'logs', 'application.log');

// Check if log file exists
if (!fs.existsSync(logFile)) {
  console.log(`Log file not found: ${logFile}`);
  process.exit(1);
}

// Create readline interface for tailing the file
const rl = readline.createInterface({
  input: fs.createReadStream(logFile),
  terminal: false
});

console.log(`Monitoring log file: ${logFile}`);
console.log('Press Ctrl+C to exit\n');

// Process each line
rl.on('line', (line) => {
  // Parse JSON log entries
  try {
    const logEntry = JSON.parse(line);
    const timestamp = logEntry.timestamp;
    const level = logEntry.level;
    const message = logEntry.message;
    
    // Color coding based on log level
    let color = '\x1b[0m'; // Reset
    switch (level) {
      case 'error':
        color = '\x1b[31m'; // Red
        break;
      case 'warn':
        color = '\x1b[33m'; // Yellow
        break;
      case 'info':
        color = '\x1b[32m'; // Green
        break;
      case 'debug':
        color = '\x1b[36m'; // Cyan
        break;
    }
    
    console.log(`${color}[${timestamp}] ${level.toUpperCase()}: ${message}\x1b[0m`);
  } catch (e) {
    // If not JSON, print as-is
    console.log(line);
  }
});

// Handle errors
rl.on('error', (err) => {
  console.error('Error reading log file:', err);
  process.exit(1);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nStopping log monitoring...');
  rl.close();
  process.exit(0);
});