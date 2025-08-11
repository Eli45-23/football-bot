require('dotenv').config();
const aggregateNews = require('./utils/aggregateNews');
const gptSummarizer = require('./src/services/gptSummarizer');

/**
 * Test script for GPT integration
 * Tests both GPT-enabled and GPT-disabled modes
 */
async function testGPTIntegration() {
  console.log('🧪 Testing GPT Integration for NFL Discord Bot\n');
  console.log('='.repeat(60));
  
  // Test 1: Check GPT configuration
  console.log('\n📋 TEST 1: GPT Configuration');
  console.log('-'.repeat(40));
  const gptStatus = gptSummarizer.getStatus();
  console.log(`GPT Enabled: ${gptStatus.enabled}`);
  console.log(`Model: ${gptStatus.model}`);
  console.log(`Max Input Tokens: ${gptStatus.maxInputTokens}`);
  console.log(`Max Output Tokens: ${gptStatus.maxOutputTokens}`);
  console.log(`Calls Limit: ${gptStatus.callsLimit}`);
  console.log(`Timeout: ${gptStatus.timeoutMs}ms`);
  
  // Test 2: Run with GPT disabled
  console.log('\n📋 TEST 2: Running with GPT DISABLED');
  console.log('-'.repeat(40));
  process.env.GPT_ENABLED = 'false';
  
  const startTime1 = Date.now();
  const resultWithoutGPT = await aggregateNews.getCategorizedNews(null, 12, 'afternoon');
  const timeWithoutGPT = Date.now() - startTime1;
  
  console.log(`\nResults WITHOUT GPT (${timeWithoutGPT}ms):`);
  console.log(`🏥 Injuries: ${resultWithoutGPT.injuries.bullets.length} bullets (${resultWithoutGPT.injuries.source})`);
  if (resultWithoutGPT.injuries.bullets.length > 0) {
    console.log(`   Sample: ${resultWithoutGPT.injuries.bullets[0].substring(0, 100)}...`);
  }
  console.log(`🔁 Roster: ${resultWithoutGPT.roster.bullets.length} bullets (${resultWithoutGPT.roster.source})`);
  if (resultWithoutGPT.roster.bullets.length > 0) {
    console.log(`   Sample: ${resultWithoutGPT.roster.bullets[0].substring(0, 100)}...`);
  }
  console.log(`📰 Breaking: ${resultWithoutGPT.breaking.bullets.length} bullets (${resultWithoutGPT.breaking.source})`);
  if (resultWithoutGPT.breaking.bullets.length > 0) {
    console.log(`   Sample: ${resultWithoutGPT.breaking.bullets[0].substring(0, 100)}...`);
  }
  
  // Test 3: Run with GPT enabled
  console.log('\n📋 TEST 3: Running with GPT ENABLED');
  console.log('-'.repeat(40));
  process.env.GPT_ENABLED = 'true';
  
  // Reset GPT call counter
  gptSummarizer.resetCallCounter();
  
  const startTime2 = Date.now();
  const resultWithGPT = await aggregateNews.getCategorizedNews(null, 12, 'afternoon');
  const timeWithGPT = Date.now() - startTime2;
  
  console.log(`\nResults WITH GPT (${timeWithGPT}ms):`);
  console.log(`🏥 Injuries: ${resultWithGPT.injuries.bullets.length} bullets (${resultWithGPT.injuries.source})`);
  if (resultWithGPT.injuries.bullets.length > 0) {
    console.log(`   Sample: ${resultWithGPT.injuries.bullets[0].substring(0, 100)}...`);
  }
  console.log(`🔁 Roster: ${resultWithGPT.roster.bullets.length} bullets (${resultWithGPT.roster.source})`);
  if (resultWithGPT.roster.bullets.length > 0) {
    console.log(`   Sample: ${resultWithGPT.roster.bullets[0].substring(0, 100)}...`);
  }
  console.log(`📰 Breaking: ${resultWithGPT.breaking.bullets.length} bullets (${resultWithGPT.breaking.source})`);
  if (resultWithGPT.breaking.bullets.length > 0) {
    console.log(`   Sample: ${resultWithGPT.breaking.bullets[0].substring(0, 100)}...`);
  }
  
  // Check GPT calls used
  const finalGPTStatus = gptSummarizer.getStatus();
  console.log(`\n🤖 GPT Calls Used: ${finalGPTStatus.callsUsed}/${finalGPTStatus.callsLimit}`);
  
  // Test 4: Compare results
  console.log('\n📋 TEST 4: Comparison');
  console.log('-'.repeat(40));
  console.log(`Time difference: ${timeWithGPT - timeWithoutGPT}ms`);
  console.log(`Injuries difference: ${resultWithGPT.injuries.bullets.length - resultWithoutGPT.injuries.bullets.length} bullets`);
  console.log(`Roster difference: ${resultWithGPT.roster.bullets.length - resultWithoutGPT.roster.bullets.length} bullets`);
  console.log(`Breaking difference: ${resultWithGPT.breaking.bullets.length - resultWithoutGPT.breaking.bullets.length} bullets`);
  
  // Test 5: Cost estimation
  console.log('\n📋 TEST 5: Cost Estimation');
  console.log('-'.repeat(40));
  const estimatedTokensPerCall = 3600; // 3000 input + 600 output
  const costPer1MTokens = 0.15; // $0.15 per 1M tokens for gpt-4o-mini
  const callsUsed = finalGPTStatus.callsUsed;
  const totalTokens = callsUsed * estimatedTokensPerCall;
  const estimatedCost = (totalTokens / 1000000) * costPer1MTokens;
  
  console.log(`Calls made: ${callsUsed}`);
  console.log(`Estimated tokens: ${totalTokens}`);
  console.log(`Estimated cost: $${estimatedCost.toFixed(4)}`);
  console.log(`Daily cost (3 runs): $${(estimatedCost * 3).toFixed(4)}`);
  
  // Success summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ GPT Integration Test Complete!');
  console.log('='.repeat(60));
  
  if (estimatedCost * 3 <= 0.01) {
    console.log('✅ Cost target achieved: ≤ $0.01/day');
  } else {
    console.log(`⚠️ Cost exceeds target: $${(estimatedCost * 3).toFixed(4)}/day > $0.01/day`);
  }
  
  process.exit(0);
}

// Run the test
testGPTIntegration().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});