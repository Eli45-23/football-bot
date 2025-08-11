#!/usr/bin/env node

/**
 * Trigger a manual test update to show the new RSS integration in Discord
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

async function triggerTestUpdate() {
  try {
    console.log('🤖 Logging into Discord...');
    
    await client.login(process.env.DISCORD_TOKEN);
    console.log(`✅ Logged in as ${client.user.tag}`);
    
    console.log('🧪 Creating daily updater and running test...');
    const updater = new DailyUpdater(client);
    
    // Trigger a manual test update
    await updater.testUpdate();
    
    console.log('✅ Test update completed! Check your Discord channel for the results.');
    console.log(`   The update should appear in 5 separate messages:`);
    console.log(`   1. Header with timestamp and stats`);
    console.log(`   2. 🏥 Injuries section (with RSS articles)`);
    console.log(`   3. 🔁 Roster Changes section`);
    console.log(`   4. 📅 Scheduled Games section (from TheSportsDB)`);
    console.log(`   5. 📰 Breaking News section (with RSS articles)`);
    console.log(`   6. 🗂 Sources footer`);
    
  } catch (error) {
    console.error('❌ Error during test:', error);
  } finally {
    setTimeout(() => {
      client.destroy();
      process.exit(0);
    }, 3000);
  }
}

client.once('ready', () => {
  console.log('🤖 Bot is ready, triggering test update...');
  triggerTestUpdate();
});

client.on('error', console.error);