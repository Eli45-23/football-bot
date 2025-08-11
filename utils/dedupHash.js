const crypto = require('crypto');

/**
 * Payload Deduplication Service
 * Prevents duplicate posts within a specified time window using hash comparison
 */
class DedupHashService {
  constructor() {
    // In-memory storage for recent hashes
    this.recentHashes = new Map();
    
    // Default 5-minute window (configurable via env)
    this.dedupeWindowMs = parseInt(process.env.DEDUPE_WINDOW_MS) || 300000; // 5 minutes
    
    console.log(`🔒 Deduplication service initialized (${this.dedupeWindowMs/1000}s window)`);
  }

  /**
   * Generate a hash for the payload content (excluding timestamps)
   * @param {Object} payload - Payload object to hash
   * @returns {string} SHA256 hash
   */
  makePayloadHash(payload) {
    try {
      // Create a copy without timestamp fields to focus on content
      const contentForHash = {
        injuries: payload.injuries?.items || [],
        roster: payload.roster?.items || [],
        schedule: payload.schedule?.items || [],
        breaking: payload.breaking?.items || [],
        // Include counts but not timestamps
        injuryCount: payload.injuries?.totalCount || 0,
        rosterCount: payload.roster?.totalCount || 0,
        scheduleCount: payload.schedule?.totalCount || 0,
        breakingCount: payload.breaking?.totalCount || 0
      };

      const contentString = JSON.stringify(contentForHash, null, 0);
      const hash = crypto.createHash('sha256').update(contentString).digest('hex');
      
      return hash.substring(0, 12); // Use first 12 chars for readability
    } catch (error) {
      console.error('❌ Error generating payload hash:', error);
      return Date.now().toString(); // Fallback to timestamp
    }
  }

  /**
   * Check if a payload hash was recently posted
   * @param {string} hash - Hash to check
   * @returns {boolean} True if duplicate (should skip posting)
   */
  isDuplicate(hash) {
    const now = Date.now();
    
    // Clean up old hashes first
    this.pruneOldHashes(now);
    
    // Check if this hash exists within the window
    if (this.recentHashes.has(hash)) {
      const timestamp = this.recentHashes.get(hash);
      const ageMs = now - timestamp;
      
      if (ageMs < this.dedupeWindowMs) {
        console.log(`🚫 Duplicate payload detected (hash: ${hash}, age: ${Math.round(ageMs/1000)}s)`);
        return true;
      }
    }
    
    return false;
  }

  /**
   * Record a hash as recently posted
   * @param {string} hash - Hash to record
   */
  recordHash(hash) {
    const now = Date.now();
    this.recentHashes.set(hash, now);
    console.log(`✅ Recorded payload hash: ${hash} at ${new Date(now).toISOString()}`);
  }

  /**
   * Remove old hashes outside the deduplication window
   * @param {number} now - Current timestamp
   */
  pruneOldHashes(now) {
    const cutoffTime = now - this.dedupeWindowMs;
    const initialSize = this.recentHashes.size;
    
    for (const [hash, timestamp] of this.recentHashes.entries()) {
      if (timestamp < cutoffTime) {
        this.recentHashes.delete(hash);
      }
    }
    
    const pruned = initialSize - this.recentHashes.size;
    if (pruned > 0) {
      console.log(`🧹 Pruned ${pruned} old hashes (${this.recentHashes.size} remaining)`);
    }
  }

  /**
   * Check and record a hash in one operation
   * @param {Object} payload - Payload to check and record
   * @returns {Object} Result with isDuplicate flag and hash
   */
  checkAndRecord(payload) {
    const hash = this.makePayloadHash(payload);
    const isDuplicate = this.isDuplicate(hash);
    
    if (!isDuplicate) {
      this.recordHash(hash);
    }
    
    return {
      hash,
      isDuplicate,
      windowMs: this.dedupeWindowMs
    };
  }

  /**
   * Get status of the deduplication service
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      recentHashCount: this.recentHashes.size,
      windowMs: this.dedupeWindowMs,
      oldestHash: this.getOldestHashAge(),
      newestHash: this.getNewestHashAge()
    };
  }

  /**
   * Get age of oldest hash in memory
   * @returns {number|null} Age in milliseconds or null if empty
   */
  getOldestHashAge() {
    if (this.recentHashes.size === 0) return null;
    
    const now = Date.now();
    let oldest = now;
    
    for (const timestamp of this.recentHashes.values()) {
      if (timestamp < oldest) {
        oldest = timestamp;
      }
    }
    
    return now - oldest;
  }

  /**
   * Get age of newest hash in memory
   * @returns {number|null} Age in milliseconds or null if empty
   */
  getNewestHashAge() {
    if (this.recentHashes.size === 0) return null;
    
    const now = Date.now();
    let newest = 0;
    
    for (const timestamp of this.recentHashes.values()) {
      if (timestamp > newest) {
        newest = timestamp;
      }
    }
    
    return now - newest;
  }

  /**
   * Clear all stored hashes (for testing)
   */
  clear() {
    this.recentHashes.clear();
    console.log('🧹 Cleared all stored hashes');
  }
}

module.exports = new DedupHashService();