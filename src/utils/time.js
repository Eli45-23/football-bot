const { DateTime } = require('luxon');

/**
 * Timezone-aware time utilities for NFL Discord Bot
 * Uses Luxon for reliable timezone handling with DST support
 */

const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * Convert ISO string or milliseconds to DateTime in specified timezone
 * @param {string|number} isoOrMs - ISO string or milliseconds timestamp
 * @param {string} tz - Target timezone
 * @returns {DateTime} DateTime in specified timezone
 */
function toTZ(isoOrMs, tz) {
  if (typeof isoOrMs === 'string') {
    return DateTime.fromISO(isoOrMs).setZone(tz);
  }
  return DateTime.fromMillis(isoOrMs).setZone(tz);
}

/**
 * Get current time in specified timezone
 * @param {string} tz - Target timezone
 * @returns {DateTime} Current DateTime in specified timezone
 */
function nowTZ(tz) {
  return DateTime.now().setZone(tz);
}

/**
 * Format DateTime to short date format (e.g., "Aug 16")
 * @param {DateTime} dt - DateTime to format
 * @returns {string} Short date string
 */
function fmtDateShort(dt) {
  return dt.toFormat('MMM d');
}

/**
 * Format duration in milliseconds to human readable format (e.g., "85.3s")
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration string
 */
function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else if (ms < 3600000) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  } else {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.round((ms % 3600000) / 60000);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
}

/**
 * TimeUtils class for backward compatibility and additional functionality
 */
class TimeUtils {
  constructor() {
    this.timezone = process.env.TIMEZONE || DEFAULT_TIMEZONE;
    
    // Slot definitions (24h format)
    this.slotTimes = {
      morning: { hour: 8, minute: 0, name: 'Morning Update' },
      afternoon: { hour: 14, minute: 0, name: 'Afternoon Update' }, 
      evening: { hour: 20, minute: 0, name: 'Evening Update' }
    };
    
    console.log(`⏰ TimeUtils initialized with timezone: ${this.timezone}`);
  }

  /**
   * Get current time in configured timezone
   * @returns {DateTime} Current time in EST/EDT
   */
  now() {
    return DateTime.now().setZone(this.timezone);
  }

  /**
   * Convert timestamp to timezone-aware DateTime
   * @param {number|string|Date} timestamp - Input timestamp
   * @returns {DateTime} DateTime in configured timezone
   */
  fromTimestamp(timestamp) {
    return DateTime.fromMillis(
      typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime()
    ).setZone(this.timezone);
  }

  /**
   * Format timestamp for display (e.g., "Aug 12, 2:30 PM EST")
   * @param {number|string|Date} timestamp - Input timestamp
   * @param {string} format - Format style ('short', 'medium', 'full')
   * @returns {string} Formatted time string
   */
  formatTimestamp(timestamp, format = 'medium') {
    const dt = this.fromTimestamp(timestamp);
    
    switch (format) {
      case 'short':
        return dt.toFormat('MMM dd, h:mm a');
      case 'medium':
        return dt.toFormat('MMM dd, h:mm a ZZZZ');
      case 'full':
        return dt.toFormat('EEEE, MMMM dd, yyyy \'at\' h:mm a ZZZZ');
      case 'iso':
        return dt.toISO();
      case 'date-only':
        return dt.toFormat('MMM dd, yyyy');
      case 'time-only':
        return dt.toFormat('h:mm a ZZZZ');
      default:
        return dt.toFormat('MMM dd, h:mm a ZZZZ');
    }
  }

