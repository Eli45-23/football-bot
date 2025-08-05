const { Client, GatewayIntentBits } = require('discord.js');
const DailyUpdater = require('./utils/dailyUpdater');
const config = require('./config/config');

/**
 * Test Script for Daily NFL Updates
 * Allows testing the daily update functionality without waiting for cron schedule
 */

console.log('🧪 NFL Daily Update Test Script');
console.log('================================\n');

// Create a minimal Discord client for testing
const testClient = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const updater = new DailyUpdater(testClient);

async function runTest() {
  try {
    console.log('🔧 Configuration Check:');
    console.log(`   OpenAI API Key: ${config.openai.apiKey ? '✅ Set' : '❌ Missing'}`);
    console.log(`   SportsDB Key: ${config.sportsdb.key || 'Using default (123)'}`);
    console.log(`   NFL Teams: ${config.nflTeams.length} teams configured`);
    console.log(`   Discord Channel: ${config.discord.nflUpdatesChannelId || '⚠️  Not set (will log to console)'}\n`);

    console.log('🏈 Testing with sample teams:');
    const testTeams = config.nflTeams.slice(0, 3); // Test with first 3 teams
    testTeams.forEach(team => console.log(`   • ${team}`));
    console.log('');

    // Override config for testing
    const originalTeams = config.nflTeams;
    config.nflTeams = testTeams;

    console.log('🚀 Starting test update...\n');
    
    await updater.testUpdate();

    // Restore original config
    config.nflTeams = originalTeams;

    console.log('\n✅ Test completed successfully!');
    console.log('\nTo run full daily update with all teams:');
    console.log('   npm start -- --test-update');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    
    if (error.message.includes('API key')) {
      console.log('\n💡 Make sure your API keys are set in .env file');
    } else if (error.message.includes('network') || error.message.includes('fetch')) {
      console.log('\n💡 Check your internet connection and API endpoints');
    }
  } finally {
    process.exit(0);
  }
}

// Run the test
runTest();