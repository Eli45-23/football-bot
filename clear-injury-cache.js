#!/usr/bin/env node

/**
 * Clear injury-related cache entries for testing
 */

require('dotenv').config();
const { clearCache, deleteCache } = require('./lib/cache');

async function clearInjuryCache() {
  console.log('🧹 Clearing injury-related cache entries...');
  
  try {
    // Clear specific injury cache keys
    await deleteCache('injuries:league:all');
    await deleteCache('injuries:team:eagles');
    await deleteCache('injuries:team:cowboys');
    await deleteCache('injuries:team:ravens');
    await deleteCache('news:team:nfl');
    await deleteCache('news:team:eagles');
    await deleteCache('news:team:cowboys');
    await deleteCache('news:team:ravens');
    
    console.log('✅ Injury cache cleared successfully!');
    console.log('🔄 Next /injuries command will fetch fresh data');
    
  } catch (error) {
    console.error('❌ Error clearing cache:', error.message);
  }
}

// Run if called directly
if (require.main === module) {
  clearInjuryCache()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('💥 Cache clear failed:', error);
      process.exit(1);
    });
}

module.exports = { clearInjuryCache };