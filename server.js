const express = require('express');
const path = require('path');

// Import the main bot
const NFLDiscordBot = require('./index.js');

// Create Express app for health checks (Render requirement)
const app = express();
const PORT = process.env.PORT || 10000;

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    service: 'NFL Discord Bot'
  });
});

// Status endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'NFL Discord Bot',
    status: 'running',
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

// Start the Express server for health checks
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Health check server running on port ${PORT} - Ready for Render!`);
});

// Start the Discord bot
console.log('🤖 Starting NFL Discord Bot...');
const bot = new NFLDiscordBot();
bot.start();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📴 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

module.exports = app;