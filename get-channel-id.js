#!/usr/bin/env node

/**
 * Helper script to find Discord channel IDs
 */

require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log('\n📋 Available channels:\n');
  
  // Get all guilds (servers) the bot is in
  client.guilds.cache.forEach(guild => {
    console.log(`🏠 Server: ${guild.name} (ID: ${guild.id})`);
    console.log('  Channels:');
    
    // Get all text channels
    guild.channels.cache
      .filter(channel => channel.type === 0) // 0 = GUILD_TEXT
      .forEach(channel => {
        console.log(`    #${channel.name} - ID: ${channel.id}`);
      });
    
    console.log('\n');
  });
  
  // Look specifically for football-updates channel
  const updateChannels = client.channels.cache.filter(
    channel => channel.name === 'football-updates'
  );
  
  if (updateChannels.size > 0) {
    console.log('🎯 Found football-updates channel(s):');
    updateChannels.forEach(channel => {
      console.log(`   Channel ID: ${channel.id}`);
      console.log(`   In server: ${channel.guild.name}`);
      console.log('\n📝 Add this to your .env file:');
      console.log(`   NFL_UPDATES_CHANNEL_ID=${channel.id}`);
    });
  }
  
  client.destroy();
});

client.login(process.env.DISCORD_TOKEN);