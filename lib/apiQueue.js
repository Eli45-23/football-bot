const { limitedGet, getLimiterStats } = require('./http');

/**
 * Enhanced API Queue Manager for NFL Discord Bot
 * Handles 429 rate limits with sophisticated retry and deferred processing
 * 
 * Features:
 * - Specific backoff sequence: [2s, 4s, 8s, 16s] as requested
 * - Deferred item processing with longer delays (30-45s per item)
 * - Queue management with concurrency control
 * - Comprehensive failure tracking and reporting
 */
class ApiQueueManager {
  constructor() {
    this.activeRequests = new Map(); // Track ongoing requests
    this.deferredQueue = []; // Items that failed all retries
    this.failedItems = []; // Items that still failed after deferred processing
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      retriedRequests: 0,
      deferredRequests: 0,
      finalFailures: 0
    };
    
    // Specific backoff sequence as requested: [2s, 4s, 8s, 16s]
    this.BACKOFF_SEQUENCE = [2000, 4000, 8000, 16000]; // milliseconds
    this.MAX_RETRIES = 4; // 4 attempts total (1 initial + 3 retries)
    this.DEFERRED_DELAY_MIN = 30000; // 30s minimum delay for deferred items
    this.DEFERRED_DELAY_MAX = 45000; // 45s maximum delay for deferred items
    
