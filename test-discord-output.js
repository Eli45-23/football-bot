require('dotenv').config();
const DailyUpdater = require('./utils/dailyUpdater');
const moment = require('moment-timezone');

/**
 * Test script to simulate a full Discord update with GPT enhancement
 * Shows exactly how the output would look in Discord
 */
async function testDiscordOutput() {
  console.log('🚀 Running Full Discord Output Test with GPT Enhancement\n');
  console.log('='.repeat(70));
  console.log('This test will show exactly how the output appears in Discord');
  console.log('='.repeat(70));
  
  // Create mock Discord client
  const mockClient = {
    channels: {
      fetch: async (channelId) => {
        return {
          name: 'nfl-updates',
          send: async ({ embeds }) => {
            // Simulate Discord embed display
            if (embeds && embeds[0]) {
              const embed = embeds[0];
              console.log('\n' + '─'.repeat(60));
              
              // Title
              if (embed.data.title) {
                console.log(`📌 ${embed.data.title}`);
              }
              
              // Description
              if (embed.data.description) {
                console.log(embed.data.description);
              }
              
              // Fields
              if (embed.data.fields) {
                embed.data.fields.forEach(field => {
                  console.log(`\n${field.name}:`);
                  console.log(field.value);
                });
              }
              
              // Footer
              if (embed.data.footer) {
                console.log(`\n${embed.data.footer.text}`);
              }
              
              console.log('─'.repeat(60));
            }
          }
        };
      }
    }
  };

  // Initialize the updater
  const updater = new DailyUpdater(mockClient);
  
  console.log('\n📊 Running afternoon update simulation...\n');
  
  // Get current time for the update
  const now = moment().tz('America/New_York');
  const timeStr = now.format('MMMM D, YYYY - h:mm A z');
  
  try {
    // Test with GPT ENABLED
    console.log('\n' + '='.repeat(70));
    console.log('🤖 GPT ENABLED - Enhanced Fact Extraction');
    console.log('='.repeat(70));
    
    process.env.GPT_ENABLED = 'true';
    
    // Collect and format the data
    console.log('\n📡 Collecting NFL data with GPT enhancement...\n');
    const nflData = await updater.collectNFLDataBatched();
    
    // Show what would be posted to Discord
    console.log('\n' + '='.repeat(70));
    console.log('📱 DISCORD OUTPUT PREVIEW (with GPT):');
    console.log('='.repeat(70));
    
    // Simulate posting to Discord
    await updater.postStaggeredUpdatesToDiscord(nflData, timeStr, 'afternoon');
    
    // Now test with GPT DISABLED for comparison
    console.log('\n\n' + '='.repeat(70));
    console.log('🔌 GPT DISABLED - Rule-Based Only');
    console.log('='.repeat(70));
    
    process.env.GPT_ENABLED = 'false';
    
    // Reset and collect again without GPT
    console.log('\n📡 Collecting NFL data WITHOUT GPT enhancement...\n');
    const nflDataNoGPT = await updater.collectNFLDataBatched();
    
    console.log('\n' + '='.repeat(70));
    console.log('📱 DISCORD OUTPUT PREVIEW (without GPT):');
    console.log('='.repeat(70));
    
    // Simulate posting to Discord
    await updater.postStaggeredUpdatesToDiscord(nflDataNoGPT, timeStr, 'afternoon-no-gpt');
    
    // Compare results
    console.log('\n\n' + '='.repeat(70));
    console.log('📊 COMPARISON SUMMARY');
    console.log('='.repeat(70));
    
    console.log('\nWith GPT Enhancement:');
    console.log(`  🏥 Injuries: ${nflData.injuries.bullets.length} bullets (${nflData.injuries.source})`);
    console.log(`  🔁 Roster: ${nflData.rosterChanges.bullets.length} bullets (${nflData.rosterChanges.source})`);
    console.log(`  📰 Breaking: ${nflData.breakingNews.bullets.length} bullets (${nflData.breakingNews.source})`);
    
    console.log('\nWithout GPT (Rule-based only):');
    console.log(`  🏥 Injuries: ${nflDataNoGPT.injuries.bullets.length} bullets (${nflDataNoGPT.injuries.source})`);
    console.log(`  🔁 Roster: ${nflDataNoGPT.rosterChanges.bullets.length} bullets (${nflDataNoGPT.rosterChanges.source})`);
    console.log(`  📰 Breaking: ${nflDataNoGPT.breakingNews.bullets.length} bullets (${nflDataNoGPT.breakingNews.source})`);
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ Test Complete! Check output above to see Discord formatting.');
    console.log('='.repeat(70));
    
  } catch (error) {
    console.error('❌ Error during test:', error);
  }
  
  process.exit(0);
}

// Run the test
testDiscordOutput().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});