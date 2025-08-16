const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js');
const config = require('./config/config');
const DailyUpdater = require('./utils/dailyUpdater');
const { getScheduler } = require('./src/scheduler/dailyScheduler');
const offlineQueue = require('./src/posting/offlineQueue');

/**
 * Production-Grade NFL Discord Bot
 * Main entry point - handles Discord client initialization,
 * command loading, event handling, and daily update scheduling
 */
class NFLDiscordBot {
  constructor() {
    // Initialize Discord client with required intents and WebSocket configuration
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds
      ],
      // Enhanced WebSocket configuration for connection resilience
      ws: {
        timeout: 30_000,        // 30s handshake timeout (default is 15s)
        reconnectTimeout: 5000, // 5s between reconnect attempts
        retryLimit: 3           // Max reconnection attempts
      },
      // Additional connection options
      rest: {
        timeout: 15_000,        // 15s REST API timeout
        retries: 3              // REST API retry attempts
      }
    });

    this.dailyUpdater = new DailyUpdater(this.client);
    
    this.setupEventHandlers();
  }

  /**
   * Set up Discord client event handlers
   */
  setupEventHandlers() {
    // Bot ready event
    this.client.once('ready', async () => {
      console.log('🏈 ===== NFL DISCORD BOT READY =====');
      console.log(`✅ Logged in as ${this.client.user.tag}`);
      console.log(`🤖 Bot ID: ${this.client.user.id}`);
      console.log(`🎯 Serving ${this.client.guilds.cache.size} server(s)`);
      console.log('📋 Slash commands disabled - scheduled updates only');
      
      // Update global status for health checks
      if (global.discordBotStatus) {
        global.discordBotStatus.connected = true;
        global.discordBotStatus.client = this.client.user.tag;
        global.discordBotStatus.lastError = null;
        console.log('✅ Health check status updated - Discord connected');
      }
      
      // Set bot activity status
      this.client.user.setActivity('NFL Scheduled Updates Only', { 
        type: ActivityType.Watching 
      });

      // Initialize resilient scheduler instead of basic cron
      const scheduler = getScheduler();
      await scheduler.initScheduler(this.client, this.dailyUpdater);

      // Check for missed runs and flush offline queue
      console.log('🔍 Client ready – checking missed runs and flushing offline queue...');
      await offlineQueue.flushOfflineQueue(this.client);
      await scheduler.checkMissedRuns();
      
      console.log('====================================\n');
    });

    // Silently ignore all interactions (commands disabled)
    this.client.on('interactionCreate', async interaction => {
      // Silently ignore all commands and interactions
      return;
    });

    // Enhanced connection and WebSocket event handling
    this.client.on('debug', (info) => {
      // Only log WebSocket and connection-related debug info
      if (info.includes('WebSocket') || info.includes('heartbeat') || info.includes('gateway')) {
        console.log('🔍 Discord Debug:', info);
      }
    });

    // WebSocket connection events
    this.client.ws.on('CONNECTING', () => {
      console.log('🔄 Connecting to Discord WebSocket...');
    });

    this.client.ws.on('CONNECTED', () => {
      console.log('✅ Connected to Discord WebSocket gateway');
    });

    this.client.ws.on('DISCONNECTED', () => {
      console.log('🔌 Disconnected from Discord WebSocket');
    });

    this.client.ws.on('RECONNECTING', () => {
      console.log('🔄 Reconnecting to Discord WebSocket...');
    });

    // Enhanced connection monitoring for resilient scheduling
    this.client.on('shardDisconnect', (event, id) => {
      console.warn(`🔌 Shard ${id} disconnect code=${event?.code || 'unknown'}`);
    });

    this.client.on('shardReady', (id) => {
      console.log(`✅ Shard ${id} ready`);
    });

    this.client.on('shardResume', async (id, replayed) => {
      console.log(`🔄 Shard ${id} resumed (${replayed} events) – checking missed runs...`);
      
      // Check for missed runs and flush offline queue on resume
      const scheduler = getScheduler();
      await offlineQueue.flushOfflineQueue(this.client);
      await scheduler.checkMissedRuns();
    });

    // Error handling
    this.client.on('error', error => {
      console.error('❌ Discord client error:', error);
      if (error.message.includes('handshake') || error.message.includes('timeout')) {
        console.error('🔧 WebSocket connection issue - check network connectivity');
        console.error('💡 Troubleshooting tips:');
        console.error('   - Verify Discord token is valid');
        console.error('   - Check internet connection');
        console.error('   - Verify no firewall blocking Discord API');
      }
    });

    this.client.on('warn', warning => {
      console.warn('⚠️ Discord client warning:', warning);
    });

    // Graceful shutdown handlers
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('unhandledRejection', error => {
      console.error('❌ Unhandled promise rejection:', error);
    });
  }




  /**
   * Validate network connectivity and Discord API access
   */
  async validateConnectivity() {
    const https = require('https');
    const dns = require('dns').promises;

    console.log('🔍 Validating network connectivity...');

    // Test DNS resolution for Discord gateway
    try {
      await dns.resolve('gateway.discord.gg');
      console.log('✅ Discord gateway DNS resolution successful');
    } catch (error) {
      console.error('❌ Cannot resolve Discord gateway DNS:', error.message);
      throw new Error('DNS resolution failed for Discord gateway');
    }

    // Test HTTPS connection to Discord API
    return new Promise((resolve, reject) => {
      const req = https.get('https://discord.com/api/v10/gateway', { timeout: 10000 }, (res) => {
        if (res.statusCode === 200) {
          console.log('✅ Discord API connectivity test successful');
          resolve(true);
        } else {
          reject(new Error(`Discord API returned status ${res.statusCode}`));
        }
      });

      req.on('error', (error) => {
        console.error('❌ Discord API connectivity test failed:', error.message);
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Discord API connectivity test timed out'));
      });
    });
  }

  /**
   * Start the Discord bot with retry mechanism
   */
  async start() {
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        console.log('🚀 Starting NFL Discord Bot...');
        
        // Pre-connection validation
        await this.validateConnectivity();
        
        // Validate Discord token exists
        if (!config.discord.token) {
          throw new Error('Discord token is missing - please set DISCORD_TOKEN environment variable');
        }
        
        // Log token info (safely)
        const tokenPrefix = config.discord.token.substring(0, 10);
        console.log(`🔐 Discord token found (starts with: ${tokenPrefix}...)`)
        
        console.log('🔄 Attempting to connect to Discord...');
        
        // Update connection attempt counter
        if (global.discordBotStatus) {
          global.discordBotStatus.connectionAttempts++;
        }
        
        // Attempt to login
        await this.client.login(config.discord.token);
        return; // Success - exit retry loop
        
      } catch (error) {
        retryCount++;
        console.error(`❌ Bot startup attempt ${retryCount}/${maxRetries} failed:`);
        console.error('Error details:', error);
        
        // Update global status with error
        if (global.discordBotStatus) {
          global.discordBotStatus.lastError = error.message || error.code || 'Unknown error';
        }
        
        // Log specific error types
        if (error.code === 'TOKEN_INVALID') {
          console.error('🔑 Invalid Discord token - please check your DISCORD_TOKEN environment variable');
        } else if (error.code === 'DISALLOWED_INTENTS') {
          console.error('⚠️ Bot intents configuration issue - check Discord application settings');
        } else if (error.message?.includes('ENOTFOUND') || error.message?.includes('ETIMEDOUT')) {
          console.error('🌐 Network connectivity issue - cannot reach Discord servers');
        } else if (error.message?.includes('401')) {
          console.error('🔑 Authentication failed - token may be invalid or expired');
        }
        
        if (retryCount < maxRetries) {
          const delay = Math.min(5000 * retryCount, 15000); // Exponential backoff, max 15s
          console.log(`⏳ Retrying in ${delay/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error('❌ All startup attempts failed');
          console.error('💡 Possible solutions:');
          console.error('   - Check Discord token validity in Render environment variables');
          console.error('   - Verify the token matches your Discord application');
          console.error('   - Check if Discord API is experiencing outages');
          console.error('   - Ensure bot has proper intents enabled in Discord Developer Portal');
          process.exit(1);
        }
      }
    }
  }

  /**
   * Graceful shutdown
   * @param {string} signal - Process signal that triggered shutdown
   */
  async shutdown(signal) {
    console.log(`\n🔄 Received ${signal}, shutting down gracefully...`);
    
    try {
      // Update bot status
      if (this.client.user) {
        await this.client.user.setActivity('Shutting down...', { type: ActivityType.Playing });
      }
      
      // Close Discord connection
      await this.client.destroy();
      console.log('✅ Discord client disconnected');
      
      console.log('👋 NFL Discord Bot shut down complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  }

  /**
   * Get bot status information
   * @returns {Object} Bot status data
   */
  getStatus() {
    return {
      botTag: this.client.user?.tag || 'Not logged in',
      uptime: this.client.uptime,
      guilds: this.client.guilds.cache.size,
      scheduledUpdates: 'Enabled (3x daily)',
      dailyUpdater: this.dailyUpdater.getStatus()
    };
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--test-update')) {
  // Test daily update functionality
  console.log('🧪 Running test update...');
  const { Client, GatewayIntentBits } = require('discord.js');
  const testClient = new Client({ intents: [GatewayIntentBits.Guilds] });
  const updater = new DailyUpdater(testClient);
  
  // Login the test client first
  testClient.once('ready', async () => {
    console.log(`✅ Test client logged in as ${testClient.user.tag}`);
    
    try {
      await updater.testUpdate();
      console.log('✅ Test update completed');
      process.exit(0);
    } catch (error) {
      console.error('❌ Test update failed:', error);
      process.exit(1);
    }
  });
  
  testClient.login(config.discord.token).catch(error => {
    console.error('❌ Test client login failed:', error);
    process.exit(1);
  });
} else {
  // Normal bot startup
  const bot = new NFLDiscordBot();
  bot.start();
}

module.exports = NFLDiscordBot;