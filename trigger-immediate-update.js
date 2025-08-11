#!/usr/bin/env node
require('dotenv').config();

/**
 * Immediate Discord NFL Update Trigger
 * Runs the full NFL update pipeline and posts to Discord immediately
 */
async function triggerImmediateUpdate() {
  console.log('🚀 Triggering immediate NFL Discord update...');
  
  try {
    // Import dependencies
    const { Client, GatewayIntentBits } = require('discord.js');
    const config = require('./config/config');
    const DailyUpdater = require('./utils/dailyUpdater');
    
    // Validate Discord token
    if (!process.env.DISCORD_TOKEN) {
      console.error('❌ DISCORD_TOKEN environment variable not set');
      process.exit(1);
    }
    
    if (!process.env.NFL_UPDATES_CHANNEL_ID) {
      console.error('❌ NFL_UPDATES_CHANNEL_ID environment variable not set');
      process.exit(1);
    }
    
    // Create Discord client
    const client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
    });
    
    // Initialize updater
    const updater = new DailyUpdater(client);
    
    // Login and trigger update
    await client.login(process.env.DISCORD_TOKEN);
    console.log('✅ Discord client connected');
    
    // Wait a moment for client to be fully ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Run the update (using 'manual' type to distinguish from scheduled)
    await updater.runScheduledUpdate('manual');
    
    console.log('🎉 Immediate update completed successfully!');
    
    // Cleanup
    client.destroy();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Immediate update failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  triggerImmediateUpdate();
}

module.exports = { triggerImmediateUpdate };