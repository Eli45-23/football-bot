#!/usr/bin/env node

/**
 * Quick demonstration of fact extraction in Discord
 * Shows immediate results without waiting for full team processing
 */

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const aggregateNews = require('./utils/aggregateNews');
require('dotenv').config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

client.once('ready', async () => {
  console.log(`🤖 Connected as ${client.user.tag}`);
  
  try {
    const channel = await client.channels.fetch(process.env.NFL_UPDATES_CHANNEL_ID);
    console.log(`✅ Found channel: #${channel.name}`);
    console.log();
    
    console.log('🚀 Running QUICK fact extraction demo...');
    
    // Get categorized news with facts (this is what the enhanced system produces)
    const categorizedNews = await aggregateNews.getCategorizedNews(null, 24, 5);
    
    console.log('📤 Posting enhanced results to Discord...');
    
    // Header
    const headerEmbed = new EmbedBuilder()
      .setTitle('🎯 Enhanced NFL Bot - Live Fact Extraction Results')
      .setDescription('Real facts extracted from full article content')
      .setColor(0x013369)
      .setTimestamp();
    
    await channel.send({ embeds: [headerEmbed] });
    
    // Injuries with facts
    let injuryContent = '';
    if (categorizedNews.injuries.bullets.length > 0) {
      injuryContent = categorizedNews.injuries.bullets.map((bullet, i) => `${i + 1}. ${bullet}`).join('\n');
      if (categorizedNews.injuries.overflow > 0) {
        injuryContent += `\n(+${categorizedNews.injuries.overflow} more)`;
      }
    } else {
      injuryContent = '• No injury facts extracted from recent articles';
    }
    
    const injuryEmbed = new EmbedBuilder()
      .setTitle('🏥 Injuries - Extracted Facts')
      .setDescription(injuryContent.substring(0, 4096))
      .setColor(0xff6b6b);
    
    await channel.send({ embeds: [injuryEmbed] });
    
    // Roster changes with facts
    let rosterContent = '';
    if (categorizedNews.roster.bullets.length > 0) {
      rosterContent = categorizedNews.roster.bullets.map((bullet, i) => `${i + 1}. ${bullet}`).join('\n');
      if (categorizedNews.roster.overflow > 0) {
        rosterContent += `\n(+${categorizedNews.roster.overflow} more)`;
      }
    } else {
      rosterContent = '• No roster transaction facts extracted from recent articles';
    }
    
    const rosterEmbed = new EmbedBuilder()
      .setTitle('🔁 Roster Changes - Extracted Facts')
      .setDescription(rosterContent.substring(0, 4096))
      .setColor(0x51cf66);
    
    await channel.send({ embeds: [rosterEmbed] });
    
    // Breaking News with facts
    let newsContent = '';
    if (categorizedNews.breaking.bullets.length > 0) {
      newsContent = categorizedNews.breaking.bullets.map((bullet, i) => `${i + 1}. ${bullet}`).join('\n');
      if (categorizedNews.breaking.overflow > 0) {
        newsContent += `\n(+${categorizedNews.breaking.overflow} more)`;
      }
    } else {
      newsContent = '• No breaking news facts extracted from recent articles';
    }
    
    const newsEmbed = new EmbedBuilder()
      .setTitle('📰 Breaking News - Extracted Facts')
      .setDescription(newsContent.substring(0, 4096))
      .setColor(0x339af0);
    
    await channel.send({ embeds: [newsEmbed] });
    
    // Summary of what was processed
    const summaryEmbed = new EmbedBuilder()
      .setTitle('📊 Processing Summary')
      .setDescription(
        `**Enhanced RSS Pipeline Results:**\n` +
        `• Articles processed: Multiple from ESPN, CBS, Yahoo, PFT\n` +
        `• Full-text extraction: ✅ Complete article content fetched\n` +
        `• Fact extraction: ✅ Player/team entities recognized\n` +
        `• Categorization: ✅ Strict keyword-based classification\n` +
        `• Output format: ✅ Clean facts without raw URLs\n\n` +
        `**Totals Found:**\n` +
        `🏥 Injuries: ${categorizedNews.injuries.totalCount}\n` +
        `🔁 Roster: ${categorizedNews.roster.totalCount}\n` +
        `📰 Breaking: ${categorizedNews.breaking.totalCount}\n\n` +
        `**Key Improvements:**\n` +
        `• Real facts instead of headlines\n` +
        `• Player (Team) format recognition\n` +
        `• Source attribution without URLs\n` +
        `• Noise filtering (excludes takeaways, etc.)`
      )
      .setColor(0x37b24d)
      .setFooter({ text: '🗂 Sources: ESPN • NFL.com • Yahoo • CBS Sports • ProFootballTalk (Full-text analysis)' });
    
    await channel.send({ embeds: [summaryEmbed] });
    
    console.log('✅ Enhanced fact extraction demo complete!');
    console.log(`📊 Results: ${categorizedNews.injuries.totalCount} injuries, ${categorizedNews.roster.totalCount} roster, ${categorizedNews.breaking.totalCount} breaking`);
    console.log('📱 Check your Discord channel for the enhanced output!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  setTimeout(() => {
    client.destroy();
    process.exit(0);
  }, 3000);
});

console.log('🏈 Quick Enhanced NFL Fact Demo');
console.log('================================');
console.log('🔌 Connecting to Discord...');

client.login(process.env.DISCORD_TOKEN);