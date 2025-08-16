require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

/**
 * Helper script to list all available Discord channels
 * This helps identify the correct channel ID for NFL_UPDATES_CHANNEL_ID
 */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`🤖 Bot ID: ${client.user.id}`);
  console.log('\n📋 Available Channels:\n');
  console.log('=' .repeat(80));
  
  // List all guilds (servers) the bot is in
  client.guilds.cache.forEach(guild => {
    console.log(`\n🏠 Server: ${guild.name} (ID: ${guild.id})`);
    console.log('-'.repeat(60));
    
    // List all text channels in this guild
    const textChannels = guild.channels.cache
      .filter(channel => channel.type === 0) // Type 0 = text channel
      .sort((a, b) => a.position - b.position);
    
    if (textChannels.size === 0) {
      console.log('  No text channels found');
    } else {
      textChannels.forEach(channel => {
        const canSend = channel.permissionsFor(guild.members.me).has('SendMessages');
        const emoji = canSend ? '✅' : '❌';
        console.log(`  ${emoji} #${channel.name.padEnd(25)} ID: ${channel.id}`);
      });
    }
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('\n💡 To use a channel for updates:');
  console.log('   1. Copy the channel ID from above');
  console.log('   2. Update NFL_UPDATES_CHANNEL_ID in your .env file');
  console.log('   3. Update the same in Render environment variables');
  console.log('\n⚠️  Current NFL_UPDATES_CHANNEL_ID:', process.env.NFL_UPDATES_CHANNEL_ID);
  
  const currentId = process.env.NFL_UPDATES_CHANNEL_ID;
  if (currentId === client.user.id) {
    console.log('❌ ERROR: NFL_UPDATES_CHANNEL_ID is set to the bot\'s user ID!');
    console.log('   This needs to be a channel ID, not the bot ID.');
  }
  
  // Disconnect after listing
  await client.destroy();
  process.exit(0);
});

// Handle errors
client.on('error', error => {
  console.error('❌ Discord client error:', error);
  process.exit(1);
});

// Login
console.log('🔄 Connecting to Discord...');
client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error('❌ Failed to login:', error.message);
  process.exit(1);
});