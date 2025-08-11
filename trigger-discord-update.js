#!/usr/bin/env node

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
  console.log(`🤖 Bot logged in as ${client.user.tag}`);
  console.log(`📡 Channel ID: ${process.env.NFL_UPDATES_CHANNEL_ID}`);
  
  try {
    console.log('🧪 Creating DailyUpdater and running test...');
    const updater = new DailyUpdater(client);
    
    console.log('🚀 Triggering RSS-enhanced test update...');
    await updater.testUpdate();
    
    console.log('✅ Test update completed! Check your Discord channel.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
  
  setTimeout(() => {
    client.destroy();
    process.exit(0);
  }, 3000);
});

client.on('error', console.error);

console.log('🔌 Logging into Discord...');
client.login(process.env.DISCORD_TOKEN);