#!/usr/bin/env node

/**
 * Quick verification of key fallback functionality
 */

require('dotenv').config();
const { getStatus } = require('./services/statusService');

async function quickVerification() {
  console.log('🚀 Quick Fallback Chain Verification');
  console.log('='.repeat(40));

  // Test cache hit (eagles should be cached from previous test)
  console.log('\n💾 Testing cache hit...');
  const cachedResult = await getStatus('eagles');
  console.log(`Result: ${cachedResult.source} | ${cachedResult.title}`);
  
  // Test invalid input error handling
  console.log('\n❌ Testing error handling...');
  const errorResult = await getStatus('invalid-team-xyz');
  console.log(`Result: ${errorResult.source} | Error: ${errorResult.error}`);
  
  console.log('\n✅ Key verification complete!');
  console.log(`✅ Cache working: ${cachedResult.source === 'Cached'}`);
  console.log(`✅ Error handling: ${errorResult.error === true}`);
}

quickVerification().catch(console.error);