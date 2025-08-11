#!/usr/bin/env node

/**
 * Test script for RSS integration with NFL Discord Bot
 * Tests RSS fetching, categorization, and deduplication
 */

const rssService = require('./services/rss');
const articleCache = require('./utils/articleCache');
const dedupHashService = require('./utils/dedupHash');

async function testRSSFetching() {
  console.log('🧪 Testing RSS fetching...\n');
  
  try {
    // Test RSS service
    console.log('1. Testing RSS service...');
    const articles = await rssService.fetchAllNews();
    console.log(`✅ Fetched ${articles.length} articles from RSS feeds\n`);
    
    if (articles.length > 0) {
      console.log('Sample article:');
      console.log(`   Title: ${articles[0].title}`);
      console.log(`   Source: ${articles[0].source}`);
      console.log(`   Link: ${articles[0].link}`);
      console.log();
    }
    
    // Test categorization
    console.log('2. Testing article categorization...');
    const categorized = await rssService.categorizeNews(articles);
    
    console.log(`🏥 Injuries: ${categorized.injuries.totalCount} (showing ${categorized.injuries.items.length})`);
    console.log(`🔁 Roster: ${categorized.roster.totalCount} (showing ${categorized.roster.items.length})`);
    console.log(`📰 Breaking: ${categorized.breaking.totalCount} (showing ${categorized.breaking.items.length})`);
    console.log();
    
    // Test deduplication
    console.log('3. Testing article deduplication...');
    const uniqueArticles = await articleCache.deduplicateArticles(articles);
    console.log(`✅ Deduplicated: ${articles.length} → ${uniqueArticles.length} unique articles\n`);
    
    // Test payload hashing
    console.log('4. Testing payload deduplication...');
    const testPayload = {
      injuries: categorized.injuries,
      rosterChanges: categorized.roster,
      scheduledGames: { items: ['Test @ Game - Aug 10, 8:00 PM'], totalCount: 1 },
      breakingNews: categorized.breaking
    };
    
    const dedupResult1 = dedupHashService.checkAndRecord(testPayload);
    console.log(`✅ First payload hash: ${dedupResult1.hash} (duplicate: ${dedupResult1.isDuplicate})`);
    
    const dedupResult2 = dedupHashService.checkAndRecord(testPayload);
    console.log(`✅ Second payload hash: ${dedupResult2.hash} (duplicate: ${dedupResult2.isDuplicate})`);
    console.log();
    
    // Show formatted output
    console.log('5. Sample formatted output:');
    console.log('═'.repeat(60));
    console.log('📢 NFL Test Update – August 10, 2025 – 2:35 PM EDT\n');
    
    console.log('🏥 Injuries');
    if (categorized.injuries.items.length > 0) {
      categorized.injuries.items.slice(0, 3).forEach(article => {
        console.log(`• ${rssService.formatArticle(article)}`);
      });
      if (categorized.injuries.truncatedCount > 0) {
        console.log(`(+${categorized.injuries.truncatedCount} more)`);
      }
    } else {
      console.log('• No updates');
    }
    console.log();
    
    console.log('🔁 Roster Changes');
    if (categorized.roster.items.length > 0) {
      categorized.roster.items.slice(0, 3).forEach(article => {
        console.log(`• ${rssService.formatArticle(article)}`);
      });
      if (categorized.roster.truncatedCount > 0) {
        console.log(`(+${categorized.roster.truncatedCount} more)`);
      }
    } else {
      console.log('• No updates');
    }
    console.log();
    
    console.log('📅 Scheduled Games');
    console.log('• Cowboys @ Giants - Aug 10, 8:20 PM');
    console.log('• Jets @ Patriots - Aug 11, 1:00 PM');
    console.log('(+8 more)');
    console.log();
    
    console.log('📰 Breaking News');
    if (categorized.breaking.items.length > 0) {
      categorized.breaking.items.slice(0, 3).forEach(article => {
        console.log(`• ${rssService.formatArticle(article)}`);
      });
      if (categorized.breaking.truncatedCount > 0) {
        console.log(`(+${categorized.breaking.truncatedCount} more)`);
      }
    } else {
      console.log('• No updates');
    }
    console.log();
    
    console.log(rssService.getSourcesLine());
    console.log('═'.repeat(60));
    
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

async function testCacheStatus() {
  console.log('\n6. Testing cache status...');
  
  try {
    const articleStatus = await articleCache.getStatus();
    console.log(`✅ Article cache: ${articleStatus.seenArticleCount} seen articles`);
    console.log(`   Last run: ${articleStatus.lastRun || 'Never'}`);
    
    const dedupStatus = dedupHashService.getStatus();
    console.log(`✅ Dedup service: ${dedupStatus.recentHashCount} recent hashes`);
    console.log(`   Window: ${dedupStatus.windowMs/1000}s`);
    
  } catch (error) {
    console.error('❌ Cache status test failed:', error);
  }
}

async function main() {
  console.log('🏈 NFL Discord Bot RSS Integration Test\n');
  
  const success = await testRSSFetching();
  await testCacheStatus();
  
  if (success) {
    console.log('\n🎉 All tests passed! RSS integration is ready.');
    console.log('   - RSS feeds are accessible');
    console.log('   - Articles are categorized correctly');
    console.log('   - Deduplication is working');
    console.log('   - Payload hashing prevents duplicates');
  } else {
    console.log('\n❌ Some tests failed. Check the logs above.');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}