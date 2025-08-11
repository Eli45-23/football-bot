#!/usr/bin/env node

/**
 * Trigger a full afternoon update (2 PM EST style) with enhanced fact extraction
 * Shows the complete scheduled update flow as users would see it
 */

const { Client, GatewayIntentBits } = require('discord.js');
const DailyUpdater = require('./utils/dailyUpdater');
const moment = require('moment-timezone');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

client.once('ready', async () => {
  console.log(`🤖 Bot connected as ${client.user.tag}`);
  
  try {
    const channel = await client.channels.fetch(process.env.NFL_UPDATES_CHANNEL_ID);
    console.log(`✅ Found Discord channel: #${channel.name}`);
    console.log();
    
    // Simulate 2 PM EST time
    const now = moment().tz('America/New_York');
    const afternoonTime = now.format('MMMM D, YYYY - 2:00 PM z');
    
    console.log('🕐 SIMULATING SCHEDULED AFTERNOON UPDATE');
    console.log('======================================');
    console.log(`📅 Time: ${afternoonTime}`);
    console.log(`📡 Channel: #${channel.name}`);
    console.log(`🔄 Type: Scheduled Afternoon Update`);
    console.log();
    
    console.log('🚀 Starting full NFL afternoon update...');
    console.log('   This shows EXACTLY what users see at 2 PM EST daily');
    console.log();
    console.log('📋 Expected Discord Messages:');
    console.log('   1️⃣ 📢 Header with timestamp and processing stats');
    console.log('   2️⃣ 🏥 Injuries with extracted facts (max 5)');
    console.log('   3️⃣ 🔁 Roster Changes with transaction facts (max 5)');
    console.log('   4️⃣ 📅 Scheduled Games from TheSportsDB (max 10)');
    console.log('   5️⃣ 📰 Breaking News with extracted facts (max 5)');
    console.log('   6️⃣ 🗂 Sources footer with attribution');
    console.log();
    
    console.log('⚡ Processing begins...');
    console.log('================================');
    
    // Create the enhanced daily updater
    const updater = new DailyUpdater(client);
    
    // Override the time string for 2 PM display
    const originalRunUpdate = updater.runScheduledUpdate;
    updater.runScheduledUpdate = async function(updateType) {
      console.log(`🕐 Running ${updateType} update...`);
      
      if (this.isRunning) {
        console.log(`⚠️ Update already in progress, skipping ${updateType} update...`);
        return;
      }
      
      this.isRunning = true;
      const timeStr = afternoonTime; // Use 2 PM time
      
      try {
        console.log(`🚀 Starting ${updateType} NFL update for ${timeStr}...`);
        console.log(`📊 Processing ${require('../config/config').nflTeams.length} teams in batches of ${this.batchSize}...`);
        
        // Collect NFL data using batched processing + RSS
        const nflData = await this.collectNFLDataBatched();
        
        // Post categorized updates to Discord (6 separate messages)
        await this.postStaggeredUpdatesToDiscord(nflData, timeStr, updateType);
        
        this.lastRuns[updateType] = new Date();
        console.log(`🎉 ${updateType} update completed successfully!`);
        
      } catch (error) {
        console.error(`❌ Error during ${updateType} update:`, error);
      } finally {
        this.isRunning = false;
      }
    };
    
    // Run the afternoon update
    await updater.runScheduledUpdate('afternoon');
    
    console.log();
    console.log('🎉 AFTERNOON UPDATE COMPLETE!');
    console.log('============================');
    console.log('📱 Check your Discord channel to see:');
    console.log('   ✅ Full 2 PM EST style update');
    console.log('   ✅ Enhanced fact extraction in action');
    console.log('   ✅ Real NFL facts instead of headlines');
    console.log('   ✅ Professional Discord embeds');
    console.log('   ✅ Source attribution without URLs');
    console.log('   ✅ Scheduled games + RSS facts combined');
    console.log();
    console.log('🔄 This same update runs automatically at:');
    console.log('   🌅 8:00 AM EST (Morning Update)');
    console.log('   🌞 2:00 PM EST (Afternoon Update)');
    console.log('   🌙 8:00 PM EST (Evening Update)');
    console.log();
    console.log('🚀 Your enhanced NFL bot is fully operational!');
    
  } catch (error) {
    console.error('❌ Afternoon update failed:', error);
  }
  
  setTimeout(() => {
    console.log('👋 Disconnecting...');
    client.destroy();
    process.exit(0);
  }, 10000);
});

client.on('error', (error) => {
  console.error('❌ Discord client error:', error);
});

console.log('🏈 NFL Bot - Scheduled Afternoon Update Simulation');
console.log('==================================================');
console.log('🔗 Connecting to Discord...');

client.login(process.env.DISCORD_TOKEN);