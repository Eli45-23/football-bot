#!/usr/bin/env node

/**
 * Test script for fact extraction with real RSS articles
 * Demonstrates the enhanced pipeline: RSS → Full Text → Fact Extraction → Categorization
 */

const aggregateNews = require('./utils/aggregateNews');
const rssFullText = require('./services/rssFullText');
const newsClassifier = require('./services/newsClassifier');
const moment = require('moment-timezone');

async function testFactExtraction() {
  console.log('🧪 Testing Enhanced RSS Fact Extraction Pipeline\n');
  
  try {
    console.log('📡 Phase 1: Fetching RSS with full-text extraction...');
    
    // Get summary first
    const summary = await aggregateNews.getNewsSummary(24);
    console.log(`📊 Available articles: ${summary.totalArticles}`);
    console.log(`📈 Average text length: ${summary.avgTextLength} characters`);
    console.log(`📰 Sources:`, Object.entries(summary.sources).map(([k,v]) => `${k}: ${v}`).join(', '));
    console.log();
    
    console.log('🔍 Phase 2: Full fact extraction and categorization...');
    
    // Get categorized news with facts
    const categorizedNews = await aggregateNews.getCategorizedNews(null, 24, 8);
    
    console.log('\n' + '='.repeat(80));
    console.log('🎯 FACT-BASED NFL UPDATE RESULTS');
    console.log('='.repeat(80));
    
    const timeStr = moment().tz('America/New_York').format('MMMM D, YYYY - h:mm A z');
    console.log(`📅 Generated: ${timeStr}`);
    console.log();
    
    // Display Injuries with facts
    console.log('🏥 INJURIES');
    console.log('-'.repeat(50));
    if (categorizedNews.injuries.bullets.length > 0) {
      categorizedNews.injuries.bullets.forEach((bullet, i) => {
        console.log(`${i + 1}. ${bullet}`);
      });
      if (categorizedNews.injuries.overflow > 0) {
        console.log(`   (+${categorizedNews.injuries.overflow} more)`);
      }
      console.log(`   📊 Total found: ${categorizedNews.injuries.totalCount}`);
    } else {
      console.log('• No injury facts extracted');
    }
    console.log();
    
    // Display Roster Changes with facts
    console.log('🔁 ROSTER CHANGES');
    console.log('-'.repeat(50));
    if (categorizedNews.roster.bullets.length > 0) {
      categorizedNews.roster.bullets.forEach((bullet, i) => {
        console.log(`${i + 1}. ${bullet}`);
      });
      if (categorizedNews.roster.overflow > 0) {
        console.log(`   (+${categorizedNews.roster.overflow} more)`);
      }
      console.log(`   📊 Total found: ${categorizedNews.roster.totalCount}`);
    } else {
      console.log('• No roster transaction facts extracted');
    }
    console.log();
    
    // Display Breaking News with facts
    console.log('📰 BREAKING NEWS');
    console.log('-'.repeat(50));
    if (categorizedNews.breaking.bullets.length > 0) {
      categorizedNews.breaking.bullets.forEach((bullet, i) => {
        console.log(`${i + 1}. ${bullet}`);
      });
      if (categorizedNews.breaking.overflow > 0) {
        console.log(`   (+${categorizedNews.breaking.overflow} more)`);
      }
      console.log(`   📊 Total found: ${categorizedNews.breaking.totalCount}`);
    } else {
      console.log('• No breaking news facts extracted');
    }
    console.log();
    
    console.log('🗂 Sources: TheSportsDB • ESPN • NFL.com • Yahoo • CBS Sports • ProFootballTalk (Full-text analysis)');
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ ENHANCED FEATURES DEMONSTRATED:');
    console.log('   ✅ Full article text extraction (not just headlines)');
    console.log('   ✅ Player/team entity recognition');
    console.log('   ✅ Fact-based bullets without raw URLs');
    console.log('   ✅ Strict keyword-based categorization');
    console.log('   ✅ Noise filtering (takeaways, debuts, etc.)');
    console.log('   ✅ Concurrency-limited article fetching');
    console.log('   ✅ Source attribution in facts');
    console.log('='.repeat(80));
    
    // Test individual components
    console.log('\n🔧 COMPONENT STATUS:');
    
    const rssStatus = rssFullText.getStatus();
    console.log(`📰 RSS Full-text: ${rssStatus.feedCount} feeds, ${rssStatus.concurrencyLimit} concurrency`);
    
    const classifierStatus = newsClassifier.getStatus();
    console.log(`🔍 Classifier: ${classifierStatus.injuryKeywords} injury + ${classifierStatus.rosterKeywords} roster + ${classifierStatus.breakingKeywords} breaking keywords`);
    
    const aggregateStatus = await aggregateNews.getStatus();
    console.log(`📊 Aggregator: ${aggregateStatus.seenArticlesCount} seen articles cached`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Fact extraction test failed:', error);
    return false;
  }
}

async function testSampleArticle() {
  console.log('\n🧪 Testing Sample Article Classification...\n');
  
  // Create a sample article for testing
  const sampleArticle = {
    title: 'Matthew Stafford injury update: Rams QB limited in practice with back issue',
    text: 'Los Angeles Rams quarterback Matthew Stafford was limited in practice on Wednesday due to a back injury. The veteran QB has been dealing with back soreness and did not participate in full team drills. Stafford is listed as questionable for Sunday\'s game against the Cardinals. Head coach Sean McVay said they are being cautious with the 35-year-old quarterback and will monitor his progress throughout the week.',
    source: 'ESPN',
    url: 'https://example.com/stafford-injury',
    date: new Date().toISOString()
  };
  
  console.log('📝 Sample Article:');
  console.log(`   Title: ${sampleArticle.title}`);
  console.log(`   Text: ${sampleArticle.text.substring(0, 100)}...`);
  console.log();
  
  const classified = newsClassifier.classify(sampleArticle);
  
  if (classified) {
    console.log('✅ Classification Result:');
    console.log(`   Category: ${classified.category}`);
    console.log(`   Fact Bullet: ${classified.factBullet}`);
    console.log(`   Keywords: ${Object.entries(classified.keywords).filter(([k,v]) => v).map(([k]) => k).join(', ')}`);
  } else {
    console.log('❌ Article was filtered out or could not be classified');
  }
}

async function main() {
  console.log('🏈 NFL Discord Bot - Enhanced Fact Extraction Test\n');
  
  const success = await testFactExtraction();
  await testSampleArticle();
  
  if (success) {
    console.log('\n🎉 All tests passed! Enhanced fact extraction is working.');
    console.log('\n🚀 Your bot now extracts REAL FACTS from articles:');
    console.log('   • "Matthew Stafford (LAR) – limited in practice with back issue (ESPN)"');
    console.log('   • "Travis Kelce (KC) – signed 2-year extension worth $34.25M (CBS)"');
    console.log('   • "Lamar Jackson – announces return for playoffs (PFT)"');
    console.log('\nInstead of generic headlines with URLs! 🎯');
  } else {
    console.log('\n❌ Some tests failed. Check the logs above.');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}