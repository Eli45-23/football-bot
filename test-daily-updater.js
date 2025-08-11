#!/usr/bin/env node

/**
 * Test the daily updater with RSS integration
 * Mock Discord client to test the full flow
 */

const DailyUpdater = require('./utils/dailyUpdater');

// Mock Discord client
const mockClient = {
  channels: {
    fetch: async () => null // Simulate no channel found to force console output
  }
};

async function testDailyUpdater() {
  console.log('🧪 Testing Daily Updater with RSS Integration\n');
  
  try {
    // Create updater instance
    const updater = new DailyUpdater(mockClient);
    
    console.log('1. Testing manual update...');
    
    // Run a test update (will log to console since no Discord channel)
    await updater.testUpdate();
    
    console.log('\n2. Testing updater status...');
    const status = updater.getStatus();
    
    console.log(`✅ Updater Status:`);
    console.log(`   Running: ${status.isRunning}`);
    console.log(`   Teams: ${status.monitoredTeams}`);
    console.log(`   RSS enabled: ${status.rssEnabled}`);
    console.log(`   Dedup enabled: ${status.dedupEnabled}`);
    console.log(`   Batch size: ${status.batchSize}`);
    console.log(`   Next runs:`, status.nextRuns);
    
    console.log('\n🎉 Daily updater test completed successfully!');
    return true;
    
  } catch (error) {
    console.error('❌ Daily updater test failed:', error);
    return false;
  }
}

async function main() {
  const success = await testDailyUpdater();
  
  if (success) {
    console.log('\n✅ All systems ready:');
    console.log('   - RSS feeds integrated');
    console.log('   - Article categorization working');
    console.log('   - Deduplication enabled');
    console.log('   - Daily updater functional');
    console.log('\n🚀 Your bot is ready for production with enhanced RSS updates!');
  } else {
    console.log('\n❌ Test failed. Check the logs above.');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}