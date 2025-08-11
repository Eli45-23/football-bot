#!/usr/bin/env node

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const rssService = require('./services/rss');
const articleCache = require('./utils/articleCache');
require('dotenv').config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

client.once('ready', async () => {
  console.log(`✅ Connected as ${client.user.tag}`);
  
  try {
    const channel = await client.channels.fetch(process.env.NFL_UPDATES_CHANNEL_ID);
    console.log(`📡 Found channel: #${channel.name}`);
    
    console.log('📰 Fetching live RSS data...');
    const articles = await rssService.fetchAllNews();
    const uniqueArticles = await articleCache.deduplicateArticles(articles);
    const categorized = await rssService.categorizeNews(uniqueArticles);
    
    console.log('📤 Posting RSS demo to Discord...');
    
    // Header
    const headerEmbed = new EmbedBuilder()
      .setTitle('📢 NFL RSS Integration Demo')
      .setDescription(`Live data from ${articles.length} articles (${uniqueArticles.length} unique)`)
      .setColor(0x013369)
      .setTimestamp();
    
    await channel.send({ embeds: [headerEmbed] });
    
    // Injuries
    let injuryContent = '';
    if (categorized.injuries.items.length > 0) {
      const top5 = categorized.injuries.items.slice(0, 5);
      injuryContent = top5.map(article => `• ${rssService.formatArticle(article)}`).join('\n');
      if (categorized.injuries.truncatedCount > 0) {
        injuryContent += `\n(+${categorized.injuries.truncatedCount} more)`;
      }
    } else {
      injuryContent = '• No updates';
    }
    
    const injuryEmbed = new EmbedBuilder()
      .setTitle('🏥 Injuries')
      .setDescription(injuryContent.substring(0, 4096))
      .setColor(0x013369);
    
    await channel.send({ embeds: [injuryEmbed] });
    
    // Breaking News
    let newsContent = '';
    if (categorized.breaking.items.length > 0) {
      const top5 = categorized.breaking.items.slice(0, 5);
      newsContent = top5.map(article => `• ${rssService.formatArticle(article)}`).join('\n');
      if (categorized.breaking.truncatedCount > 0) {
        newsContent += `\n(+${categorized.breaking.truncatedCount} more)`;
      }
    } else {
      newsContent = '• No updates';
    }
    
    const newsEmbed = new EmbedBuilder()
      .setTitle('📰 Breaking News')
      .setDescription(newsContent.substring(0, 4096))
      .setColor(0x013369);
    
    await channel.send({ embeds: [newsEmbed] });
    
    // Sources
    const sourcesEmbed = new EmbedBuilder()
      .setDescription(rssService.getSourcesLine())
      .setColor(0x666666)
      .setTimestamp();
    
    await channel.send({ embeds: [sourcesEmbed] });
    
    console.log('✅ RSS demo posted to Discord!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  setTimeout(() => {
    client.destroy();
    process.exit(0);
  }, 2000);
});

console.log('🔌 Starting quick RSS demo...');
client.login(process.env.DISCORD_TOKEN);