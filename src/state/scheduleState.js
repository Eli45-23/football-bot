const fs = require('fs').promises;
const path = require('path');

/**
 * Persistent Schedule State Manager
 * Tracks last-run timestamps and content hashes for missed-run detection and idempotency
 */
class ScheduleState {
  constructor() {
    this.dataDir = path.join(__dirname, '../../.data');
    this.scheduleFile = path.join(this.dataDir, 'schedule.json');
    this.hashFile = path.join(this.dataDir, 'lastHash.json');
    
    // Default state structure
    this.defaultState = {
      lastRuns: {
        morning: 0,
        afternoon: 0,
        evening: 0
      }
    };
    
    this.defaultHashState = {
      lastHashes: {
        morning: '',
        afternoon: '',
        evening: ''
      }
    };
  }

  /**
   * Ensure data directory exists
   */
  async ensureDataDir() {
    try {
      await fs.access(this.dataDir);
    } catch {
      await fs.mkdir(this.dataDir, { recursive: true });
      console.log('📁 Created .data directory for schedule persistence');
    }
  }

  /**
   * Get current schedule state with safe defaults
   * @returns {Object} Schedule state with lastRuns timestamps
   */
  async getState() {
    await this.ensureDataDir();
    
    try {
      const data = await fs.readFile(this.scheduleFile, 'utf8');
      const state = JSON.parse(data);
      
      // Ensure all slots exist with defaults
      return {
        lastRuns: {
          morning: state.lastRuns?.morning || 0,
          afternoon: state.lastRuns?.afternoon || 0,
          evening: state.lastRuns?.evening || 0
        }
      };
    } catch (error) {
      // File doesn't exist or is corrupted - return defaults
      console.log('📋 Initializing schedule state with defaults');
      await this.saveState(this.defaultState);
      return this.defaultState;
    }
  }

  /**
   * Get content hash state with safe defaults
   * @returns {Object} Hash state with lastHashes for each slot
   */
  async getHashState() {
    await this.ensureDataDir();
    
    try {
      const data = await fs.readFile(this.hashFile, 'utf8');
      const state = JSON.parse(data);
      
      return {
        lastHashes: {
          morning: state.lastHashes?.morning || '',
          afternoon: state.lastHashes?.afternoon || '',
          evening: state.lastHashes?.evening || ''
        }
      };
    } catch (error) {
      // File doesn't exist or is corrupted - return defaults
      console.log('📋 Initializing hash state with defaults');
      await this.saveHashState(this.defaultHashState);
      return this.defaultHashState;
    }
  }

  /**
   * Save schedule state to persistent storage
   * @param {Object} state - State object to save
   */
  async saveState(state) {
    await this.ensureDataDir();
    await fs.writeFile(this.scheduleFile, JSON.stringify(state, null, 2));
  }

  /**
   * Save hash state to persistent storage
   * @param {Object} hashState - Hash state object to save
   */
  async saveHashState(hashState) {
    await this.ensureDataDir();
    await fs.writeFile(this.hashFile, JSON.stringify(hashState, null, 2));
  }

  /**
   * Record successful run for a specific slot
   * @param {string} slot - morning|afternoon|evening
   * @param {number} timestamp - Run timestamp
   */
  async setRun(slot, timestamp) {
    if (!['morning', 'afternoon', 'evening'].includes(slot)) {
      throw new Error(`Invalid slot: ${slot}. Must be morning, afternoon, or evening`);
    }

    const state = await this.getState();
    state.lastRuns[slot] = timestamp;
    await this.saveState(state);
    
    console.log(`💾 Recorded successful ${slot} run at ${new Date(timestamp).toISOString()}`);
  }

  /**
   * Record content hash for a successful run (idempotency protection)
   * @param {string} slot - morning|afternoon|evening
   * @param {string} hash - Content hash of the posted update
   */
  async setLastHash(slot, hash) {
    if (!['morning', 'afternoon', 'evening'].includes(slot)) {
      throw new Error(`Invalid slot: ${slot}. Must be morning, afternoon, or evening`);
    }

    const hashState = await this.getHashState();
    hashState.lastHashes[slot] = hash;
    await this.saveHashState(hashState);
    
    console.log(`🔒 Recorded content hash for ${slot}: ${hash.substring(0, 8)}...`);
  }

