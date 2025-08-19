const express = require('express');
const path = require('path');

// Create Express app for health checks (Render requirement)
const app = express();
const PORT = process.env.PORT || 10000;

// Track Discord bot status
let discordBotStatus = {
  connected: false,
  client: null,
  lastError: null,
  connectionAttempts: 0
};

// Track instance state for cold start detection
let instanceState = {
  startTime: Date.now(),
  lastPing: Date.now(),
  pingCount: 0,
  coldStartDetected: false,
  lastActivity: Date.now()
};

// Health check endpoint for Render
app.get('/health', (req, res) => {
  const healthStatus = {
    status: discordBotStatus.connected ? 'healthy' : 'unhealthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    service: 'NFL Discord Bot',
    discord: {
      connected: discordBotStatus.connected,
      connectionAttempts: discordBotStatus.connectionAttempts,
      lastError: discordBotStatus.lastError
    }
  };
  
  // Return 503 if Discord is not connected (helps Render understand the service isn't ready)
  const statusCode = discordBotStatus.connected ? 200 : 503;
  res.status(statusCode).json(healthStatus);
});

// Keep-alive ping endpoint to prevent Render cold starts
app.get('/ping', (req, res) => {
  const now = Date.now();
  const timeSinceLastPing = now - instanceState.lastPing;
  
  // Update instance state
  instanceState.lastPing = now;
  instanceState.lastActivity = now;
  instanceState.pingCount++;
  
  // Detect potential cold start (if it's been more than 20 minutes since last ping)
  const wasCold = timeSinceLastPing > 1200000; // 20 minutes
  if (wasCold) {
    instanceState.coldStartDetected = true;
    console.log(`🧊 [COLD START DETECTED] Instance was cold for ${(timeSinceLastPing / 60000).toFixed(1)} minutes`);
  }
  
  console.log(`📡 [KEEP-ALIVE] Ping #${instanceState.pingCount} - Instance warm (${(timeSinceLastPing / 1000).toFixed(1)}s since last ping)`);
  
  res.json({
    status: 'pong',
    timestamp: new Date().toISOString(),
    instance: {
      uptime: process.uptime(),
      startTime: instanceState.startTime,
      pingCount: instanceState.pingCount,
      timeSinceLastPing: timeSinceLastPing,
      wasCold: wasCold,
      everCold: instanceState.coldStartDetected
    }
  });
});

// Status endpoint with cold start monitoring
app.get('/', (req, res) => {
  const now = Date.now();
  const timeSinceStart = now - instanceState.startTime;
  const timeSinceLastPing = now - instanceState.lastPing;
  const timeSinceLastActivity = now - instanceState.lastActivity;
  
  res.json({
    service: 'NFL Discord Bot',
    status: discordBotStatus.connected ? 'running' : 'connecting',
    discord_connected: discordBotStatus.connected,
    uptime: process.uptime(),
    version: '1.0.0',
    environment: {
      NODE_ENV: process.env.NODE_ENV || 'development',
      has_discord_token: !!process.env.DISCORD_TOKEN,
      has_channel_id: !!process.env.NFL_UPDATES_CHANNEL_ID,
      port: PORT
    },
    instance: {
      startTime: new Date(instanceState.startTime).toISOString(),
      uptime: `${(timeSinceStart / 1000).toFixed(1)}s`,
      pingCount: instanceState.pingCount,
      lastPing: new Date(instanceState.lastPing).toISOString(),
      timeSinceLastPing: `${(timeSinceLastPing / 1000).toFixed(1)}s`,
      lastActivity: new Date(instanceState.lastActivity).toISOString(),
      timeSinceLastActivity: `${(timeSinceLastActivity / 1000).toFixed(1)}s`,
      coldStartDetected: instanceState.coldStartDetected,
      isWarm: timeSinceLastPing < 900000 // Warm if pinged in last 15 minutes
    }
  });
});

// Start the Express server for health checks
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Health check server running on port ${PORT} - Ready for Render!`);
  console.log(`📋 Health check endpoint: http://0.0.0.0:${PORT}/health`);
  console.log(`📡 Keep-alive endpoint: http://0.0.0.0:${PORT}/ping`);
  
  // Log initial instance state
  console.log(`🚀 [INSTANCE STATE] Started at ${new Date().toISOString()}`);
  console.log(`🧊 [COLD START MONITOR] Tracking cold starts and instance warmth`);
});

// Validate critical environment variables
console.log('🔍 Validating environment variables...');
const requiredEnvVars = {
  'DISCORD_TOKEN': process.env.DISCORD_TOKEN,
  'NFL_UPDATES_CHANNEL_ID': process.env.NFL_UPDATES_CHANNEL_ID
};

const optionalEnvVars = {
  'DISCORD_CLIENT_ID': process.env.DISCORD_CLIENT_ID,
  'DISCORD_GUILD_ID': process.env.DISCORD_GUILD_ID,
  'OPENAI_API_KEY': process.env.OPENAI_API_KEY,
  'NODE_ENV': process.env.NODE_ENV,
  'PORT': process.env.PORT
};

// Check required variables
let missingRequired = [];
for (const [key, value] of Object.entries(requiredEnvVars)) {
  if (!value) {
    missingRequired.push(key);
    console.error(`❌ Missing required env var: ${key}`);
  } else {
    const preview = key.includes('TOKEN') || key.includes('KEY') 
      ? `${value.substring(0, 10)}...` 
      : value;
    console.log(`✅ ${key}: ${preview}`);
  }
}

// Check optional variables
for (const [key, value] of Object.entries(optionalEnvVars)) {
  if (!value) {
    console.log(`⚠️ Optional env var not set: ${key}`);
  } else {
    const preview = key.includes('TOKEN') || key.includes('KEY') 
      ? `${value.substring(0, 10)}...` 
      : value;
    console.log(`✅ ${key}: ${preview}`);
  }
}

if (missingRequired.length > 0) {
  console.error('\n❌ Cannot start bot - missing required environment variables:', missingRequired.join(', '));
  console.error('💡 Please set these in your Render environment variables');
  process.exit(1);
}

console.log('✅ All required environment variables are set\n');

// Start the Discord bot by requiring index.js (which auto-starts)
console.log('🤖 Starting NFL Discord Bot...');

// Make discordBotStatus and instanceState available globally for the bot to update
global.discordBotStatus = discordBotStatus;
global.instanceState = instanceState;

require('./index.js');

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