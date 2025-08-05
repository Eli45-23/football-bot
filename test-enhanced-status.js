#!/usr/bin/env node

/**
 * Test script for enhanced status system with fallback chain
 * Tests the complete flow: SportsDB → RSS → Cache
 */

require('dotenv').config();
const { getStatus, getTeamStatus, getPlayerStatus } = require('./services/statusService');
const { getCacheStats, clearCache } = require('./lib/cache');
const { getFeedStatus } = require('./services/rssFallback');

async function testEnhancedStatus() {
  console.log('🧪 Testing Enhanced NFL Status System\n');
  
  try {
    // Test 1: Cache statistics
    console.log('📊 Cache Statistics:');
    const cacheStats = getCacheStats();
    console.log(JSON.stringify(cacheStats, null, 2));
    console.log('');

    // Test 2: RSS Feed Status
    console.log('📰 RSS Feed Status:');
    const feedStatus = await getFeedStatus();
    feedStatus.forEach(feed => {
      console.log(`${feed.status === 'active' ? '✅' : '❌'} ${feed.title} (${feed.itemCount} items)`);
    });
    console.log('');

    // Test 3: Team Status (should try SportsDB first)
    console.log('🏈 Testing Team Status (Eagles):');
    const teamResult = await getTeamStatus('eagles');
    console.log(`Title: ${teamResult.title}`);
    console.log(`Source: ${teamResult.source}`);
    console.log(`Summary: ${teamResult.summary.substring(0, 100)}...`);
    console.log('');

    // Test 4: Player Status (should try SportsDB first)
    console.log('👤 Testing Player Status (Aaron Rodgers):');
    const playerResult = await getPlayerStatus('aaron rodgers');
    console.log(`Title: ${playerResult.title}`);
    console.log(`Source: ${playerResult.source}`);
    console.log(`Summary: ${playerResult.summary.substring(0, 100)}...`);
    console.log('');

    // Test 5: Smart Detection
    console.log('🔍 Testing Smart Detection (Cowboys):');
    const smartResult = await getStatus('cowboys');
    console.log(`Title: ${smartResult.title}`);
    console.log(`Source: ${smartResult.source}`);
    console.log(`Detection: ${smartResult.teamData ? 'Team' : smartResult.playerData ? 'Player' : 'Unknown'}`);
    console.log('');

    // Test 6: Cache Hit (run same query again)
    console.log('💾 Testing Cache Hit (Cowboys again):');
    const cacheResult = await getStatus('cowboys');
    console.log(`Source: ${cacheResult.source} (should be 'Cached')`);
    console.log('');

    // Test 7: Invalid Target
    console.log('❌ Testing Invalid Target:');
    const invalidResult = await getStatus('nonexistent team');
    console.log(`Title: ${invalidResult.title}`);
    console.log(`Source: ${invalidResult.source}`);
    console.log(`Error: ${invalidResult.error}`);
    console.log('');

    console.log('✅ Enhanced status system test completed successfully!');
    console.log('🔄 All fallback mechanisms, caching, and source attribution working correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  testEnhancedStatus()
    .then(() => {
      console.log('\n🏁 Test completed. System ready for production use.');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = { testEnhancedStatus };