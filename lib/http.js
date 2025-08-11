const axios = require('axios');
const { limiter, getReservoir, setReservoir } = require('../src/rateLimit/limiter.js');

/**
 * Enhanced HTTP client with rate limiting and exponential backoff
 * Handles TheSportsDB API rate limits gracefully with jitter
 */

// Note: Limiter is now imported from the modern API wrapper

// Create axios instance with timeout
const http = axios.create({ 
  timeout: 15000, // 15 second timeout
  headers: {
    'User-Agent': 'NFL-Discord-Bot/1.0.0'
  }
});

/**
 * Rate-limited GET request with exponential backoff and jitter
 * @param {string} url - URL to request
 * @param {Object} config - Axios config object
 * @param {number} attempt - Current retry attempt (internal)
 * @returns {Promise} Axios response
 */
async function limitedGet(url, config = {}, attempt = 1) {
  return limiter.schedule(async () => {
    try {
      console.log(`🌐 HTTP GET: ${url} (attempt ${attempt})`);
      const response = await http.get(url, config);
      console.log(`✅ HTTP Success: ${url}`);
      return response;
    } catch (err) {
      const status = err?.response?.status;
      const maxRetries = Number(process.env.MAX_RETRIES || 3);
      
      // Determine if we should retry
      const shouldRetry = (
        (status === 429 || // Rate limited
         status === 502 || // Bad gateway
         status === 503 || // Service unavailable
         status === 504 || // Gateway timeout
         err.code === 'ECONNRESET' ||
         err.code === 'ETIMEDOUT' ||
         err.code === 'ECONNREFUSED') &&
        attempt <= maxRetries
      );

      if (shouldRetry) {
        // Exponential backoff with jitter
        const baseDelay = Math.min(2 ** attempt * 500, 8000); // Cap at 8 seconds
        const jitter = Math.floor(Math.random() * 400); // 0-400ms jitter
        const delay = baseDelay + jitter;
        
        console.warn(`⏳ HTTP ${status || err.code} for ${url}, retrying in ${delay}ms... (attempt ${attempt}/${maxRetries})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return limitedGet(url, config, attempt + 1);
      }
      
      // Log final error and throw
      console.error(`❌ HTTP Error for ${url} after ${attempt} attempts:`, {
        status: status,
        code: err.code,
        message: err.message
      });
      
      throw err;
    }
  });
}

/**
 * Simple rate-limited POST request (for future use)
 * @param {string} url - URL to request
 * @param {Object} data - POST data
 * @param {Object} config - Axios config object
 * @returns {Promise} Axios response
 */
async function limitedPost(url, data, config = {}) {
  return limiter.schedule(async () => {
    console.log(`🌐 HTTP POST: ${url}`);
    const response = await http.post(url, data, config);
    console.log(`✅ HTTP POST Success: ${url}`);
    return response;
  });
}

/**
 * Get current rate limiter statistics
 * @returns {Promise<Object>} Limiter stats
 */
async function getLimiterStats() {
  return {
    running: limiter.running(),
    queued: limiter.queued(),
    reservoir: await getReservoir()
  };
}

/**
 * Clear the rate limiter queue (for testing)
 */
async function clearLimiter() {
  limiter.stop();
  limiter.start();
  // Reset reservoir for consistent testing
  await setReservoir(5);
}

module.exports = {
  limitedGet,
  limitedPost,
  getLimiterStats,
  clearLimiter,
  http // Export base axios instance for direct use if needed
};