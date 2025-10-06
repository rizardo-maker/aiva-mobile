// Simple test script to verify logging functionality
const { logger } = require('./dist/utils/logger.js');

console.log('Testing logging functionality...');

logger.info('This is an info message');
logger.warn('This is a warning message');
logger.error('This is an error message');
logger.debug('This is a debug message');

console.log('Logging test completed. Check the logs directory for output files.');