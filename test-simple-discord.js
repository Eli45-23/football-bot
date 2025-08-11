require('dotenv').config();
const aggregateNews = require('./utils/aggregateNews');
const gptSummarizer = require('./src/services/gptSummarizer');
const moment = require('moment-timezone');

/**
 * Simple test to show Discord output format with GPT vs without
 */
async function testSimpleDiscordOutput() {
  console.log('🚀 Simple Discord Output Test with GPT Enhancement\n');
  console.log('='.repeat(70));
  
  const timeStr = moment().tz('America/New_York').format('MMMM D, YYYY - h:mm A z');
  
  // Mock Discord formatting function
  function formatDiscordSection(title, categoryData) {
    console.log('\n' + '─'.repeat(50));
    console.log(`📌 ${title}`);
    console.log('─'.repeat(50));
    
    if (categoryData.items && categoryData.items.length > 0) {
      categoryData.items.forEach(item => {
        console.log(`• ${item}`);
      });
      
      if (categoryData.truncatedCount > 0 && !title.includes('Scheduled Games')) {
        console.log(`(+${categoryData.truncatedCount} more)`);
      }
    } else {
      console.log('• No updates');
    }
    
    console.log(`\nSource: ${categoryData.source || 'Unknown'}`);
    console.log('─'.repeat(50));
  }
  
  try {
    // Test 1: With GPT ENABLED
    console.log('\n🤖 TEST 1: WITH GPT ENHANCEMENT');
    console.log('='.repeat(70));
    
    process.env.GPT_ENABLED = 'true';
    gptSummarizer.resetCallCounter();
    
    const resultWithGPT = await aggregateNews.getCategorizedNews(null, 12, 'afternoon');
    
    console.log(`\n📊 Header: NFL Afternoon Update – ${timeStr.split(' – ')[0]} – ${timeStr.split(' – ')[1]}`);
    console.log(`Processing data with ${process.env.GPT_ENABLED === 'true' ? 'GPT enhancement' : 'rule-based only'}`);
    
    formatDiscordSection('🏥 Injuries', resultWithGPT.injuries);
    formatDiscordSection('🔁 Roster Changes', resultWithGPT.rosterChanges);  
    formatDiscordSection('📰 Breaking News', resultWithGPT.breaking);
    
    const gptStatus = gptSummarizer.getStatus();
    console.log(`\n🗂 Sources: TheSportsDB • ESPN • NFL.com • PFT • Yahoo • CBS • ProFootballRumors (+ GPT polish)`);
    console.log(`🤖 GPT: ${gptStatus.callsUsed}/${gptStatus.callsLimit} calls used`);
    
    // Test 2: With GPT DISABLED
    console.log('\n\n🔌 TEST 2: WITHOUT GPT (Rule-based only)');
    console.log('='.repeat(70));
    
    process.env.GPT_ENABLED = 'false';
    
    const resultWithoutGPT = await aggregateNews.getCategorizedNews(null, 12, 'afternoon');
    
    console.log(`\n📊 Header: NFL Afternoon Update – ${timeStr.split(' – ')[0]} – ${timeStr.split(' – ')[1]}`);
    console.log(`Processing data with ${process.env.GPT_ENABLED === 'true' ? 'GPT enhancement' : 'rule-based only'}`);
    
    formatDiscordSection('🏥 Injuries', resultWithoutGPT.injuries);
    formatDiscordSection('🔁 Roster Changes', resultWithoutGPT.rosterChanges);
    formatDiscordSection('📰 Breaking News', resultWithoutGPT.breaking);
    
    console.log(`\n🗂 Sources: TheSportsDB • ESPN • NFL.com • Yahoo • CBS Sports • ProFootballTalk (Full-text analysis)`);
    
    // Comparison
    console.log('\n\n📊 COMPARISON');
    console.log('='.repeat(70));
    
    console.log('\nWith GPT Enhancement:');
    console.log(`  🏥 Injuries: ${resultWithGPT.injuries.bullets.length} bullets (${resultWithGPT.injuries.source})`);
    console.log(`  🔁 Roster: ${resultWithGPT.rosterChanges.bullets.length} bullets (${resultWithGPT.rosterChanges.source})`);
    console.log(`  📰 Breaking: ${resultWithGPT.breaking.bullets.length} bullets (${resultWithGPT.breaking.source})`);
    
    console.log('\nWithout GPT (Rule-based):');
    console.log(`  🏥 Injuries: ${resultWithoutGPT.injuries.bullets.length} bullets (${resultWithoutGPT.injuries.source})`);
    console.log(`  🔁 Roster: ${resultWithoutGPT.rosterChanges.bullets.length} bullets (${resultWithoutGPT.rosterChanges.source})`);
    console.log(`  📰 Breaking: ${resultWithoutGPT.breaking.bullets.length} bullets (${resultWithoutGPT.breaking.source})`);
    
    console.log('\n💡 Key Differences:');
    const injuryDiff = resultWithGPT.injuries.bullets.length - resultWithoutGPT.injuries.bullets.length;
    const rosterDiff = resultWithGPT.rosterChanges.bullets.length - resultWithoutGPT.rosterChanges.bullets.length;
    const breakingDiff = resultWithGPT.breaking.bullets.length - resultWithoutGPT.breaking.bullets.length;
    
    console.log(`  🏥 Injuries: ${injuryDiff >= 0 ? '+' : ''}${injuryDiff} bullets with GPT`);
    console.log(`  🔁 Roster: ${rosterDiff >= 0 ? '+' : ''}${rosterDiff} bullets with GPT`);
    console.log(`  📰 Breaking: ${breakingDiff >= 0 ? '+' : ''}${breakingDiff} bullets with GPT`);
    
    if (resultWithGPT.injuries.source.includes('GPT') || 
        resultWithGPT.rosterChanges.source.includes('GPT') || 
        resultWithGPT.breaking.source.includes('GPT')) {
      console.log(`  ✅ GPT enhancement applied to at least one category`);
    } else {
      console.log(`  ⚠️ No GPT enhancement detected (may need more data)`);
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ Test Complete! This shows how your Discord bot output would look.');
    console.log('='.repeat(70));
    
  } catch (error) {
    console.error('❌ Error during test:', error);
  }
  
  process.exit(0);
}

// Run the test
testSimpleDiscordOutput().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});