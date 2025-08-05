const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const config = require('./config/config');
const DailyUpdater = require('./utils/dailyUpdater');

/**
 * Production-Grade NFL Discord Bot
 * Main entry point - handles Discord client initialization,
 * command loading, event handling, and daily update scheduling
 */
class NFLDiscordBot {
  constructor() {
    // Initialize Discord client with required intents
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds
      ]
    });

    this.dailyUpdater = new DailyUpdater(this.client);
    
    this.setupEventHandlers();
  }

  /**
   * Set up Discord client event handlers
   */
  setupEventHandlers() {
    // Bot ready event
    this.client.once('ready', () => {
      console.log('🏈 ===== NFL DISCORD BOT READY =====');
      console.log(`✅ Logged in as ${this.client.user.tag}`);
      console.log(`🤖 Bot ID: ${this.client.user.id}`);
      console.log(`🎯 Serving ${this.client.guilds.cache.size} server(s)`);
      console.log('📋 Slash commands disabled - scheduled updates only');
      
      // Set bot activity status
      this.client.user.setActivity('NFL Scheduled Updates Only', { 
        type: 'WATCHING' 
      });

      // Start daily update scheduler
      this.dailyUpdater.start();
      
      console.log('====================================\n');
    });

    // Silently ignore all interactions (commands disabled)
    this.client.on('interactionCreate', async interaction => {
      // Silently ignore all commands and interactions
      return;
    });

    // Error handling
    this.client.on('error', error => {
      console.error('❌ Discord client error:', error);
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
   * Start the Discord bot
   */
  async start() {
    try {
      console.log('🚀 Starting NFL Discord Bot...');
      await this.client.login(config.discord.token);
    } catch (error) {
      console.error('❌ Failed to start bot:', error);
      process.exit(1);
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
        await this.client.user.setActivity('Shutting down...', { type: 'PLAYING' });
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