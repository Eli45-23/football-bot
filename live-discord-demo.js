#!/usr/bin/env node

/**
 * Live Discord demonstration of the enhanced fact extraction system
 * This will trigger a real update with extracted facts in your Discord channel
 */

const { Client, GatewayIntentBits } = require('discord.js');
const DailyUpdater = require('./utils/dailyUpdater');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

client.once('ready', async () => {
  console.log(`🤖 Bot connected as ${client.user.tag}`);
  console.log(`📡 Target channel: ${process.env.NFL_UPDATES_CHANNEL_ID}`);
  
  try {
    const channel = await client.channels.fetch(process.env.NFL_UPDATES_CHANNEL_ID);
    console.log(`✅ Found Discord channel: #${channel.name}`);
    console.log();
    
    console.log('🚀 Starting LIVE enhanced NFL update...');
    console.log('   This will show the new fact extraction system in action!');
    console.log('   Watch your Discord channel for:');
    console.log('   📢 1. Header with processing stats');
    console.log('   🏥 2. Injury FACTS (not headlines)');
    console.log('   🔁 3. Roster transaction FACTS');
    console.log('   📅 4. Scheduled games from TheSportsDB');
    console.log('   📰 5. Breaking news FACTS');
    console.log('   🗂 6. Sources footer');
    console.log();
    
    // Create the enhanced daily updater
    const updater = new DailyUpdater(client);
    
    // Run the enhanced test update
    console.log('⚡ Triggering enhanced RSS + fact extraction...');
    await updater.testUpdate();
    
    console.log();
    console.log('🎉 LIVE DEMO COMPLETE!');
    console.log('📱 Check your Discord channel to see:');
    console.log('   ✅ Real extracted facts instead of headlines');
    console.log('   ✅ Player names with team abbreviations');
    console.log('   ✅ Clean bullet points without URLs');
    console.log('   ✅ Proper categorization (injuries vs roster vs breaking)');
    console.log('   ✅ Source attribution in parentheses');
    console.log();
    console.log('🔥 Your bot is now extracting REAL NFL FACTS!');
    
  } catch (error) {
    console.error('❌ Live demo failed:', error);
  }
  
  setTimeout(() => {
    console.log('👋 Disconnecting...');
    client.destroy();
    process.exit(0);
  }, 5000);
});

client.on('error', (error) => {
  console.error('❌ Discord client error:', error);
});

console.log('🏈 NFL Bot Enhanced Live Demo');
console.log('===============================');
console.log('🔗 Connecting to Discord...');

client.login(process.env.DISCORD_TOKEN);