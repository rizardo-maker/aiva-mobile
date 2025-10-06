#!/usr/bin/env node

// Simple log analysis script for production environments
const fs = require('fs');
const path = require('path');

// Log file to analyze
const logFile = process.argv[2] || path.join(__dirname, 'logs', 'application.log');

// Check if log file exists
if (!fs.existsSync(logFile)) {
  console.log(`Log file not found: ${logFile}`);
  process.exit(1);
}

// Read the log file
const logData = fs.readFileSync(logFile, 'utf8');
const lines = logData.split('\n').filter(line => line.trim() !== '');

// Analysis counters
const stats = {
  total: lines.length,
  errors: 0,
  warnings: 0,
  info: 0,
  debug: 0,
  http: 0,
  errorMessages: {},
  warningMessages: {},
  topEndpoints: {},
  responseTimes: []
};

console.log('=== Log Analysis Report ===\n');

// Process each line
lines.forEach(line => {
  try {
    const logEntry = JSON.parse(line);
    const level = logEntry.level;
    const message = logEntry.message;
    
    // Count log levels
    stats[level] = (stats[level] || 0) + 1;
    
    // Analyze specific log types
    if (level === 'error') {
      const errorMsg = message.split(' - ')[0]; // Get the error message part
      stats.errorMessages[errorMsg] = (stats.errorMessages[errorMsg] || 0) + 1;
    } else if (level === 'warn') {
      stats.warningMessages[message] = (stats.warningMessages[message] || 0) + 1;
    } else if (level === 'http') {
      // Extract endpoint information
      const match = message.match(/(\w+) (\/[^\s]+) (\d+) - (\d+)ms/);
      if (match) {
        const [, method, endpoint, statusCode, duration] = match;
        const fullEndpoint = `${method} ${endpoint}`;
        stats.topEndpoints[fullEndpoint] = (stats.topEndpoints[fullEndpoint] || 0) + 1;
        stats.responseTimes.push(parseInt(duration));
      }
    }
  } catch (e) {
    // Skip non-JSON lines
  }
});

// Display summary statistics
console.log(`Total log entries: ${stats.total}`);
console.log(`Errors: ${stats.errors}`);
console.log(`Warnings: ${stats.warnings}`);
console.log(`Info: ${stats.info}`);
console.log(`Debug: ${stats.debug}`);
console.log(`HTTP requests: ${stats.http}\n`);

// Display top error messages
if (Object.keys(stats.errorMessages).length > 0) {
  console.log('=== Top Error Messages ===');
  const sortedErrors = Object.entries(stats.errorMessages)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10);
  
  sortedErrors.forEach(([message, count]) => {
    console.log(`  ${count}x: ${message}`);
  });
  console.log();
}

// Display top warning messages
if (Object.keys(stats.warningMessages).length > 0) {
  console.log('=== Top Warning Messages ===');
  const sortedWarnings = Object.entries(stats.warningMessages)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10);
  
  sortedWarnings.forEach(([message, count]) => {
    console.log(`  ${count}x: ${message}`);
  });
  console.log();
}

// Display top endpoints
if (Object.keys(stats.topEndpoints).length > 0) {
  console.log('=== Top API Endpoints ===');
  const sortedEndpoints = Object.entries(stats.topEndpoints)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10);
  
  sortedEndpoints.forEach(([endpoint, count]) => {
    console.log(`  ${count}x: ${endpoint}`);
  });
  console.log();
}

// Display response time statistics
if (stats.responseTimes.length > 0) {
  console.log('=== Response Time Statistics ===');
  const times = stats.responseTimes.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = times[0];
  const max = times[times.length - 1];
  const median = times[Math.floor(times.length / 2)];
  
  console.log(`  Average: ${avg.toFixed(2)}ms`);
  console.log(`  Minimum: ${min}ms`);
  console.log(`  Maximum: ${max}ms`);
  console.log(`  Median: ${median}ms`);
  console.log();
}

console.log('=== End of Report ===');