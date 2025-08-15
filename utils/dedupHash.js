const crypto = require('crypto');
const scheduleState = require('../src/state/scheduleState');

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
   * Generate a comprehensive hash for update content including schedule data
   * @param {Object} nflData - Complete NFL data object
   * @param {string} updateType - Update type (morning/afternoon/evening)
   * @param {string} timeStr - Formatted time string
   * @returns {string} SHA256 hash
   */
  generateContentHash(nflData, updateType, timeStr) {
    try {
      // Enhanced content hashing with all relevant data
      const contentForHash = {
        // Core content
        injuries: this.normalizeForHash(nflData.injuries?.items || []),
        roster: this.normalizeForHash(nflData.roster?.items || []),
        schedule: this.normalizeForHash(nflData.scheduledGames || []),
        breaking: this.normalizeForHash(nflData.breaking?.items || []),
        
        // Metadata that affects content
        updateType,
        injuryCount: nflData.injuries?.totalCount || 0,
        rosterCount: nflData.roster?.totalCount || 0,
        scheduleCount: nflData.totalGames || 0,
        breakingCount: nflData.breaking?.totalCount || 0,
        
        // Schedule-specific data
        windowUsed: nflData.windowUsed,
        windowExpanded: nflData.windowExpanded,
        dateGrouping: nflData.dateGrouping,
        
        // GPT usage affects content
        gptEnabled: process.env.GPT_ENABLED === 'true'
      };

      const contentString = JSON.stringify(contentForHash, null, 0);
      const hash = crypto.createHash('sha256').update(contentString).digest('hex');
      
      return hash.substring(0, 16); // Use first 16 chars for better uniqueness
    } catch (error) {
      console.error('❌ Error generating content hash:', error);
      return `${updateType}_${Date.now()}`; // Fallback with type and timestamp
    }
  }
  
  /**
   * Normalize content for consistent hashing
   * @param {Array} items - Items to normalize
   * @returns {Array} Normalized items
   */
  normalizeForHash(items) {
    if (!Array.isArray(items)) return [];
    
    return items.map(item => {
      if (typeof item === 'string') {
        // Remove timestamps and source attributions for content comparison
        return item
          .replace(/\(\d+[hm] ago\)/g, '(recent)')
          .replace(/Updated \d+[hm] ago/g, 'Updated recently')
          .replace(/Updated [A-Z][a-z]{2} \d+/g, 'Updated recently')
          .replace(/\([A-Z]+\)$/g, '(SOURCE)'); // Normalize source attribution
      }
      return item;
    }).sort(); // Sort for consistent ordering
  }
  
  /**
   * Legacy method for backward compatibility
   * @param {Object} payload - Payload object to hash
   * @returns {string} SHA256 hash
   */
  makePayloadHash(payload) {
    // Convert to new format for compatibility
    const nflData = {
      injuries: payload.injuries,
      roster: payload.roster,
      scheduledGames: payload.schedule?.items || [],
      breaking: payload.breaking,
      totalGames: payload.schedule?.totalCount || 0
    };
    
    return this.generateContentHash(nflData, 'legacy', '');
  }

  /**
   * Enhanced duplicate check with persistent state integration
   * @param {string} hash - Hash to check
   * @param {string} updateType - Update type for persistent checking
   * @returns {Promise<boolean>} True if duplicate (should skip posting)
   */
  async isDuplicateEnhanced(hash, updateType) {
    const now = Date.now();
    
    // Clean up old hashes first
    this.pruneOldHashes(now);
    
    // Check recent in-memory hashes (short-term)
    if (this.recentHashes.has(hash)) {
      const timestamp = this.recentHashes.get(hash);
      const ageMs = now - timestamp;
      
      if (ageMs < this.dedupeWindowMs) {
        console.log(`🚫 Duplicate content detected (hash: ${hash}, age: ${Math.round(ageMs/1000)}s)`);
        return true;
      }
    }
    
    // Check persistent state for longer-term duplicate detection
    if (updateType && process.env.ENABLE_DUPLICATE_DETECTION === 'true') {
      try {
        const lastHash = await scheduleState.getLastHash(updateType);
        if (lastHash === hash) {
          console.log(`🚫 Content unchanged since last ${updateType} update (hash: ${hash})`);
          return true;
        }
      } catch (error) {
        console.warn(`⚠️ Could not check persistent hash for ${updateType}:`, error.message);
      }
    }
    
    return false;
  }
  
  /**
   * Legacy method for backward compatibility
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