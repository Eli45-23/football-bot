const axios = require('axios');
const { JSDOM } = require('jsdom');
const { toTZ, nowTZ, fmtDateShort } = require('../src/utils/time');

/**
 * ESPN NFL Schedule Scraper Service
 * Secondary fallback for game schedule data when TheSportsDB fails
 */

const DEFAULT_TIMEZONE = 'America/New_York';

class ESPNScheduleService {
  constructor() {
    this.scheduleUrl = 'https://www.espn.com/nfl/schedule';
    this.lastFetchTime = null;
    
    console.log('📋 ESPN Schedule service initialized');
  }

  /**
   * Fetch current NFL schedule from ESPN
   * @param {Date} startDate - Start date for schedule window
   * @param {Date} endDate - End date for schedule window
   * @returns {Promise<Object>} Formatted schedule with future games only
   */
  async fetchSchedule(startDate, endDate) {
    try {
      console.log(`🏈 Fetching ESPN NFL schedule...`);
      console.log(`   📅 Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
      
      const response = await axios.get(this.scheduleUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NFL Discord Bot/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate'
        }
      });

      const dom = new JSDOM(response.data);
      const document = dom.window.document;
      
      const rawGames = this.parseScheduleTable(document);
      console.log(`   📊 Raw games parsed: ${rawGames.length}`);
      
      // Filter by date range and future-only
      const filteredGames = this.filterGamesByDateRange(rawGames, startDate, endDate);
      console.log(`   ⏰ After date filtering: ${filteredGames.length}`);
      
      // Sort by date (earliest first)
      const sortedGames = this.sortGamesByDate(filteredGames);
      
      // Format for Discord display
      const formattedGames = this.formatGamesForDiscord(sortedGames);
      
      console.log(`✅ ESPN schedule: ${formattedGames.length} future games found`);
      
      this.lastFetchTime = new Date();
      
      return {
        games: formattedGames,
        totalCount: formattedGames.length,
        source: 'ESPN Schedule',
        dateRange: { start: startDate, end: endDate }
      };
      
    } catch (error) {
      console.log(`❌ ESPN schedule fetch failed: ${error.message}`);
      return {
        games: [],
        totalCount: 0,
        source: 'ESPN Schedule (failed)',
        error: error.message
      };
    }
  }

  /**
   * Parse ESPN schedule table from DOM
   */
  parseScheduleTable(document) {
    const games = [];
    
    // ESPN uses various selectors for schedule tables
    const tableSelectors = [
      '.ResponsiveTable tbody tr', // Main schedule table
      '.Table__TR tbody tr',
      '[data-module="schedule"] tbody tr',
      '.schedule-table tbody tr',
      '.game-schedule tbody tr'
    ];
    
    let rows = [];
    for (const selector of tableSelectors) {
      rows = document.querySelectorAll(selector);
      if (rows.length > 0) {
        console.log(`   🎯 Found ${rows.length} schedule rows with selector: ${selector}`);
        break;
      }
    }
    
    // Fallback: look for any table rows that might contain games
    if (rows.length === 0) {
      console.log('   🔍 Trying fallback selectors...');
      const fallbackSelectors = [
        'tr[data-date]', // Rows with date attributes
        'tr.Table__TR', // ESPN table rows
        '.schedule tr', // Any schedule rows
        'tbody tr' // Generic table rows
      ];
      
      for (const selector of fallbackSelectors) {
        rows = document.querySelectorAll(selector);
        if (rows.length > 0) {
          console.log(`   🎯 Found ${rows.length} rows with fallback selector: ${selector}`);
          break;
        }
      }
    }
    
    if (rows.length === 0) {
      console.log('   ⚠️ No schedule table rows found');
      return [];
    }

    rows.forEach((row) => {
      try {
        const game = this.parseGameRow(row);
        if (game) {
          games.push(game);
        }
      } catch (error) {
        console.log(`   ❌ Error parsing game row: ${error.message}`);
      }
    });

    return games;
  }

  /**
   * Parse a single game row from ESPN schedule
   */
  parseGameRow(row) {
    try {
      // Look for team names in various ESPN formats
      const teamLinks = row.querySelectorAll('a[href*="/team/"]');
      const teams = Array.from(teamLinks).map(link => link.textContent.trim());
      
      if (teams.length < 2) {
        // Try alternative methods to find team names
        const teamCells = row.querySelectorAll('td, .team-name, .matchup');
        const allText = Array.from(teamCells).map(cell => cell.textContent.trim());
        
        // Look for team abbreviations or names in text
        const teamPattern = /\b(ARI|ATL|BAL|BUF|CAR|CHI|CIN|CLE|DAL|DEN|DET|GB|HOU|IND|JAX|KC|LV|LAC|LAR|MIA|MIN|NE|NO|NYG|NYJ|PHI|PIT|SF|SEA|TB|TEN|WAS)\b/g;
        const foundTeams = allText.join(' ').match(teamPattern);
        
        if (!foundTeams || foundTeams.length < 2) {
          return null; // Skip rows without clear team matchups
        }
        
        teams.push(...foundTeams.slice(0, 2));
      }
      
      // Extract date and time information
      let gameDate = null;
      let gameTime = null;
      
      // Look for date/time in various formats
      const cells = row.querySelectorAll('td');
      for (const cell of cells) {
        const text = cell.textContent.trim();
        
        // Date patterns: "Aug 17", "8/17", "August 17"
        const dateMatch = text.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}|\d{1,2}\/\d{1,2}/);
        if (dateMatch && !gameDate) {
          gameDate = dateMatch[0];
        }
        
        // Time patterns: "8:00 PM", "20:00", "8:00 PM EDT"
        const timeMatch = text.match(/\d{1,2}:\d{2}\s*(?:AM|PM|EDT|EST)?/i);
        if (timeMatch && !gameTime) {
          gameTime = timeMatch[0];
        }
      }
      
      // Try to get date from row attributes
      if (!gameDate) {
        const dateAttr = row.getAttribute('data-date') || 
                        row.getAttribute('data-game-date') ||
                        row.getAttribute('data-time');
        if (dateAttr) {
          gameDate = dateAttr;
        }
      }
      
      // Build game object
      const awayTeam = teams[0];
      const homeTeam = teams[1];
      
      if (!awayTeam || !homeTeam) {
        return null;
      }
      
      // Parse date/time to timestamp
      let timestamp = null;
      if (gameDate) {
        try {
          timestamp = this.parseGameDateTime(gameDate, gameTime);
        } catch (error) {
          console.log(`   ⚠️ Failed to parse date/time for ${awayTeam} @ ${homeTeam}: ${error.message}`);
        }
      }
      
      return {
        awayTeam: awayTeam,
        homeTeam: homeTeam,
        gameDate: gameDate,
        gameTime: gameTime,
        timestamp: timestamp,
        source: 'ESPN'
      };
      
    } catch (error) {
      console.log(`   ❌ Error parsing game row: ${error.message}`);
      return null;
    }
  }

  /**
   * Parse game date and time to timestamp
   */
  parseGameDateTime(dateStr, timeStr) {
    const currentYear = new Date().getFullYear();
    let fullDateTimeStr = dateStr;
    
    // Add time if provided
    if (timeStr) {
      fullDateTimeStr += ` ${timeStr}`;
    } else {
      // Default to 8:00 PM EST for games without specific times
      fullDateTimeStr += ' 8:00 PM';
    }
    
    // Add current year if not present
    if (!fullDateTimeStr.includes(currentYear.toString())) {
      fullDateTimeStr += ` ${currentYear}`;
    }
    
    const moment = require('moment-timezone');
    const parsed = moment.tz(fullDateTimeStr, DEFAULT_TIMEZONE);
    
    if (parsed.isValid()) {
      // Validate that this is a reasonable NFL game time
      const hour = parsed.hour();
      if (hour >= 13 && hour <= 23) { // 1 PM to 11 PM EST
        return parsed.valueOf();
      }
    }
    
    return null;
  }

  /**
   * Filter games by date range and future-only
   */
  filterGamesByDateRange(games, startDate, endDate) {
    const now = nowTZ(DEFAULT_TIMEZONE);
    
    return games.filter(game => {
      if (!game.timestamp) return false;
      
      const gameTime = toTZ(game.timestamp, DEFAULT_TIMEZONE);
      
      // Future-only filter
      if (gameTime < now) {
        return false;
      }
      
      // Date range filter
      const gameDate = gameTime.toMillis();
      return gameDate >= startDate.getTime() && gameDate <= endDate.getTime();
    });
  }

  /**
   * Sort games by date (earliest first)
   */
  sortGamesByDate(games) {
    return games.sort((a, b) => {
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return a.timestamp - b.timestamp;
    });
  }

  /**
   * Format games for Discord display
   */
  formatGamesForDiscord(games) {
    return games.map(game => {
      if (!game.timestamp) {
        return `${game.awayTeam} @ ${game.homeTeam} – TBD`;
      }
      
      const gameDateTime = toTZ(game.timestamp, DEFAULT_TIMEZONE);
      const timeStr = gameDateTime.toFormat('h:mm a ZZZZ');
      const dateStr = gameDateTime.toFormat('MMM d');
      const dateGroup = this.formatGameDateGroup(gameDateTime);
      
      return {
        formatted: `${game.awayTeam} @ ${game.homeTeam} – ${dateStr}, ${timeStr}`,
        timestamp: game.timestamp,
        dateGroup: dateGroup,
        isFuture: true,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        source: 'ESPN'
      };
    }).filter(game => game !== null);
  }

  /**
   * Format game date for grouping (Today, Tomorrow, Mon 8/14)
   */
  formatGameDateGroup(gameDateTime) {
    const now = nowTZ(DEFAULT_TIMEZONE);
    const today = now.startOf('day');
    const gameDate = gameDateTime.startOf('day');
    
    const diffDays = gameDate.diff(today, 'days').days;
    
    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Tomorrow';
    } else if (diffDays <= 6) {
      return gameDateTime.toFormat('EEE M/d');
    } else {
      return gameDateTime.toFormat('MMM dd');
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      scheduleUrl: this.scheduleUrl,
      lastFetchTime: this.lastFetchTime,
      timezone: DEFAULT_TIMEZONE
    };
  }
}

module.exports = new ESPNScheduleService();