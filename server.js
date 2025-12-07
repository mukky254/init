// Simple server.js file
const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;

// Basic middleware
app.use(require('cors')());
app.use(express.json());

// Test route
app.get('/', (req, res) => {
  res.json({
    message: '🎓 Attendance System API',
    status: 'running',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Health check route
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
