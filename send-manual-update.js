require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config/config');
const DailyUpdater = require('./utils/dailyUpdater');

/**
 * Manual trigger for a full NFL update report
 * Sends a complete update just like the scheduled ones
 */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`📋 Target Channel: #nfl-updates (${config.discord.nflUpdatesChannelId})`);
  console.log('🚀 Starting manual NFL update...\n');
  
  try {
    // Create the daily updater instance
    const dailyUpdater = new DailyUpdater(client);
    
    // Get current time for the update type
    const hour = new Date().getHours();
    let updateType;
    if (hour < 12) {
      updateType = 'morning';
    } else if (hour < 18) {
      updateType = 'afternoon';
    } else {
      updateType = 'evening';
    }
    
    console.log(`📊 Running ${updateType} update (based on current time)...`);
    console.log('⏳ This will take 2-3 minutes to collect all NFL data...\n');
    
    // Run the scheduled update
    await dailyUpdater.runScheduledUpdate(updateType);
    
    console.log('\n✅ Manual update completed successfully!');
    console.log('📤 Check #nfl-updates channel in Discord for the full report');
    
  } catch (error) {
    console.error('❌ Failed to send manual update:', error.message);
    console.error('Error details:', error);
  }
  
  // Wait a bit for any pending operations
  setTimeout(async () => {
    await client.destroy();
    process.exit(0);
  }, 5000);
});

// Handle errors
client.on('error', error => {
  console.error('❌ Discord client error:', error);
});

// Login
console.log('🔄 Connecting to Discord...');
client.login(config.discord.token).catch(error => {
  console.error('❌ Failed to login:', error.message);
  process.exit(1);
});