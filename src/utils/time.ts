import { DateTime } from 'luxon';

/**
 * Timezone-aware time utilities for NFL Discord Bot
 * Uses Luxon for reliable timezone handling with DST support
 */

const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * Convert ISO string or milliseconds to DateTime in specified timezone
 * @param isoOrMs - ISO string or milliseconds timestamp
 * @param tz - Target timezone
 * @returns DateTime in specified timezone
 */
export function toTZ(isoOrMs: string | number, tz: string): DateTime {
  if (typeof isoOrMs === 'string') {
    return DateTime.fromISO(isoOrMs).setZone(tz);
  }
  return DateTime.fromMillis(isoOrMs).setZone(tz);
}

/**
 * Get current time in specified timezone
 * @param tz - Target timezone
 * @returns Current DateTime in specified timezone
 */
export function nowTZ(tz: string): DateTime {
  return DateTime.now().setZone(tz);
}

/**
 * Format DateTime to short date format (e.g., "Aug 16")
 * @param dt - DateTime to format
 * @returns Short date string
 */
export function fmtDateShort(dt: DateTime): string {
  return dt.toFormat('MMM d');
}

/**
 * Format duration in milliseconds to human readable format (e.g., "85.3s")
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string
 */
export function formatDuration(ms: number): string {
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
export class TimeUtils {
  private timezone: string;
  private slotTimes: Record<string, { hour: number; minute: number; name: string }>;

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
   */
  now(): DateTime {
    return nowTZ(this.timezone);
  }

  /**
   * Convert timestamp to timezone-aware DateTime
   */
  fromTimestamp(timestamp: number | string | Date): DateTime {
    const ms = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
    return toTZ(ms, this.timezone);
  }

  /**
   * Format timestamp for display (e.g., "Aug 12, 2:30 PM EST")
   */
  formatTimestamp(timestamp: number | string | Date, format: string = 'medium'): string {
    const dt = this.fromTimestamp(timestamp);
    
    switch (format) {
      case 'short':
        return dt.toFormat('MMM dd, h:mm a');
      case 'medium':
        return dt.toFormat('MMM dd, h:mm a ZZZZ');
      case 'full':
        return dt.toFormat('EEEE, MMMM dd, yyyy \'at\' h:mm a ZZZZ');
      case 'iso':
        return dt.toISO() || '';
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
   */
  hoursAgo(timestamp: number | string | Date): string {
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
   */
  getNextSlotTime(slotName: string): DateTime {
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
   */
  isWithinHours(timestamp: number | string | Date, thresholdHours: number): boolean {
    const dt = this.fromTimestamp(timestamp);
    const now = this.now();
    const diffHours = now.diff(dt, 'hours').hours;
    
    return diffHours <= thresholdHours;
  }

  /**
   * Get lookback hours for a specific slot
   */
  getLookbackHours(slotName: string): number {
    const lookbackMap: Record<string, number> = {
      morning: parseInt(process.env.LOOKBACK_HOURS_MORNING || '24'),
      afternoon: parseInt(process.env.LOOKBACK_HOURS_AFTERNOON || '12'),
      evening: parseInt(process.env.LOOKBACK_HOURS_EVENING || '24')
    };
    
    return lookbackMap[slotName] || 24;
  }

  /**
   * Get breaking news lookback hours for evening slot
   */
  getBreakingLookbackHours(slotName: string): number {
    if (slotName === 'evening') {
      return parseInt(process.env.BREAKING_LOOKBACK_EVENING || '36');
    }
    return this.getLookbackHours(slotName);
  }

  /**
   * Calculate lookback timestamp for a slot
   */
  getLookbackTimestamp(slotName: string, isBreaking: boolean = false): DateTime {
    const hours = isBreaking ? 
      this.getBreakingLookbackHours(slotName) : 
      this.getLookbackHours(slotName);
    
    return this.now().minus({ hours });
  }

  /**
   * Format date for game grouping (e.g., "Today", "Tomorrow", "Mon 8/14")
   */
  formatGameDate(timestamp: number | string | Date): string {
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
   */
  isFuture(timestamp: number | string | Date): boolean {
    return this.fromTimestamp(timestamp) > this.now();
  }

  /**
   * Generate run label with proper formatting
   */
  getRunLabel(slotName: string, isCatchup: boolean = false): string {
    const slotConfig = this.slotTimes[slotName];
    if (!slotConfig) return slotName;
    
    const prefix = isCatchup ? 'Catch-up ' : '';
    return `${prefix}${slotConfig.name}`;
  }

  /**
   * Format duration using the exported function
   */
  formatDuration(ms: number): string {
    return formatDuration(ms);
  }

  /**
   * Get diagnostic info for current timezone
   */
  getDiagnostics(): Record<string, any> {
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
      }, {} as Record<string, any>)
    };
  }
}

// Export singleton instance for backward compatibility
const timeUtils = new TimeUtils();
export default timeUtils;

// CommonJS export for existing imports
module.exports = timeUtils;