const { Keyv } = require('keyv');
const path = require('path');

/**
 * SQLite-based caching system for NFL bot data
 * Provides TTL-based caching with configurable expiration
 */

// Initialize cache with SQLite backend
const cacheFile = path.join(__dirname, '..', 'cache.sqlite');
const cache = new Keyv(`sqlite://${cacheFile}`, { 
  namespace: 'nfl-bot',
  ttl: Number(process.env.CACHE_TTL_MIN || 30) * 60 * 1000 // Default 30 min TTL
});

// Handle cache errors gracefully
cache.on('error', (err) => {
  console.error('❌ Cache error:', err);
});

/**
 * Set cache value with custom TTL
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttlMin - TTL in minutes (optional)
 * @returns {Promise<boolean>} Success status
 */
async function setCache(key, value, ttlMin = Number(process.env.CACHE_TTL_MIN || 30)) {
  try {
    const ttlMs = ttlMin * 60 * 1000;
    const success = await cache.set(key, value, ttlMs);
    console.log(`💾 Cache SET: ${key} (TTL: ${ttlMin}min)`);
    return success;
  } catch (error) {
    console.error(`❌ Cache SET error for key ${key}:`, error.message);
    return false;
  }
}

/**
 * Get cache value
 * @param {string} key - Cache key
 * @returns {Promise<any|undefined>} Cached value or undefined
 */
async function getCache(key) {
  try {
    const value = await cache.get(key);
    if (value !== undefined) {
      console.log(`💾 Cache HIT: ${key}`);
      return value;
    } else {
      console.log(`💾 Cache MISS: ${key}`);
      return undefined;
    }
  } catch (error) {
    console.error(`❌ Cache GET error for key ${key}:`, error.message);
    return undefined;
  }
}

/**
 * Delete cache value
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} Success status
 */
async function deleteCache(key) {
  try {
    const success = await cache.delete(key);
    console.log(`💾 Cache DELETE: ${key}`);
    return success;
  } catch (error) {
    console.error(`❌ Cache DELETE error for key ${key}:`, error.message);
    return false;
  }
}

/**
 * Clear all cache entries
 * @returns {Promise<void>}
 */
async function clearCache() {
  try {
    await cache.clear();
    console.log('💾 Cache CLEARED');
  } catch (error) {
    console.error('❌ Cache CLEAR error:', error.message);
  }
}

/**
 * Check if cache key exists
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} Key exists status
 */
async function hasCache(key) {
  try {
    const value = await cache.get(key);
    return value !== undefined;
  } catch (error) {
    console.error(`❌ Cache HAS error for key ${key}:`, error.message);
    return false;
  }
}

/**
 * Get cache statistics (if supported by the store)
 * @returns {Object} Cache stats
 */
function getCacheStats() {
  return {
    namespace: cache.opts.namespace,
    defaultTTL: cache.opts.ttl,
    store: 'sqlite',
    file: cacheFile
  };
}

/**
 * Generate standardized cache keys
 */
const CacheKeys = {
  teamStatus: (teamName) => `team:${teamName.toLowerCase()}:status`,
  playerStatus: (playerName) => `player:${playerName.toLowerCase()}:status`,
  teamData: (teamName) => `team:${teamName.toLowerCase()}:data`,
  playerData: (playerName) => `player:${playerName.toLowerCase()}:data`,
  rssFeeds: (feedUrl) => `rss:${Buffer.from(feedUrl).toString('base64')}`,
  teamNews: (teamName) => `news:team:${teamName.toLowerCase()}`,
  playerNews: (playerName) => `news:player:${playerName.toLowerCase()}`
};

module.exports = {
  setCache,
  getCache,
  deleteCache,
  clearCache,
  hasCache,
  getCacheStats,
  CacheKeys,
  cache // Export raw cache instance for advanced usage
};