  /**
   * Get hours ago from timestamp (e.g., "2h ago", "1d ago")
   * @param {number|string|Date} timestamp - Input timestamp
   * @returns {string} Relative time string
   */
  hoursAgo(timestamp) {
    const dt = this.fromTimestamp(timestamp);
    const now = this.now();
    const diffHours = now.diff(dt, 'hours').hours;
    
    if (diffHours < 1) {
      const diffMinutes = Math.round(now.diff(dt, 'minutes').minutes);
      return diffMinutes <= 1 ? 'just now' : `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      return `${Math.round(diffHours)}h ago`;
    } else {
      const diffDays = Math.round(diffHours / 24);
      return `${diffDays}d ago`;
    }
  }

  /**
   * Calculate next occurrence of a slot time
   * @param {string} slotName - morning|afternoon|evening
   * @returns {DateTime} Next occurrence
   */
  getNextSlotTime(slotName) {
    if (!this.slotTimes[slotName]) {
      throw new Error(`Invalid slot: ${slotName}`);
    }

    const { hour, minute } = this.slotTimes[slotName];
    const now = this.now();
    
    let nextRun = now.set({ hour, minute, second: 0, millisecond: 0 });
    
    // If time has passed today, schedule for tomorrow
    if (nextRun <= now) {
      nextRun = nextRun.plus({ days: 1 });
    }
    
    return nextRun;
  }

  /**
   * Check if timestamp is within recent hours threshold
   * @param {number|string|Date} timestamp - Input timestamp
   * @param {number} thresholdHours - Hours threshold
   * @returns {boolean} True if within threshold
   */
  isWithinHours(timestamp, thresholdHours) {
    const dt = this.fromTimestamp(timestamp);
    const now = this.now();
    const diffHours = now.diff(dt, 'hours').hours;
    
    return diffHours <= thresholdHours;
  }

  /**
   * Get lookback hours for a specific slot
   * @param {string} slotName - morning|afternoon|evening
   * @returns {number} Lookback hours for slot
   */
  getLookbackHours(slotName) {
    const lookbackMap = {
      morning: parseInt(process.env.LOOKBACK_HOURS_MORNING || '24'),
      afternoon: parseInt(process.env.LOOKBACK_HOURS_AFTERNOON || '12'),
      evening: parseInt(process.env.LOOKBACK_HOURS_EVENING || '24')
    };
    
    return lookbackMap[slotName] || 24;
  }

  /**
   * Get breaking news lookback hours for evening slot
   * @param {string} slotName - Slot name
   * @returns {number} Breaking news lookback hours
   */
  getBreakingLookbackHours(slotName) {
    if (slotName === 'evening') {
      return parseInt(process.env.BREAKING_LOOKBACK_EVENING || '36');
    }
    return this.getLookbackHours(slotName);
  }

  /**
   * Calculate lookback timestamp for a slot
   * @param {string} slotName - morning|afternoon|evening
   * @param {boolean} isBreaking - Whether this is for breaking news
   * @returns {DateTime} Lookback timestamp
   */
  getLookbackTimestamp(slotName, isBreaking = false) {
    const hours = isBreaking ? 
      this.getBreakingLookbackHours(slotName) : 
      this.getLookbackHours(slotName);
    
    return this.now().minus({ hours });
  }

  /**
   * Format date for game grouping (e.g., "Today", "Tomorrow", "Mon 8/14")
   * @param {number|string|Date} timestamp - Game timestamp
   * @returns {string} Formatted date group
   */
  formatGameDate(timestamp) {
    const dt = this.fromTimestamp(timestamp);
    const now = this.now();
    const today = now.startOf('day');
    const gameDate = dt.startOf('day');
    
    const diffDays = gameDate.diff(today, 'days').days;
    
    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Tomorrow';
    } else if (diffDays <= 6) {
      return dt.toFormat('EEE M/d');
    } else {
      return dt.toFormat('MMM dd');
    }
  }

  /**
   * Check if timestamp is in the future
   * @param {number|string|Date} timestamp - Input timestamp
   * @returns {boolean} True if in future
   */
  isFuture(timestamp) {
    return this.fromTimestamp(timestamp) > this.now();
  }

  /**
   * Generate run label with proper formatting
   * @param {string} slotName - morning|afternoon|evening
   * @param {boolean} isCatchup - Whether this is a catch-up run
   * @returns {string} Formatted run label
   */
  getRunLabel(slotName, isCatchup = false) {
    const slotConfig = this.slotTimes[slotName];
    if (!slotConfig) return slotName;
    
    const prefix = isCatchup ? 'Catch-up ' : '';
    return `${prefix}${slotConfig.name}`;
  }

  /**
   * Get diagnostic info for current timezone
   * @returns {Object} Timezone diagnostic information
   */
  getDiagnostics() {
    const now = this.now();
    
    return {
      timezone: this.timezone,
      currentTime: now.toISO(),
      currentTimeFormatted: this.formatTimestamp(now, 'full'),
      isDST: now.isInDST,
      offset: now.offset,
      offsetName: now.offsetNameShort,
      slotTimes: Object.entries(this.slotTimes).reduce((acc, [slot, config]) => {
        const nextTime = this.getNextSlotTime(slot);
        acc[slot] = {
          time: `${config.hour.toString().padStart(2, '0')}:${config.minute.toString().padStart(2, '0')}`,
          nextOccurrence: nextTime.toISO(),
          hoursUntilNext: Math.round(nextTime.diff(now, 'hours').hours * 10) / 10
        };
        return acc;
      }, {})
    };
  }
}

// Export singleton instance
const timeUtils = new TimeUtils();

// Export both named functions and instance
module.exports = timeUtils;
module.exports.toTZ = toTZ;
module.exports.nowTZ = nowTZ;
module.exports.fmtDateShort = fmtDateShort;
module.exports.formatDuration = formatDuration;