  /**
   * Get the last content hash for a specific slot
   * @param {string} slot - morning|afternoon|evening
   * @returns {Promise<string|null>} Last hash or null if not found
   */
  async getLastHash(slot) {
    if (!['morning', 'afternoon', 'evening'].includes(slot)) {
      throw new Error(`Invalid slot: ${slot}. Must be morning, afternoon, or evening`);
    }

    const hashState = await this.getHashState();
    return hashState.lastHashes[slot] || null;
  }

  /**
   * Get pending slots that missed their scheduled time
   * @param {number} now - Current timestamp (default: Date.now())
   * @param {number} graceMs - Grace period in milliseconds for missed runs
   * @returns {string[]} Array of slot names that are pending
   */
  async getPendingSlots(now = Date.now(), graceMs = 60 * 60 * 1000) {
    const state = await this.getState();
    const pendingSlots = [];
    
    // EST slot times (hours in 24h format)
    const slotTimes = {
      morning: 8,   // 8:00 AM EST
      afternoon: 14, // 2:00 PM EST  
      evening: 20   // 8:00 PM EST
    };

    // Current date in EST
    const moment = require('moment-timezone');
    const nowEST = moment(now).tz('America/New_York');
    const todayEST = nowEST.clone().startOf('day');

    for (const [slot, hour] of Object.entries(slotTimes)) {
      // Calculate today's scheduled time for this slot
      const scheduledTime = todayEST.clone().hour(hour).minute(0).second(0);
      const scheduledTimestamp = scheduledTime.valueOf();
      
      // Check if slot time has passed and we haven't run it today
      const timeSinceScheduled = now - scheduledTimestamp;
      const lastRunTime = state.lastRuns[slot];
      
      // Conditions for a pending slot:
      // 1. Scheduled time has passed (positive timeSinceScheduled)
      // 2. Within grace period 
      // 3. Last run was before today's scheduled time
      const withinGracePeriod = timeSinceScheduled > 0 && timeSinceScheduled <= graceMs;
      const notRunToday = lastRunTime < scheduledTimestamp;
      
      if (withinGracePeriod && notRunToday) {
        pendingSlots.push(slot);
        console.log(`⚠️ Detected missed ${slot} slot: scheduled=${scheduledTime.format()}, lastRun=${new Date(lastRunTime).toISOString()}, gracePeriod=${graceMs/60000}min`);
      }
    }

    return pendingSlots;
  }

  /**
   * Check if a slot was run recently (for double-post protection)
   * @param {string} slot - morning|afternoon|evening
   * @param {number} withinMs - Time window to check (default: 10 minutes)
   * @returns {boolean} True if slot was run recently
   */
  async wasRecentlyRun(slot, withinMs = 10 * 60 * 1000) {
    const state = await this.getState();
    const lastRunTime = state.lastRuns[slot];
    const timeSinceRun = Date.now() - lastRunTime;
    
    return timeSinceRun < withinMs;
  }

  /**
   * Check if content hash matches the last posted hash (duplicate content protection)
   * @param {string} slot - morning|afternoon|evening  
   * @param {string} currentHash - Hash of current content
   * @returns {boolean} True if hash matches last posted hash
   */
  async isDuplicateContent(slot, currentHash) {
    const hashState = await this.getHashState();
    const lastHash = hashState.lastHashes[slot];
    
    return lastHash === currentHash && lastHash !== '';
  }

  /**
   * Get diagnostic information about schedule state
   * @returns {Object} Diagnostic information for logging
   */
  async getDiagnostics() {
    const state = await this.getState();
    const hashState = await this.getHashState();
    const moment = require('moment-timezone');
    
    const diagnostics = {
      dataDir: this.dataDir,
      lastRuns: {},
      lastHashes: {},
      pendingSlotsCount: (await this.getPendingSlots()).length
    };

    // Format timestamps for readability
    for (const [slot, timestamp] of Object.entries(state.lastRuns)) {
      if (timestamp > 0) {
        diagnostics.lastRuns[slot] = {
          timestamp,
          formatted: moment(timestamp).tz('America/New_York').format('YYYY-MM-DD HH:mm:ss z'),
          hoursAgo: Math.round((Date.now() - timestamp) / (1000 * 60 * 60))
        };
      } else {
        diagnostics.lastRuns[slot] = { timestamp: 0, formatted: 'Never', hoursAgo: Infinity };
      }
      
      diagnostics.lastHashes[slot] = hashState.lastHashes[slot]?.substring(0, 8) + '...' || 'None';
    }

    return diagnostics;
  }
}

// Export singleton instance
module.exports = new ScheduleState();