#!/usr/bin/env node

/**
 * Live Discord Test - Posts the enhanced RSS pipeline results to your Discord channel
 * 
 * USAGE:
 *   1. Make sure your .env file has:
 *      - DISCORD_TOKEN=your_bot_token
 *      - NFL_UPDATES_CHANNEL_ID=your_channel_id
 *   
 *   2. Run: node test-discord-live.js
 */

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const DailyUpdater = require('./utils/dailyUpdater');

// Check environment variables
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN not found in .env file');
  console.log('Please add: DISCORD_TOKEN=your_bot_token');
  process.exit(1);
}

if (!process.env.NFL_UPDATES_CHANNEL_ID) {
  console.error('❌ NFL_UPDATES_CHANNEL_ID not found in .env file');
  console.log('Please add: NFL_UPDATES_CHANNEL_ID=your_channel_id');
  process.exit(1);
}

console.log('🚀 Starting Discord live test with enhanced RSS pipeline...');
console.log(`📢 Will post to channel: ${process.env.NFL_UPDATES_CHANNEL_ID}`);

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

// When Discord is ready
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  
  try {
    // Get the channel
    const channel = await client.channels.fetch(process.env.NFL_UPDATES_CHANNEL_ID);
    if (!channel) {
      console.error('❌ Could not find channel with ID:', process.env.NFL_UPDATES_CHANNEL_ID);
      process.exit(1);
    }
    
    console.log(`📢 Found channel: #${channel.name}`);
    console.log('📡 Collecting RSS data with enhanced pipeline...');
    
    // Create updater and collect RSS data only
    const updater = new DailyUpdater(client);
    const rssData = await updater.collectRSSData();
    
    // Format the data
    const formattedData = {
      injuries: updater.formatCategory(rssData.injuries, []),
      rosterChanges: updater.formatCategory(rssData.roster, []),
      breakingNews: updater.formatCategory(rssData.breaking, []),
      scheduledGames: { items: [], totalCount: 0, truncatedCount: 0, source: 'TheSportsDB' },
      sourcesLine: '🗂 Sources: ESPN • ProFootballRumors • Yahoo • CBS • PFT (Enhanced RSS Pipeline)',
      fallbacksUsed: rssData.fallbacksUsed || []
    };
    
    console.log('📤 Posting to Discord...');
    
    // 1. Header Embed
    const headerEmbed = new EmbedBuilder()
      .setTitle('🧪 NFL Enhanced RSS Pipeline Test')
      .setDescription('Testing the new full-text extraction system with rule-based categorization')
      .setColor(0x00ff00)
      .setTimestamp();
    
    await channel.send({ embeds: [headerEmbed] });
    await sleep(1000);
    
    // 2. Injuries Embed
    let injuryContent = '';
    if (formattedData.injuries.items && formattedData.injuries.items.length > 0) {
      injuryContent = formattedData.injuries.items.map(item => `• ${item}`).join('\n');
      if (formattedData.injuries.truncatedCount > 0) {
        injuryContent += `\n(+${formattedData.injuries.truncatedCount} more)`;
      }
    } else {
      injuryContent = '• No injury updates';
    }
    
    const injuryEmbed = new EmbedBuilder()
      .setTitle('🏥 Injuries')
      .setDescription(injuryContent.substring(0, 4096))
      .setColor(0x013369)
      .setFooter({ text: `Source: ${formattedData.injuries.source || 'ESPN'}` });
    
    await channel.send({ embeds: [injuryEmbed] });
    await sleep(1000);
    
    // 3. Roster Changes Embed
    let rosterContent = '';
    if (formattedData.rosterChanges.items && formattedData.rosterChanges.items.length > 0) {
      rosterContent = formattedData.rosterChanges.items.map(item => `• ${item}`).join('\n');
      if (formattedData.rosterChanges.truncatedCount > 0) {
        rosterContent += `\n(+${formattedData.rosterChanges.truncatedCount} more)`;
      }
    } else {
      rosterContent = '• No roster updates';
    }
    
    const rosterEmbed = new EmbedBuilder()
      .setTitle('🔁 Roster Changes')
      .setDescription(rosterContent.substring(0, 4096))
      .setColor(0x013369)
      .setFooter({ text: `Source: ${formattedData.rosterChanges.source || 'PFR'}` });
    
    await channel.send({ embeds: [rosterEmbed] });
    await sleep(1000);
    
    // 4. Breaking News Embed
    let newsContent = '';
    if (formattedData.breakingNews.items && formattedData.breakingNews.items.length > 0) {
      newsContent = formattedData.breakingNews.items.map(item => `• ${item}`).join('\n');
      if (formattedData.breakingNews.truncatedCount > 0) {
        newsContent += `\n(+${formattedData.breakingNews.truncatedCount} more)`;
      }
    } else {
      newsContent = '• No breaking news updates';
    }
    
    const newsEmbed = new EmbedBuilder()
      .setTitle('📰 Breaking News')
      .setDescription(newsContent.substring(0, 4096))
      .setColor(0x013369)
      .setFooter({ text: `Source: ${formattedData.breakingNews.source || 'RSS'}` });
    
    await channel.send({ embeds: [newsEmbed] });
    await sleep(1000);
    
    // 5. Footer with Sources
    let footerDesc = formattedData.sourcesLine;
    if (formattedData.fallbacksUsed && formattedData.fallbacksUsed.length > 0) {
      footerDesc += `\n🔄 Fallbacks used: ${formattedData.fallbacksUsed.join(', ')}`;
    }
    
    const footerEmbed = new EmbedBuilder()
      .setDescription(footerDesc)
      .setColor(0x666666)
      .setFooter({ text: 'Enhanced RSS Pipeline - No GPT Required' })
      .setTimestamp();
    
    await channel.send({ embeds: [footerEmbed] });
    
    console.log('✅ Successfully posted to Discord!');
    console.log(`📢 Check #${channel.name} to see the results`);
    
    // Disconnect after a short delay
    setTimeout(() => {
      client.destroy();
      process.exit(0);
    }, 2000);
    
  } catch (error) {
    console.error('❌ Error:', error);
    client.destroy();
    process.exit(1);
  }
});

// Helper function for delays
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Login to Discord
console.log('🔐 Logging into Discord...');
client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error('❌ Failed to login:', error.message);
  console.log('Please check your DISCORD_TOKEN in the .env file');
  process.exit(1);
});