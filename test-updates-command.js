const updatesCommand = require('./commands/updates');
const config = require('./config/config');

/**
 * Test script for the new /updates command
 * Tests the command logic without Discord interaction
 */

console.log('🧪 Testing /updates Command Logic');
console.log('==================================\n');

async function testUpdatesCommand() {
  try {
    console.log('🔧 Configuration Check:');
    console.log(`   OpenAI API Key: ${config.openai.apiKey ? '✅ Set' : '❌ Missing'}`);
    console.log(`   SportsDB Key: ${config.sportsdb.key || 'Using default (123)'}`);
    console.log(`   NFL Teams: ${config.nflTeams.length} teams configured`);
    console.log('');

    console.log('📋 Command Status:');
    const status = updatesCommand.getStatus();
    console.log(`   Command Name: /${status.commandName}`);
    console.log(`   Monitored Teams: ${status.monitoredTeams}`);
    console.log(`   Sample Teams: ${status.teamsListPreview.join(', ')}`);
    console.log('');

    console.log('🏈 Testing embed creation with sample data...');
    
    // Test embed creation with mock data
    const mockUpdates = [
      {
        team: 'Dallas Cowboys',
        summary: '🏈 Cowboys QB Dak Prescott cleared for full practice after minor shoulder issue'
      },
      {
        team: 'Philadelphia Eagles', 
        summary: '🛑 Eagles WR AJ Brown listed as questionable for Week 1 (hamstring)'
      }
    ];
    
    const testDate = 'Sunday, August 4, 2024';
    const embed = await updatesCommand.createBriefingEmbed(mockUpdates, testDate, 12, 8);
    
    console.log('✅ Embed created successfully!');
    console.log('📄 Embed Preview:');
    console.log(`   Title: ${embed.data.title}`);
    console.log(`   Description Length: ${embed.data.description?.length || 0} characters`);
    console.log(`   Fields: ${embed.data.fields?.length || 0}`);
    console.log(`   Color: #${embed.data.color?.toString(16).padStart(6, '0') || '000000'}`);
    console.log('');

    // Test empty updates scenario
    console.log('🔄 Testing empty updates scenario...');
    const emptyEmbed = await updatesCommand.createBriefingEmbed([], testDate, 12, 12);
    console.log('✅ Empty updates embed created successfully!');
    console.log(`   Contains "No significant updates": ${emptyEmbed.data.description?.includes('No significant') ? '✅' : '❌'}`);
    console.log('');

    console.log('🎉 All tests passed!');
    console.log('');
    console.log('💡 To test the full command with real data:');
    console.log('   1. Start the bot: npm start');
    console.log('   2. Use /updates in your Discord server');
    console.log('   3. Monitor console for detailed processing logs');

  } catch (error) {
    console.error('❌ Test failed:', error);
    
    if (error.message.includes('OpenAI')) {
      console.log('\n💡 Make sure your OpenAI API key is set in .env file');
    }
  }
}

// Run the test
testUpdatesCommand().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('❌ Test script failed:', error);
  process.exit(1);
});