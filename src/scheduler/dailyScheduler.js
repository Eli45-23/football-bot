const moment = require('moment-timezone');
const scheduleState = require('../state/scheduleState');
const offlineQueue = require('../posting/offlineQueue');

/**
 * Resilient Daily Scheduler for NFL Updates
 * Replaces cron-based scheduling with connection-aware scheduling
 * Handles missed runs, reconnection catch-up, and DST transitions
 */
class DailyScheduler {
  constructor() {
    this.initialized = false;
    this.client = null;
    this.dailyUpdater = null;
    this.activeTimeouts = new Map(); // Track active timeouts for each slot
    this.runningSlots = new Set(); // Mutex to prevent overlapping runs
    
    // EST timezone for all scheduling
    this.timezone = 'America/New_York';
    
    // Slot definitions with times in 24h format (twice daily)
    this.slots = {
      morning: { hour: 8, minute: 0, name: 'Morning Update' },
      evening: { hour: 20, minute: 0, name: 'Evening Update' }
    };
    
    console.log('📅 Daily Scheduler initialized');
  }

  /**
   * Initialize the scheduler with Discord client and updater
   * Singleton pattern - only allows one initialization
   * @param {Client} client - Discord client instance
   * @param {DailyUpdater} dailyUpdater - Daily updater instance
   */
  async initScheduler(client, dailyUpdater) {
    if (this.initialized) {
      console.log('⚠️ Scheduler already initialized, skipping...');
      return;
    }

    this.client = client;
    this.dailyUpdater = dailyUpdater;
    this.initialized = true;

    console.log('🚀 Initializing resilient daily scheduler...');
    console.log(`📍 Timezone: ${this.timezone}`);
    console.log(`🕐 Scheduled times: 08:00, 20:00 EST (twice daily)`);

    // Schedule all slots
    for (const [slotName] of Object.entries(this.slots)) {
      await this.scheduleNextRun(slotName);
    }

    console.log('✅ Resilient scheduler configured for all slots');
  }

  /**
   * Calculate next occurrence of a slot and schedule it
   * @param {string} slotName - morning|afternoon|evening
   */
  async scheduleNextRun(slotName) {
    if (!this.slots[slotName]) {
      throw new Error(`Invalid slot: ${slotName}`);
    }

    const { hour, minute, name } = this.slots[slotName];
    const now = moment().tz(this.timezone);
    
    // Calculate next occurrence
    let nextRun = now.clone()
      .hour(hour)
      .minute(minute)
      .second(0)
      .millisecond(0);

    // If time has passed today, schedule for tomorrow
    if (nextRun.isSameOrBefore(now)) {
      nextRun.add(1, 'day');
    }

    const msUntilRun = nextRun.valueOf() - now.valueOf();
    const hoursUntilRun = Math.round(msUntilRun / (1000 * 60 * 60) * 10) / 10;

    console.log(`⏰ Scheduled ${slotName}: ${nextRun.format('YYYY-MM-DD HH:mm:ss z')} (in ${hoursUntilRun}h)`);

    // Clear any existing timeout for this slot
    if (this.activeTimeouts.has(slotName)) {
      clearTimeout(this.activeTimeouts.get(slotName));
    }

    // Schedule the run
    const timeoutId = setTimeout(async () => {
      await this.executeSlot(slotName);
      // Schedule next occurrence (tomorrow)
      await this.scheduleNextRun(slotName);
    }, msUntilRun);

    this.activeTimeouts.set(slotName, timeoutId);
  }

  /**
   * Execute a scheduled slot with safety checks and connection awareness
   * @param {string} slotName - morning|afternoon|evening
   */
  async executeSlot(slotName) {
    const now = moment().tz(this.timezone);
    const clientReady = this.client && this.client.isReady && this.client.isReady();
    
    console.log(`🎯 [SCHEDULED EXECUTION] ${slotName.toUpperCase()} SLOT TRIGGERED`);
    console.log(`   📅 Time: ${now.format('YYYY-MM-DD HH:mm:ss z')}`);
    console.log(`   🤖 Discord Client Ready: ${clientReady}`);
    console.log(`   🌐 WebSocket Status: ${this.client?.ws?.status || 'Unknown'}`);

    if (!clientReady) {
      console.log(`❌ [CRITICAL] Client not ready for ${slotName} slot - marking as pending`);
      await this.markSlotAsPending(slotName);
      return;
    }

    console.log(`✅ [EXECUTION] Starting ${slotName} slot execution...`);
    // Use safeRunSlot for mutex protection and error handling
    await this.safeRunSlot(slotName);
  }

  /**
   * Mark a slot as pending when client is not ready
   * This creates a pending marker that will be caught during reconnection
   * @param {string} slotName - morning|afternoon|evening
   */
  async markSlotAsPending(slotName) {
    // We don't actually mark as pending in state - the getPendingSlots logic
    // will detect this by comparing current time vs last run time
    console.log(`📝 ${slotName} slot will be detected as pending on next connection check`);
  }

