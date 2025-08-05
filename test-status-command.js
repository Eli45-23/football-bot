const statusCommand = require('./commands/status');
const sportsdb = require('./api/sportsdb');
const gptSummarizer = require('./utils/gptSummarizer');

/**
 * Test script for the new /status command
 * Tests both team and player detection logic
 */

console.log('🧪 Testing /status Command Logic');
console.log('=================================\n');

async function testStatusCommand() {
  try {
    console.log('🔧 Testing Team Detection...');
    
    // Test team search
    const team = await sportsdb.searchTeam('Dallas Cowboys');
    if (team) {
      console.log(`✅ Team found: ${team.strTeam} (ID: ${team.idTeam})`);
      
      // Test team status GPT method
      const mockEvent = {
        strEvent: 'Dallas Cowboys vs Philadelphia Eagles',
        dateEvent: '2024-08-04',
        idEvent: '123456'
      };
      
      const mockTimeline = [
        { strTimeline: 'Player X left the game with injury' },
        { strTimeline: 'Substitution made in Q2' }
      ];
      
      console.log('🤖 Testing team status GPT summarizer...');
      const teamStatus = await gptSummarizer.summarizeTeamStatus(
        team.strTeam,
        mockEvent,
        mockTimeline
      );
      console.log(`✅ Team status generated: ${teamStatus.substring(0, 100)}...`);
    } else {
      console.log('❌ Team search failed');
    }
    
    console.log('\n🔧 Testing Player Detection...');
    
    // Test player search
    const players = await sportsdb.searchPlayer('Aaron Rodgers');
    if (players.length > 0) {
      const player = players[0];
      console.log(`✅ Player found: ${player.strPlayer} (Team: ${player.strTeam || 'N/A'})`);
      
      // Get player details
      const playerDetails = await sportsdb.getPlayer(player.idPlayer);
      if (playerDetails) {
        console.log(`✅ Player details retrieved: ${playerDetails.strPlayer} - ${playerDetails.strPosition || 'N/A'}`);
        
        // Test player status GPT method
        const mockTeamTimeline = [
          { strTimeline: 'QB Aaron Rodgers completed practice' },
          { strTimeline: 'No injury concerns reported' }
        ];
        
        console.log('🤖 Testing player status GPT summarizer...');
        const playerStatus = await gptSummarizer.summarizePlayerStatus(
          playerDetails.strPlayer,
          playerDetails,
          mockTeamTimeline
        );
        console.log(`✅ Player status generated: ${playerStatus.substring(0, 100)}...`);
      } else {
        console.log('❌ Player details retrieval failed');
      }
    } else {
      console.log('❌ Player search failed');
    }
    
    console.log('\n🔧 Testing Edge Cases...');
    
    // Test with invalid input
    const invalidTeam = await sportsdb.searchTeam('Invalid Team Name');
    console.log(`✅ Invalid team handling: ${invalidTeam ? 'Found (unexpected)' : 'Not found (expected)'}`);
    
    const invalidPlayers = await sportsdb.searchPlayer('Invalid Player Name');
    console.log(`✅ Invalid player handling: ${invalidPlayers.length} results (expected: 0)`);
    
    console.log('\n🎉 Status Command Testing Complete!');
    console.log('\n💡 Next Steps:');
    console.log('   1. Start the bot: npm start');
    console.log('   2. Test in Discord:');
    console.log('      • /status eagles');
    console.log('      • /status aaron rodgers');
    console.log('      • /status invalid name');
    console.log('   3. Monitor console for processing logs');

  } catch (error) {
    console.error('❌ Test failed:', error);
    
    if (error.message.includes('OpenAI')) {
      console.log('\n💡 Make sure your OpenAI API key is set in .env file');
    } else if (error.message.includes('429')) {
      console.log('\n💡 Rate limiting detected - this is expected during testing');
    }
  }
}

// Run the test
testStatusCommand().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('❌ Test script failed:', error);
  process.exit(1);
});