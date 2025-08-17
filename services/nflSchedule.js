const axios = require('axios');
const { JSDOM } = require('jsdom');
const { toTZ, nowTZ, fmtDateShort } = require('../src/utils/time');

/**
 * NFL.com Official Schedule Scraper Service
 * Tertiary fallback for game schedule data when TheSportsDB and ESPN fail
 */

const DEFAULT_TIMEZONE = 'America/New_York';

class NFLScheduleService {
  constructor() {
    this.scheduleUrl = 'https://www.nfl.com/schedules/';
    this.lastFetchTime = null;
    
    console.log('📋 NFL.com Schedule service initialized');
  }

  /**
   * Fetch current NFL schedule from NFL.com
   * @param {Date} startDate - Start date for schedule window
   * @param {Date} endDate - End date for schedule window
   * @returns {Promise<Object>} Formatted schedule with future games only
   */
  async fetchSchedule(startDate, endDate) {
    try {
      console.log(`🏈 Fetching NFL.com official schedule...`);
      console.log(`   📅 Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
      
      // Try multiple NFL.com schedule URLs
      const scheduleUrls = [
        'https://www.nfl.com/schedules/',
        'https://www.nfl.com/schedules/2024/REG1', // Regular season
        'https://www.nfl.com/schedules/2024/PRE1'  // Preseason
      ];
      
      let response = null;
      let usedUrl = null;
      
      for (const url of scheduleUrls) {
        try {
          console.log(`   📡 Trying URL: ${url}`);
          response = await axios.get(url, {
            timeout: 15000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Accept-Encoding': 'gzip, deflate',
              'Connection': 'keep-alive',
              'Upgrade-Insecure-Requests': '1'
            }
          });
          
          if (response.status === 200) {
            usedUrl = url;
            break;
          }
        } catch (error) {
          console.log(`   ❌ Failed to fetch ${url}: ${error.message}`);
          continue;
        }
      }
      
      if (!response) {
        throw new Error('All NFL.com schedule URLs failed');
      }
      
      console.log(`   ✅ Successfully fetched from: ${usedUrl}`);

      const dom = new JSDOM(response.data);
      const document = dom.window.document;
      
      const rawGames = this.parseScheduleData(document);
      console.log(`   📊 Raw games parsed: ${rawGames.length}`);
      
      // Filter by date range and future-only
      const filteredGames = this.filterGamesByDateRange(rawGames, startDate, endDate);
      console.log(`   ⏰ After date filtering: ${filteredGames.length}`);
      
      // Sort by date (earliest first)
      const sortedGames = this.sortGamesByDate(filteredGames);
      
      // Format for Discord display
      const formattedGames = this.formatGamesForDiscord(sortedGames);
      
      console.log(`✅ NFL.com schedule: ${formattedGames.length} future games found`);
      
      this.lastFetchTime = new Date();
      
      return {
        games: formattedGames,
        totalCount: formattedGames.length,
        source: 'NFL.com Official',
        dateRange: { start: startDate, end: endDate }
      };
      
    } catch (error) {
      console.log(`❌ NFL.com schedule fetch failed: ${error.message}`);
      return {
        games: [],
        totalCount: 0,
        source: 'NFL.com Official (failed)',
        error: error.message
      };
    }
  }

  /**
   * Parse NFL.com schedule data from DOM
   */
  parseScheduleData(document) {
    const games = [];
    
    // NFL.com uses various data structures for schedules
    const selectors = [
      // Modern NFL.com schedule components
      '[data-module="schedule"] .game-card',
      '.schedule-game-card',
      '.game-strip',
      '.game-item',
      
      // Table-based schedules
      '.schedule-table tbody tr',
      '.ResponsiveTable tbody tr',
      'table tbody tr',
      
      // JSON data embedded in page
      'script[type="application/json"]',
      'script[type="application/ld+json"]',
      
      // Fallback: any elements with game data
      '[data-game-id]',
      '[data-away-team]',
      '[data-home-team]'
    ];
    
    // Try JSON data first (most reliable)
    const jsonScripts = document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"]');
    for (const script of jsonScripts) {
      try {
        const data = JSON.parse(script.textContent);
        const extractedGames = this.extractGamesFromJson(data);
        if (extractedGames.length > 0) {
          console.log(`   🎯 Found ${extractedGames.length} games from JSON data`);
          games.push(...extractedGames);
          return games; // Use JSON data if available
        }
      } catch (error) {
        // Continue to next script
      }
    }
    
    // Fall back to HTML parsing
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        console.log(`   🎯 Found ${elements.length} schedule elements with selector: ${selector}`);
        
        elements.forEach((element) => {
          try {
            const game = this.parseGameElement(element);
            if (game) {
              games.push(game);
            }
          } catch (error) {
            console.log(`   ❌ Error parsing game element: ${error.message}`);
          }
        });
        
        if (games.length > 0) {
          break; // Stop after finding games with a selector
        }
      }
    }
    
    // Final fallback: look for team abbreviations in text
    if (games.length === 0) {
      console.log('   🔍 Trying text-based extraction...');
      const textGames = this.extractGamesFromText(document);
      games.push(...textGames);
    }

    return games;
  }

  /**
   * Extract games from JSON data embedded in the page
   */
  extractGamesFromJson(data) {
    const games = [];
    
    // Recursively search for game data in JSON
    const findGames = (obj) => {
      if (typeof obj !== 'object' || obj === null) return;
      
      // Check if this object looks like a game
      if (obj.awayTeam && obj.homeTeam) {
        games.push({
          awayTeam: this.extractTeamName(obj.awayTeam),
          homeTeam: this.extractTeamName(obj.homeTeam),
          gameDate: obj.gameDate || obj.date || obj.kickoff,
          gameTime: obj.gameTime || obj.time,
          timestamp: obj.timestamp || obj.gameTimeEpoch,
          source: 'NFL.com JSON'
        });
      }
      
      // Recursively search nested objects and arrays
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          if (Array.isArray(obj[key])) {
            obj[key].forEach(item => findGames(item));
          } else if (typeof obj[key] === 'object') {
            findGames(obj[key]);
          }
        }
      }
    };
    
    findGames(data);
    return games;
  }

  /**
   * Extract team name from various NFL.com formats
   */
  extractTeamName(teamData) {
    if (typeof teamData === 'string') {
      return teamData;
    }
    
    if (typeof teamData === 'object' && teamData !== null) {
      return teamData.abbreviation || 
             teamData.abbr || 
             teamData.name || 
             teamData.displayName || 
             teamData.shortName ||
             'TBD';
    }
    
    return 'TBD';
  }

  /**
   * Parse a single game element from NFL.com
   */
  parseGameElement(element) {
    try {
      // Extract team data from data attributes
      let awayTeam = element.getAttribute('data-away-team') || 
                    element.getAttribute('data-visitor-team') ||
                    element.getAttribute('data-away-abbr');
                    
      let homeTeam = element.getAttribute('data-home-team') || 
                    element.getAttribute('data-home-abbr');
      
      // Extract teams from text content if not in attributes
      if (!awayTeam || !homeTeam) {
        const teamText = element.textContent || '';
        const teamMatches = teamText.match(/\b(ARI|ATL|BAL|BUF|CAR|CHI|CIN|CLE|DAL|DEN|DET|GB|HOU|IND|JAX|KC|LV|LAC|LAR|MIA|MIN|NE|NO|NYG|NYJ|PHI|PIT|SF|SEA|TB|TEN|WAS)\b/g);
        
        if (teamMatches && teamMatches.length >= 2) {
          awayTeam = awayTeam || teamMatches[0];
          homeTeam = homeTeam || teamMatches[1];
        }
      }
      
      if (!awayTeam || !homeTeam) {
        return null; // Skip elements without clear team data
      }
      
      // Extract date and time
      let gameDate = element.getAttribute('data-game-date') || 
                    element.getAttribute('data-date') ||
                    element.getAttribute('data-kickoff');
                    
      let gameTime = element.getAttribute('data-game-time') || 
                    element.getAttribute('data-time');
      
      // Look for date/time in text content
      if (!gameDate || !gameTime) {
        const text = element.textContent || '';
        
        // Date patterns
        const dateMatch = text.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}|\d{1,2}\/\d{1,2}/);
        if (dateMatch && !gameDate) {
          gameDate = dateMatch[0];
        }
        
        // Time patterns
        const timeMatch = text.match(/\d{1,2}:\d{2}\s*(?:AM|PM|EDT|EST)?/i);
        if (timeMatch && !gameTime) {
          gameTime = timeMatch[0];
        }
      }
      
      // Parse timestamp
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
        source: 'NFL.com'
      };
      
    } catch (error) {
      console.log(`   ❌ Error parsing game element: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract games from page text as last resort
   */
  extractGamesFromText(document) {
    const games = [];
    const text = document.body.textContent || '';
    
    // Look for patterns like "Team1 @ Team2" or "Team1 vs Team2"
    const gamePattern = /\b(ARI|ATL|BAL|BUF|CAR|CHI|CIN|CLE|DAL|DEN|DET|GB|HOU|IND|JAX|KC|LV|LAC|LAR|MIA|MIN|NE|NO|NYG|NYJ|PHI|PIT|SF|SEA|TB|TEN|WAS)\s*[@vs]\s*(ARI|ATL|BAL|BUF|CAR|CHI|CIN|CLE|DAL|DEN|DET|GB|HOU|IND|JAX|KC|LV|LAC|LAR|MIA|MIN|NE|NO|NYG|NYJ|PHI|PIT|SF|SEA|TB|TEN|WAS)\b/gi;
    
    const matches = text.match(gamePattern);
    if (matches) {
      matches.forEach(match => {
        const teams = match.split(/[@vs]/i).map(team => team.trim());
        if (teams.length === 2) {
          games.push({
            awayTeam: teams[0],
            homeTeam: teams[1],
            gameDate: null,
            gameTime: null,
            timestamp: null,
            source: 'NFL.com Text'
          });
        }
      });
    }
    
    return games;
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
        source: 'NFL.com'
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

module.exports = new NFLScheduleService();