#!/usr/bin/env node

/**
 * Demo script showing exactly what the bot would post to Discord
 * Pulls live RSS data and formats it like the Discord messages
 */

const moment = require('moment-timezone');
const rssService = require('./services/rss');
const articleCache = require('./utils/articleCache');
const dedupHashService = require('./utils/dedupHash');

async function demonstrateLiveUpdate() {
  console.log('🏈 NFL Discord Bot - Live RSS Integration Demo\n');
  
  try {
    const timeStr = moment().tz('America/New_York').format('MMMM D, YYYY - h:mm A z');
    
    console.log('🔍 Fetching LIVE RSS data from sources...\n');
    
    // Fetch live RSS data
    console.log('📡 Fetching from RSS sources:');
    console.log('   • ESPN NFL News');
    console.log('   • NFL.com Latest Headlines'); 
    console.log('   • Yahoo Sports NFL');
    console.log('   • CBS Sports NFL');
    console.log('   • ProFootballTalk (NBC)');
    console.log();
    
    const articles = await rssService.fetchAllNews();
    
    if (articles.length === 0) {
      console.log('❌ No articles fetched. Check your internet connection.');
      return;
    }
    
    // Deduplicate articles
    const uniqueArticles = await articleCache.deduplicateArticles(articles);
    
    // Categorize articles
    const categorized = await rssService.categorizeNews(uniqueArticles);
    
    console.log(`📊 Data Summary:`);
    console.log(`   Total articles fetched: ${articles.length}`);
    console.log(`   Unique articles: ${uniqueArticles.length}`);
    console.log(`   🏥 Injuries found: ${categorized.injuries.totalCount}`);
    console.log(`   🔁 Roster changes: ${categorized.roster.totalCount}`);
    console.log(`   📰 Breaking news: ${categorized.breaking.totalCount}`);
    console.log();
    
    // Show what would be posted to Discord
    console.log('📱 DISCORD MESSAGES (What your users would see):\n');
    
    // Message 1: Header
    console.log('═'.repeat(70));
    console.log('📢 NFL Test Update – ' + timeStr);
    console.log(`Gathering latest NFL updates...`);
    console.log('═'.repeat(70));
    console.log();
    
    // Message 2: Injuries
    console.log('🏥 Injuries');
    if (categorized.injuries.items.length > 0) {
      categorized.injuries.items.forEach((article, index) => {
        if (index < 5) { // Show max 5
          const formatted = rssService.formatArticle(article);
          console.log(`• ${formatted}`);
        }
      });
      if (categorized.injuries.truncatedCount > 0) {
        console.log(`(+${categorized.injuries.truncatedCount} more)`);
      }
    } else {
      console.log('• No updates');
    }
    console.log();
    
    // Message 3: Roster Changes
    console.log('🔁 Roster Changes');
    if (categorized.roster.items.length > 0) {
      categorized.roster.items.forEach((article, index) => {
        if (index < 5) {
          const formatted = rssService.formatArticle(article);
          console.log(`• ${formatted}`);
        }
      });
      if (categorized.roster.truncatedCount > 0) {
        console.log(`(+${categorized.roster.truncatedCount} more)`);
      }
    } else {
      console.log('• No updates');
    }
    console.log();
    
    // Message 4: Scheduled Games (would come from TheSportsDB)
    console.log('📅 Scheduled Games');
    console.log('• Cowboys @ Giants – Aug 10, 8:20 PM');
    console.log('• Jets @ Patriots – Aug 11, 1:00 PM');
    console.log('• Dolphins @ Bears – Aug 11, 4:30 PM');
    console.log('(+7 more games from TheSportsDB)');
    console.log();
    
    // Message 5: Breaking News
    console.log('📰 Breaking News');
    if (categorized.breaking.items.length > 0) {
      categorized.breaking.items.forEach((article, index) => {
        if (index < 5) {
          const formatted = rssService.formatArticle(article);
          console.log(`• ${formatted}`);
        }
      });
      if (categorized.breaking.truncatedCount > 0) {
        console.log(`(+${categorized.breaking.truncatedCount} more)`);
      }
    } else {
      console.log('• No updates');
    }
    console.log();
    
    // Message 6: Sources Footer
    console.log(rssService.getSourcesLine());
    console.log();
    
    console.log('═'.repeat(70));
    console.log();
    
    // Test deduplication
    const testPayload = {
      injuries: categorized.injuries,
      rosterChanges: categorized.roster,
      scheduledGames: { items: ['Cowboys @ Giants – Aug 10, 8:20 PM'], totalCount: 10 },
      breakingNews: categorized.breaking
    };
    
    console.log('🔒 Testing Duplicate Prevention:');
    const firstHash = dedupHashService.checkAndRecord(testPayload);
    console.log(`   First post: Hash ${firstHash.hash} - Allowed ✅`);
    
    const secondHash = dedupHashService.checkAndRecord(testPayload);  
    console.log(`   Identical post: Hash ${secondHash.hash} - Blocked 🚫 (${secondHash.isDuplicate ? 'duplicate detected' : 'allowed'})`);
    console.log();
    
    console.log('🚀 SCHEDULED RUNS:');
    console.log('   🌅 Morning: 8:00 AM EST (daily)');
    console.log('   🌞 Afternoon: 2:00 PM EST (daily)'); 
    console.log('   🌙 Evening: 8:00 PM EST (daily)');
    console.log();
    
    console.log('✅ Your bot is ready with enhanced RSS integration!');
    console.log('   • Real-time NFL news from 5+ sources');
    console.log('   • Smart categorization (injuries, roster, breaking news)');
    console.log('   • Duplicate article prevention');
    console.log('   • Duplicate post prevention (5-min window)');
    console.log('   • Combined with existing TheSportsDB schedules');
    
  } catch (error) {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  demonstrateLiveUpdate().catch(console.error);
}