  /**
   * Safely run a slot with mutex protection and comprehensive error handling
   * @param {string} slotName - morning|afternoon|evening
   */
  async safeRunSlot(slotName) {
    // Mutex check - prevent overlapping runs of the same slot
    if (this.runningSlots.has(slotName)) {
      console.log(`⚠️ [MUTEX] ${slotName} slot already running, skipping...`);
      return;
    }

    this.runningSlots.add(slotName);
    const startTime = Date.now();

    try {
      console.log(`🚀 [EXECUTION] Starting ${slotName} update run...`);
      console.log(`   📊 Active slots: ${Array.from(this.runningSlots).join(', ')}`);
      console.log(`   💾 State check: Checking if recently run...`);

      // Final client ready check
      if (!this.client || !this.client.isReady()) {
        throw new Error('Discord client not ready');
      }

      console.log(`✅ [VALIDATION] Client ready, calling dailyUpdater...`);

      // Call the existing daily updater
      await this.dailyUpdater.runScheduledUpdate(slotName);

      console.log(`📝 [SUCCESS] DailyUpdater completed, recording successful run...`);

      // Record successful run in persistent state
      await scheduleState.setRun(slotName, Date.now());

      const duration = Date.now() - startTime;
      console.log(`🎉 [COMPLETE] ${slotName} update completed successfully in ${duration}ms`);

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`💥 [FAILURE] ${slotName} update failed after ${duration}ms`);
      console.error(`   ❌ Error: ${error.message}`);
      console.error(`   📍 Stack: ${error.stack?.split('\n')[0]}`);
      
      // Log additional context for debugging
      console.error(`🔍 [DEBUG] Error context:`, {
        slotName,
        clientReady: this.client && this.client.isReady(),
        wsStatus: this.client?.ws?.status,
        errorCode: error.code,
        errorName: error.name,
        isDiscordAPIError: error.code && error.code >= 10000,
        isNetworkError: error.code === 'NETWORK_ERROR' || error.code === 'ENOTFOUND'
      });

      // Don't record the run as successful if it failed
      // This allows it to be retried on reconnection
      console.log(`🔄 [RETRY] ${slotName} run NOT recorded as successful - will retry on reconnection`);

    } finally {
      this.runningSlots.delete(slotName);
      console.log(`🔓 [CLEANUP] Released ${slotName} slot mutex`);
    }
  }

  /**
   * Check for missed runs and execute catch-up
   * Called on client ready and resume events
   */
  async checkMissedRuns() {
    const graceMs = (parseInt(process.env.MISSED_RUN_GRACE_MIN) || 60) * 60 * 1000;
    const pendingSlots = await scheduleState.getPendingSlots(Date.now(), graceMs);

    if (pendingSlots.length === 0) {
      console.log('✅ No missed runs detected');
      return;
    }

    console.log(`🔄 Found ${pendingSlots.length} missed runs: ${pendingSlots.join(', ')}`);

    // Execute catch-up runs for each pending slot
    for (const slotName of pendingSlots) {
      console.log(`⚡ Running catch-up for missed ${slotName} slot...`);
      await this.safeRunSlot(slotName);
      
      // Small delay between catch-up runs to avoid overwhelming Discord
      await this.sleep(2000);
    }

    console.log('✅ Missed run catch-up completed');
  }

  /**
   * Get scheduler status for monitoring and debugging
   * @returns {Object} Current scheduler status
   */
  async getStatus() {
    const now = moment().tz(this.timezone);
    const scheduleStateDiag = await scheduleState.getDiagnostics();
    const queueStatus = offlineQueue.getQueueStatus();

    const status = {
      initialized: this.initialized,
      timezone: this.timezone,
      currentTime: now.format('YYYY-MM-DD HH:mm:ss z'),
      clientReady: this.client && this.client.isReady(),
      activeSlots: Object.keys(this.slots),
      runningSlots: Array.from(this.runningSlots),
      scheduledTimeouts: this.activeTimeouts.size,
      offlineQueue: queueStatus,
      scheduleState: scheduleStateDiag
    };

    // Calculate next run times
    status.nextRuns = {};
    for (const [slotName, slotConfig] of Object.entries(this.slots)) {
      let nextRun = now.clone()
        .hour(slotConfig.hour)
        .minute(slotConfig.minute)
        .second(0);
        
      if (nextRun.isSameOrBefore(now)) {
        nextRun.add(1, 'day');
      }
      
      status.nextRuns[slotName] = {
        time: nextRun.format('YYYY-MM-DD HH:mm:ss z'),
        hoursFromNow: Math.round((nextRun.valueOf() - now.valueOf()) / (1000 * 60 * 60) * 10) / 10
      };
    }

    return status;
  }

  /**
   * Emergency stop all scheduled runs (for shutdown or testing)
   */
  stopScheduler() {
    console.log('🛑 Stopping daily scheduler...');

    // Clear all active timeouts
    for (const [slotName, timeoutId] of this.activeTimeouts.entries()) {
      clearTimeout(timeoutId);
      console.log(`⏹️ Cancelled scheduled ${slotName} run`);
    }

    this.activeTimeouts.clear();
    this.runningSlots.clear();
    this.initialized = false;

    console.log('✅ Daily scheduler stopped');
  }

  /**
   * Force a specific slot to run immediately (for testing)
   * @param {string} slotName - morning|afternoon|evening
   */
  async forceRunSlot(slotName) {
    if (!this.slots[slotName]) {
      throw new Error(`Invalid slot: ${slotName}`);
    }

    console.log(`🔧 Force running ${slotName} slot for testing...`);
    await this.safeRunSlot(slotName);
  }

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds to sleep
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let schedulerInstance = null;

/**
 * Get or create the singleton scheduler instance
 * @returns {DailyScheduler} Scheduler instance
 */
function getScheduler() {
  if (!schedulerInstance) {
    schedulerInstance = new DailyScheduler();
  }
  return schedulerInstance;
}

module.exports = {
  getScheduler,
  DailyScheduler
};