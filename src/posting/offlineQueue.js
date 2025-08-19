const config = require('../../config/config');

/**
 * Offline Message Queue Manager
 * Queues Discord posting functions when client is not ready
 * Flushes queue with controlled spacing when connection is restored
 */
class OfflineQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.spacingMs = parseInt(process.env.OFFLINE_QUEUE_SPACING_MS) || 300; // 300ms between posts
  }

  /**
   * Check if Discord client is ready for posting
   * @param {Client} client - Discord client instance
   * @returns {boolean} True if client is ready and connected
   */
  isClientReady(client) {
    return client && client.isReady && client.isReady() && client.ws.status === 0; // READY status
  }

  /**
   * Enqueue a posting function or execute immediately if client is ready
   * @param {Function} postingFn - Async function that performs Discord posting
   * @param {Client} client - Discord client instance  
   * @param {string} description - Description for logging (optional)
   */
  async enqueue(postingFn, client, description = 'Discord post') {
    if (this.isClientReady(client)) {
      // Client is ready - execute immediately
      try {
        await postingFn();
        console.log(`📤 ${description} - posted immediately`);
      } catch (error) {
        console.error(`❌ Failed to post ${description}:`, error.message);
        // If immediate posting fails, queue it for retry
        this.queue.push({ fn: postingFn, description, queuedAt: Date.now() });
        console.log(`🔄 Queued failed ${description} for retry (queue size: ${this.queue.length})`);
      }
    } else {
      // Client not ready - add to queue
      this.queue.push({ fn: postingFn, description, queuedAt: Date.now() });
      console.log(`📥 Queued ${description} - client not ready (queue size: ${this.queue.length})`);
    }
  }

  /**
   * Create a queued version of channel.send() with cold start recovery
   * @param {Channel} channel - Discord channel
   * @param {Object} content - Message content (embeds, text, etc.)
   * @param {Client} client - Discord client instance
   * @param {string} description - Description for logging
   * @returns {Promise} Promise that resolves when queued or posted
   */
  async queuedChannelSend(channel, content, client, description = 'message') {
    const postingFn = async () => {
      await this.sendWithColdStartRetry(channel, content, description);
    };
    
    return this.enqueue(postingFn, client, description);
  }

  /**
   * Send with cold start detection and retry logic
   * @param {Channel} channel - Discord channel
   * @param {Object} content - Message content
   * @param {string} description - Description for logging
   */
  async sendWithColdStartRetry(channel, content, description) {
    const maxRetries = 2;
    let attempt = 1;
    
    while (attempt <= maxRetries) {
      // Check if this might be a cold start scenario
      const isColdStart = this.detectColdStart();
      
      if (isColdStart && attempt === 1) {
        console.log(`🧊 [COLD START DETECTED] Potential cold start for ${description} - will retry if needed`);
      }
      
      const startTime = Date.now();
      
      try {
        // Attempt to send
        await channel.send(content);
        const duration = Date.now() - startTime;
        
        console.log(`✅ [DISCORD] ${description} sent successfully (${duration}ms, attempt ${attempt})`);
        return; // Success!
        
      } catch (error) {
        const duration = Date.now() - startTime;
        
        // Check if this looks like a cold start timeout
        const isColdStartError = this.isColdStartError(error, duration);
        
        if (isColdStartError && attempt < maxRetries) {
          const retryDelay = 60000; // 60 seconds for instance to warm up
          console.log(`🧊 [COLD START RETRY] ${description} failed due to cold start, retrying in ${retryDelay/1000}s (attempt ${attempt}/${maxRetries})`);
          console.log(`   ❄️ Error: ${error.message}`);
          
          // Wait for instance to warm up
          await this.sleep(retryDelay);
          attempt++;
          continue;
        }
        
        // Not a cold start error or max retries reached
        console.error(`❌ [DISCORD FINAL ERROR] ${description} failed on attempt ${attempt}/${maxRetries}`);
        throw error;
      }
    }
  }

  /**
   * Detect if we're likely in a cold start scenario
   * @returns {boolean} True if cold start is likely
   */
  detectColdStart() {
    // Check global instance state if available
    if (global.instanceState) {
      const timeSinceLastActivity = Date.now() - global.instanceState.lastActivity;
      const timeSinceStart = Date.now() - global.instanceState.startTime;
      
      // Cold start likely if:
      // 1. Instance just started (less than 2 minutes up)
      // 2. No activity for more than 15 minutes
      const justStarted = timeSinceStart < 120000; // 2 minutes
      const longInactive = timeSinceLastActivity > 900000; // 15 minutes
      
      if (justStarted || longInactive) {
        console.log(`🧊 [COLD START DETECTION] Instance conditions: uptime=${(timeSinceStart/1000).toFixed(1)}s, inactive=${(timeSinceLastActivity/1000).toFixed(1)}s`);
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if an error looks like a cold start related issue
   * @param {Error} error - The error that occurred
   * @param {number} duration - How long the operation took
   * @returns {boolean} True if this looks like a cold start error
   */
  isColdStartError(error, duration) {
    const message = error.message?.toLowerCase() || '';
    const code = error.code;
    
    // Common cold start error patterns
    const coldStartIndicators = [
      'timeout',
      'etimedout', 
      'econnreset',
      'enotfound',
      'network error',
      'connection failed',
      'socket hang up'
    ];
    
    const hasIndicator = coldStartIndicators.some(indicator => 
      message.includes(indicator) || code === indicator.toUpperCase()
    );
    
    // Also consider very long durations as potential cold start issues
    const veryLongDuration = duration > 30000; // 30+ seconds
    
    return hasIndicator || veryLongDuration;
  }

  /**
   * Sleep utility for retry delays
   * @param {number} ms - Milliseconds to sleep
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Flush all queued messages when client becomes ready
   * @param {Client} client - Discord client instance
   * @returns {Promise<Object>} Results of flushing operation
   */
  async flushOfflineQueue(client) {
    if (this.queue.length === 0) {
      console.log('📭 No queued messages to flush');
      return { processed: 0, successful: 0, failed: 0 };
    }

    if (this.isProcessing) {
      console.log('🔄 Queue flush already in progress, skipping...');
      return { processed: 0, successful: 0, failed: 0, skipped: true };
    }

    if (!this.isClientReady(client)) {
      console.log('⚠️ Cannot flush queue - client not ready');
      return { processed: 0, successful: 0, failed: 0, clientNotReady: true };
    }

    this.isProcessing = true;
    const startTime = Date.now();
    const queueSize = this.queue.length;
    
    console.log(`🚀 Flushing ${queueSize} queued messages with ${this.spacingMs}ms spacing...`);

    const results = {
      processed: 0,
      successful: 0,
      failed: 0,
      details: []
    };

    // Process queue items with controlled spacing
    const queueItems = [...this.queue]; // Copy queue to avoid modification during processing
    this.queue = []; // Clear original queue

    for (const item of queueItems) {
      results.processed++;
      
      try {
        // Check if client is still ready before each post
        if (!this.isClientReady(client)) {
          console.log('⚠️ Client became not ready during flush - re-queuing remaining items');
          // Re-queue remaining items
          const remainingItems = queueItems.slice(results.processed - 1);
          this.queue.push(...remainingItems);
          break;
        }

        const queueAge = Date.now() - item.queuedAt;
        console.log(`📤 Posting queued ${item.description} (queued ${Math.round(queueAge/1000)}s ago)...`);
        
        await item.fn();
        results.successful++;
        results.details.push({ description: item.description, status: 'success', queueAge });
        
        // Add spacing between posts to avoid rate limits
        if (results.processed < queueItems.length) {
          await this.sleep(this.spacingMs);
        }
        
      } catch (error) {
        results.failed++;
        results.details.push({ 
          description: item.description, 
          status: 'failed', 
          error: error.message,
          queueAge: Date.now() - item.queuedAt
        });
        
        console.error(`❌ Failed to post queued ${item.description}:`, error.message);
        
        // For non-critical errors, continue processing other items
        // For critical errors (like channel not found), we might want to stop
        if (error.code === 10003) { // Unknown Channel
          console.error('💥 Critical error - stopping queue flush');
          // Re-queue remaining items
          const remainingItems = queueItems.slice(results.processed);
          this.queue.push(...remainingItems);
          break;
        }
      }
    }

    const duration = Date.now() - startTime;
    this.isProcessing = false;

    console.log(`✅ Queue flush completed: ${results.successful}/${results.processed} successful in ${duration}ms`);
    console.log(`📊 Queue status: ${this.queue.length} items remaining`);

    // Log detailed results for debugging
    if (results.failed > 0) {
      console.log('❌ Failed items:');
      results.details.filter(d => d.status === 'failed').forEach(detail => {
        console.log(`   - ${detail.description}: ${detail.error}`);
      });
    }

    return results;
  }

  /**
   * Get current queue status for monitoring
   * @returns {Object} Queue status information
   */
  getQueueStatus() {
    const now = Date.now();
    const queueAges = this.queue.map(item => Math.round((now - item.queuedAt) / 1000));
    
    return {
      size: this.queue.length,
      isProcessing: this.isProcessing,
      spacingMs: this.spacingMs,
      oldestItemAgeSeconds: queueAges.length > 0 ? Math.max(...queueAges) : 0,
      averageAgeSeconds: queueAges.length > 0 ? Math.round(queueAges.reduce((a, b) => a + b, 0) / queueAges.length) : 0,
      items: this.queue.map(item => ({
        description: item.description,
        ageSeconds: Math.round((now - item.queuedAt) / 1000)
      }))
    };
  }

  /**
   * Clear all queued items (for emergency situations)
   * @param {string} reason - Reason for clearing queue
   */
  clearQueue(reason = 'Manual clear') {
    const clearedCount = this.queue.length;
    this.queue = [];
    console.log(`🗑️ Cleared ${clearedCount} queued items - reason: ${reason}`);
    return clearedCount;
  }

  /**
   * Sleep utility for controlled spacing
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after delay
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Emergency mode - skip queue and post immediately (bypass ready checks)
   * Use only for critical messages that must be sent
   * @param {Function} postingFn - Posting function to execute
   * @param {string} description - Description for logging
   */
  async emergencyPost(postingFn, description = 'emergency post') {
    console.log(`🚨 Emergency posting: ${description}`);
    try {
      await postingFn();
      console.log(`✅ Emergency post successful: ${description}`);
    } catch (error) {
      console.error(`❌ Emergency post failed: ${description}`, error.message);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new OfflineQueue();