    console.log('🎯 Enhanced API Queue Manager initialized');
    console.log(`   📊 Backoff sequence: ${this.BACKOFF_SEQUENCE.map(d => `${d/1000}s`).join(', ')}`);
    console.log(`   🔄 Max retries: ${this.MAX_RETRIES}`);
    console.log(`   ⏱️ Deferred delay: ${this.DEFERRED_DELAY_MIN/1000}s - ${this.DEFERRED_DELAY_MAX/1000}s`);
  }
  
  /**
   * Enhanced API request with sophisticated retry logic
   * @param {string} url - URL to request
   * @param {Object} config - Axios config
   * @param {Object} metadata - Request metadata (team name, type, etc.)
   * @returns {Promise<Object>} Response data or null if failed
   */
  async makeRequest(url, config = {}, metadata = {}) {
    const requestId = this.generateRequestId(url, metadata);
    this.stats.totalRequests++;
    
    try {
      console.log(`🎯 API Request: ${url} (${metadata.teamName || 'unknown'}) [${requestId}]`);
      
      const response = await this.makeRequestWithRetries(url, config, requestId, 1);
      this.stats.successfulRequests++;
      
      console.log(`✅ API Success: ${metadata.teamName || 'unknown'} [${requestId}]`);
      return response.data;
      
    } catch (error) {
      console.log(`🔄 API failed after retries, adding to deferred queue: ${metadata.teamName || 'unknown'} [${requestId}]`);
      
      // Add to deferred queue for later processing
      this.deferredQueue.push({
        url,
        config,
        metadata,
        requestId,
        addedAt: Date.now()
      });
      this.stats.deferredRequests++;
      
      return null; // Return null for failed requests
    }
  }
  
  /**
   * Make request with specific backoff sequence retries
   * @param {string} url - URL to request
   * @param {Object} config - Axios config
   * @param {string} requestId - Request ID for tracking
   * @param {number} attempt - Current attempt number (1-based)
   * @returns {Promise<Object>} Axios response
   */
  async makeRequestWithRetries(url, config, requestId, attempt) {
    try {
      const response = await limitedGet(url, config);
      return response;
      
    } catch (error) {
      const status = error?.response?.status;
      
      // Check if we should retry
      const shouldRetry = (
        (status === 429 || // Rate limited (primary concern)
         status === 502 || // Bad gateway  
         status === 503 || // Service unavailable
         status === 504 || // Gateway timeout
         error.code === 'ECONNRESET' ||
         error.code === 'ETIMEDOUT') &&
        attempt <= this.MAX_RETRIES
      );
      
      if (shouldRetry) {
        const delayIndex = attempt - 1; // Convert 1-based to 0-based
        const delay = this.BACKOFF_SEQUENCE[delayIndex] || this.BACKOFF_SEQUENCE[this.BACKOFF_SEQUENCE.length - 1];
        
        // Add small jitter (±10%) to prevent thundering herd
        const jitter = Math.floor((Math.random() - 0.5) * 0.2 * delay);
        const finalDelay = delay + jitter;
        
        console.log(`   ⏳ ${status || error.code} for [${requestId}], retrying in ${finalDelay/1000}s... (attempt ${attempt}/${this.MAX_RETRIES})`);
        this.stats.retriedRequests++;
        
        await this.sleep(finalDelay);
        return this.makeRequestWithRetries(url, config, requestId, attempt + 1);
      }
      
      // No more retries
      console.log(`   ❌ Final failure for [${requestId}] after ${attempt} attempts: ${status || error.code}`);
      throw error;
    }
  }
  
  /**
   * Process deferred queue items with longer delays
   * Called after main batch processing is complete
   * @returns {Promise<Object>} Results of deferred processing
   */
  async processDeferredItems() {
    if (this.deferredQueue.length === 0) {
      console.log('✅ No deferred items to process');
      return { processed: 0, successful: 0, stillFailed: 0 };
    }
    
    console.log(`🔄 Processing ${this.deferredQueue.length} deferred items with extended delays...`);
    
    const results = {
      processed: 0,
      successful: 0,
      stillFailed: 0,
      responses: []
    };
    
    // Process deferred items one at a time with long delays
    for (const deferredItem of this.deferredQueue) {
      results.processed++;
      
      try {
        // Random delay between 30-45s per item
        const delay = this.DEFERRED_DELAY_MIN + 
          Math.random() * (this.DEFERRED_DELAY_MAX - this.DEFERRED_DELAY_MIN);
        
        console.log(`   ⏱️ Deferred processing: ${deferredItem.metadata.teamName || 'unknown'} (waiting ${Math.round(delay/1000)}s...)`);
        await this.sleep(delay);
        
        // Try request again with same retry logic
        const response = await this.makeRequestWithRetries(
          deferredItem.url, 
          deferredItem.config, 
          deferredItem.requestId, 
          1
        );
        
        results.successful++;
        results.responses.push({
          success: true,
          data: response.data,
          metadata: deferredItem.metadata
        });
        
        console.log(`   ✅ Deferred success: ${deferredItem.metadata.teamName || 'unknown'}`);
        
      } catch (error) {
        results.stillFailed++;
        this.stats.finalFailures++;
        
        // Add to final failed items list
        this.failedItems.push({
          ...deferredItem,
          finalError: error?.response?.status || error.code,
          failedAt: Date.now()
        });
        
        results.responses.push({
          success: false,
          error: error?.response?.status || error.code,
          metadata: deferredItem.metadata
        });
        
        console.log(`   ❌ Deferred failure: ${deferredItem.metadata.teamName || 'unknown'} (${error?.response?.status || error.code})`);
      }
    }
    
    // Clear deferred queue after processing
    this.deferredQueue = [];
    
    console.log(`✅ Deferred processing complete: ${results.successful}/${results.processed} successful`);
    return results;
  }
  
  /**
   * Get items that still failed after deferred processing
   * @returns {Array} Array of failed items for reporting
   */
  getStillFailedItems() {
    return this.failedItems.map(item => ({
      teamName: item.metadata.teamName,
      error: item.finalError,
      url: item.url,
      failedAt: new Date(item.failedAt).toISOString()
    }));
  }
  
  /**
   * Generate unique request ID for tracking
   * @param {string} url - Request URL
   * @param {Object} metadata - Request metadata
   * @returns {string} Unique request ID
   */
  generateRequestId(url, metadata) {
    const timestamp = Date.now().toString(36);
    const teamId = metadata.teamName ? metadata.teamName.substring(0, 3).toUpperCase() : 'UNK';
    const random = Math.random().toString(36).substring(2, 5);
    return `${teamId}-${timestamp}-${random}`;
  }
  
  /**
   * Sleep utility
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after delay
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Get comprehensive queue statistics
   * @returns {Promise<Object>} Queue statistics
   */
  async getStats() {
    const limiterStats = await getLimiterStats();
    
    return {
      queue: {
        totalRequests: this.stats.totalRequests,
        successfulRequests: this.stats.successfulRequests,
        retriedRequests: this.stats.retriedRequests,
        deferredRequests: this.stats.deferredRequests,
        finalFailures: this.stats.finalFailures,
        successRate: this.stats.totalRequests > 0 ? 
          ((this.stats.successfulRequests / this.stats.totalRequests) * 100).toFixed(1) + '%' : '0%'
      },
      limiter: limiterStats,
      deferred: {
        queueSize: this.deferredQueue.length,
        failedItems: this.failedItems.length
      }
    };
  }
  
  /**
   * Reset statistics (for testing)
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      retriedRequests: 0,
      deferredRequests: 0,
      finalFailures: 0
    };
    this.deferredQueue = [];
    this.failedItems = [];
    console.log('📊 API Queue stats reset');
  }
}

// Export singleton instance
module.exports = new ApiQueueManager();