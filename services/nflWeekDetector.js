const { nowTZ } = require('../src/utils/time');

/**
 * NFL Week Detection Service
 * Determines current NFL week and provides week-based game filtering
 */

const DEFAULT_TIMEZONE = 'America/New_York';

class NFLWeekDetector {
  constructor() {
    // 2025 NFL Preseason schedule (user-corrected: we are in Week 3 going to Week 4)
    this.preseasonSchedule = {
      week1: { start: '2025-08-01', end: '2025-08-05', label: 'Preseason Week 1' },
      week2: { start: '2025-08-08', end: '2025-08-12', label: 'Preseason Week 2' },
      week3: { start: '2025-08-15', end: '2025-08-19', label: 'Preseason Week 3' },
      week4: { start: '2025-08-22', end: '2025-08-26', label: 'Preseason Week 4' }
    };
    
    // 2025 Regular season starts around September 4
    this.regularSeasonStart = '2025-09-04';
    
    console.log('📅 NFL Week Detector initialized for 2025 season');
  }

  /**
   * Get current NFL week information
   * @returns {Object} Current week details
   */
  getCurrentWeek() {
    const now = nowTZ(DEFAULT_TIMEZONE);
    const today = now.toFormat('yyyy-MM-dd');
    
    console.log(`📅 Detecting NFL week for: ${today}`);
    
    // Check preseason weeks
    for (const [weekKey, weekInfo] of Object.entries(this.preseasonSchedule)) {
      if (today >= weekInfo.start && today <= weekInfo.end) {
        console.log(`✅ Current week: ${weekInfo.label} (${weekInfo.start} to ${weekInfo.end})`);
        return {
          type: 'preseason',
          week: weekKey,
          label: weekInfo.label,
          start: weekInfo.start,
          end: weekInfo.end,
          isCurrentWeek: true
        };
      }
    }
    
    // Check if we're in regular season
    if (today >= this.regularSeasonStart) {
      // Calculate regular season week (simplified)
      const seasonStart = new Date(this.regularSeasonStart);
      const currentDate = new Date(today);
      const diffDays = Math.floor((currentDate - seasonStart) / (1000 * 60 * 60 * 24));
      const weekNumber = Math.floor(diffDays / 7) + 1;
      
      const label = `Week ${weekNumber}`;
      console.log(`✅ Current week: ${label} (Regular Season)`);
      
      return {
        type: 'regular',
        week: `week${weekNumber}`,
        label: label,
        start: null, // Calculate if needed
        end: null,
        isCurrentWeek: true
      };
    }
    
    // Fallback: Determine closest preseason week
    console.log(`⚠️ Date ${today} not in defined ranges, determining closest week...`);
    
    // Before preseason starts
    if (today < this.preseasonSchedule.week1.start) {
      return {
        type: 'preseason',
        week: 'week1',
        label: 'Preseason Week 1 (upcoming)',
        start: this.preseasonSchedule.week1.start,
        end: this.preseasonSchedule.week1.end,
        isCurrentWeek: false
      };
    }
    
    // After preseason but before regular season
    if (today > this.preseasonSchedule.week4.end && today < this.regularSeasonStart) {
      return {
        type: 'preseason',
        week: 'week4',
        label: 'Preseason Week 4 (recently ended)',
        start: this.preseasonSchedule.week4.start,
        end: this.preseasonSchedule.week4.end,
        isCurrentWeek: false
      };
    }
    
    // Default fallback
    return {
      type: 'unknown',
      week: 'unknown',
      label: 'Unknown Week',
      start: null,
      end: null,
      isCurrentWeek: false
    };
  }

