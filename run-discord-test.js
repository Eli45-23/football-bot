#!/usr/bin/env node

/**
 * Run a single test update in Discord to demonstrate the new functionality
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

async function runDiscordTest() {
  console.log('🚀 Starting Discord test for RSS integration...\n');
  
  try {
    console.log('🤖 Logging into Discord...');
    await client.login(process.env.DISCORD_TOKEN);
    console.log(`✅ Logged in as ${client.user.tag}`);
    
    console.log('🧪 Running test update with RSS integration...');
    console.log('   This will post 5 messages to your Discord channel:');
    console.log('   1. 📢 Header with timestamp');
    console.log('   2. 🏥 Injuries (from RSS feeds)');  
    console.log('   3. 🔁 Roster Changes (from RSS feeds)');
    console.log('   4. 📅 Scheduled Games (from TheSportsDB)');
    console.log('   5. 📰 Breaking News (from RSS feeds)');
    console.log('   6. 🗂 Sources footer');
    console.log();
    
    const updater = new DailyUpdater(client);
    await updater.testUpdate();
    
    console.log('✅ Test completed! Check your Discord channel for the results.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    setTimeout(() => {
      console.log('👋 Cleaning up and exiting...');
      client.destroy();
      process.exit(0);
    }, 2000);
  }
}

client.once('ready', () => {
  console.log('🟢 Discord client ready!');
  runDiscordTest();
});

client.on('error', (error) => {
  console.error('❌ Discord client error:', error);
});

console.log('🔌 Connecting to Discord...');