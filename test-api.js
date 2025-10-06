const express = require('express');
const app = express();
const port = process.env.PORT || 8080;

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'AIVA Backend API Test'
  });
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'AIVA Backend API',
    description: 'AI-powered chat application backend',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      chat: '/api/chat',
      user: '/api/user'
    }
  });
});

// Auth endpoints
app.post('/api/auth/login', (req, res) => {
  res.json({
    message: 'Login endpoint working',
    received: req.body
  });
});

app.post('/api/auth/register', (req, res) => {
  res.json({
    message: 'Register endpoint working',
    received: req.body
  });
});

app.get('/api/auth/verify', (req, res) => {
  res.json({
    message: 'Verify endpoint working'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

app.listen(port, () => {
  console.log(`Test API server running on port ${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
  console.log(`API info: http://localhost:${port}/api`);
});