  /**
   * Get next week information
   * @returns {Object} Next week details
   */
  getNextWeek() {
    const currentWeek = this.getCurrentWeek();
    
    if (currentWeek.type === 'preseason') {
      // Map to next preseason week
      const weekOrder = ['week1', 'week2', 'week3', 'week4'];
      const currentIndex = weekOrder.indexOf(currentWeek.week);
      
      if (currentIndex < weekOrder.length - 1) {
        const nextWeekKey = weekOrder[currentIndex + 1];
        const nextWeekInfo = this.preseasonSchedule[nextWeekKey];
        
        return {
          type: 'preseason',
          week: nextWeekKey,
          label: nextWeekInfo.label,
          start: nextWeekInfo.start,
          end: nextWeekInfo.end,
          isCurrentWeek: false
        };
      } else {
        // Next week is regular season Week 1
        return {
          type: 'regular',
          week: 'week1',
          label: 'Week 1',
          start: this.regularSeasonStart,
          end: null,
          isCurrentWeek: false
        };
      }
    }
    
    if (currentWeek.type === 'regular') {
      // Calculate next regular season week
      const currentWeekNum = parseInt(currentWeek.week.replace('week', ''));
      const nextWeekNum = currentWeekNum + 1;
      
      return {
        type: 'regular',
        week: `week${nextWeekNum}`,
        label: `Week ${nextWeekNum}`,
        start: null,
        end: null,
        isCurrentWeek: false
      };
    }
    
    return currentWeek; // Fallback
  }

  /**
   * Get date range for current week games
   * @returns {Object} Start and end dates for current week
   */
  getCurrentWeekDateRange() {
    const currentWeek = this.getCurrentWeek();
    const now = nowTZ(DEFAULT_TIMEZONE);
    
    if (currentWeek.start && currentWeek.end) {
      return {
        start: new Date(currentWeek.start),
        end: new Date(currentWeek.end + 'T23:59:59'),
        label: currentWeek.label
      };
    }
    
    // Fallback: Use current date +/- 3 days
    const start = now.minus({ days: 3 }).startOf('day').toJSDate();
    const end = now.plus({ days: 4 }).endOf('day').toJSDate();
    
    return {
      start,
      end,
      label: 'Current Week (estimated)'
    };
  }

  /**
   * Get date range that includes current and next week
   * @returns {Object} Start and end dates for current + next week
   */
  getCurrentAndNextWeekDateRange() {
    const currentWeek = this.getCurrentWeek();
    const nextWeek = this.getNextWeek();
    const now = nowTZ(DEFAULT_TIMEZONE);
    
    let start, end;
    
    if (currentWeek.start) {
      start = new Date(currentWeek.start);
    } else {
      start = now.startOf('day').toJSDate();
    }
    
    if (nextWeek.end) {
      end = new Date(nextWeek.end + 'T23:59:59');
    } else if (nextWeek.start) {
      // Add 7 days to next week start
      end = new Date(new Date(nextWeek.start).getTime() + (7 * 24 * 60 * 60 * 1000));
    } else {
      // Fallback: 14 days from now
      end = now.plus({ days: 14 }).endOf('day').toJSDate();
    }
    
    return {
      start,
      end,
      label: `${currentWeek.label} + ${nextWeek.label}`
    };
  }

  /**
   * Check if a game timestamp falls within current week
   * @param {number} timestamp - Game timestamp in milliseconds
   * @returns {boolean} True if game is in current week
   */
  isGameInCurrentWeek(timestamp) {
    const range = this.getCurrentWeekDateRange();
    return timestamp >= range.start.getTime() && timestamp <= range.end.getTime();
  }

  /**
   * Get diagnostic information
   * @returns {Object} Diagnostic data
   */
  getDiagnostics() {
    const currentWeek = this.getCurrentWeek();
    const nextWeek = this.getNextWeek();
    const currentRange = this.getCurrentWeekDateRange();
    const bothWeeksRange = this.getCurrentAndNextWeekDateRange();
    
    return {
      today: nowTZ(DEFAULT_TIMEZONE).toFormat('yyyy-MM-dd'),
      currentWeek,
      nextWeek,
      currentWeekRange: {
        start: currentRange.start.toISOString().split('T')[0],
        end: currentRange.end.toISOString().split('T')[0],
        label: currentRange.label
      },
      bothWeeksRange: {
        start: bothWeeksRange.start.toISOString().split('T')[0],
        end: bothWeeksRange.end.toISOString().split('T')[0],
        label: bothWeeksRange.label
      }
    };
  }
}

module.exports = new NFLWeekDetector();