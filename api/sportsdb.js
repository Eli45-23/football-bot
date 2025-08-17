const axios = require('axios');
const { toTZ, nowTZ, fmtDateShort } = require('../src/utils/time');

const config = require('../config/config');
const { getTeamId } = require('../config/nflTeamMappings');
const textUtils = require('../src/utils/text');
const apiQueue = require('../lib/apiQueue');

// Import fallback schedule services
const espnScheduleService = require('../services/espnSchedule');
const nflScheduleService = require('../services/nflSchedule');

/**
 * TheSportsDB API Service with future-only schedule filtering
 * Handles all interactions with TheSportsDB API for NFL data
 */

const DEFAULT_TIMEZONE = 'America/New_York';
class SportsDBAPI {
  constructor() {
    this.baseUrl = config.sportsdb.baseUrl;
    this.key = config.sportsdb.key;
    this.endpoints = config.sportsdb.endpoints;
    this.nflLeagueId = config.sportsdb.nflLeagueId;
    this.currentSeason = config.sportsdb.currentSeason;
  }

  /**
   * Search for NFL team by name with enhanced queue management
   * @param {string} teamName - Name of the team to search for
   * @returns {Object|null} Team data or null if not found
   */
  async searchTeam(teamName) {
    try {
      const url = `${this.baseUrl}/${this.key}${this.endpoints.searchTeams}`;
      const config = {
        params: { t: teamName },
        timeout: 10000 // 10 second timeout
      };
      
      const data = await apiQueue.makeRequest(url, config, {
        teamName,
        requestType: 'searchTeam'
      });

      if (data?.teams) {
        // Filter for NFL teams only
        const nflTeam = data.teams.find(team => 
          team.strSport === 'American Football' && 
          team.strLeague === 'NFL'
        );
        return nflTeam || null;
      }
      return null;
    } catch (error) {
      console.error(`Error searching for team ${teamName}:`, error.message);
      return null;
    }
  }

  /**
   * Get all players for a specific team
   * @param {string} teamId - TheSportsDB team ID
   * @returns {Array} Array of player objects
   */
  async getTeamPlayers(teamId) {
    try {
      const url = `${this.baseUrl}/${this.key}${this.endpoints.lookupAllPlayers}`;
      const response = await axios.get(url, {
        params: { id: teamId }
      });

      return response.data?.player || [];
    } catch (error) {
      console.error(`Error getting players for team ${teamId}:`, error.message);
      return [];
    }
  }

  /**
   * Get detailed player information by player ID
   * @param {string} playerId - TheSportsDB player ID
   * @returns {Object|null} Player details or null if not found
   */
  async getPlayer(playerId) {
    try {
      const url = `${this.baseUrl}/${this.key}${this.endpoints.lookupPlayer}`;
      const response = await axios.get(url, {
        params: { id: playerId }
      });

      return response.data?.players?.[0] || null;
    } catch (error) {
      console.error(`Error getting player ${playerId}:`, error.message);
      return null;
    }
  }

  /**
   * Search for player by name
   * @param {string} playerName - Name of the player to search for
   * @returns {Array} Array of matching players
   */
  async searchPlayer(playerName) {
    try {
      const url = `${this.baseUrl}/${this.key}${this.endpoints.searchPlayers}`;
      const response = await axios.get(url, {
        params: { p: playerName }
      });

      if (response.data?.player) {
        // Filter for NFL players only
        return response.data.player.filter(player => 
          player.strSport === 'American Football'
        );
      }
      return [];
    } catch (error) {
      console.error(`Error searching for player ${playerName}:`, error.message);
      return [];
    }
  }

  /**
   * Get next events/games for a team
   * @param {string} teamId - TheSportsDB team ID
   * @returns {Array} Array of upcoming events
   */
  async getNextEvents(teamId) {
    try {
      const url = `${this.baseUrl}/${this.key}${this.endpoints.eventsNext}`;
      const response = await axios.get(url, {
        params: { id: teamId }
      });

      return response.data?.events || [];
    } catch (error) {
      console.error(`Error getting next events for team ${teamId}:`, error.message);
      return [];
    }
  }

  /**
   * Get last/recent events for a team
   * @param {string} teamId - TheSportsDB team ID
   * @returns {Array} Array of recent events
   */
  async getLastEvents(teamId) {
    try {
      const url = `${this.baseUrl}/${this.key}${this.endpoints.eventsLast}`;
      const response = await axios.get(url, {
        params: { id: teamId }
      });

      return response.data?.results || [];
    } catch (error) {
      console.error(`Error getting last events for team ${teamId}:`, error.message);
      return [];
    }
  }

  /**
   * Get timeline data for a specific event
   * @param {string} eventId - TheSportsDB event ID
   * @returns {Array} Array of timeline entries
   */
  async getEventTimeline(eventId) {
    try {
      const url = `${this.baseUrl}/${this.key}${this.endpoints.lookupTimeline}`;
      const response = await axios.get(url, {
        params: { id: eventId }
      });

      return response.data?.timeline || [];
    } catch (error) {
      console.error(`Error getting timeline for event ${eventId}:`, error.message);
      return [];
    }
  }

  /**
   * Get player contract information
   * @param {string} playerId - TheSportsDB player ID
   * @returns {Array} Array of contract data
   */
  async getPlayerContracts(playerId) {
    try {
      const url = `${this.baseUrl}/${this.key}${this.endpoints.lookupContracts}`;
      const response = await axios.get(url, {
        params: { id: playerId }
      });

      return response.data?.contracts || [];
    } catch (error) {
      console.error(`Error getting contracts for player ${playerId}:`, error.message);
      return [];
    }
  }

  /**
   * Get player milestones/achievements
   * @param {string} playerId - TheSportsDB player ID
   * @returns {Array} Array of milestone data
   */
  async getPlayerMilestones(playerId) {
    try {
      const url = `${this.baseUrl}/${this.key}${this.endpoints.lookupMilestones}`;
      const response = await axios.get(url, {
        params: { id: playerId }
      });

      return response.data?.milestones || [];
    } catch (error) {
      console.error(`Error getting milestones for player ${playerId}:`, error.message);
      return [];
    }
  }

  /**
   * Get player's former teams
   * @param {string} playerId - TheSportsDB player ID
   * @returns {Array} Array of former team data
   */
  async getPlayerFormerTeams(playerId) {
    try {
      const url = `${this.baseUrl}/${this.key}${this.endpoints.lookupFormerTeams}`;
      const response = await axios.get(url, {
        params: { id: playerId }
      });

      return response.data?.formerteams || [];
    } catch (error) {
      console.error(`Error getting former teams for player ${playerId}:`, error.message);
      return [];
    }
  }

  /**
   * Get league-wide NFL schedule with multiple data sources and fallbacks
   * @param {Date} startDate - Start date for schedule window
   * @param {Date} endDate - End date for schedule window
   * @returns {Promise<Object>} Schedule data with future games only
   */
  async getLeagueSchedule(startDate, endDate) {
    console.log(`📅 Fetching NFL league schedule (multi-source): ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
    console.log(`   🔍 Current season: ${this.currentSeason}`);
    
    const minThreshold = config.schedule.minGamesThreshold || 5;
    
    // PRIMARY SOURCE: TheSportsDB API
    try {
      console.log('🥇 PRIMARY: Trying TheSportsDB API...');
      const theSportsDBResult = await this.fetchFromTheSportsDB(startDate, endDate);
      
      if (theSportsDBResult.games.length >= minThreshold) {
        console.log(`✅ TheSportsDB SUCCESS: ${theSportsDBResult.games.length} games found`);
        return theSportsDBResult;
      } else {
        console.log(`⚠️ TheSportsDB insufficient: Only ${theSportsDBResult.games.length} games (need ${minThreshold})`);
      }
    } catch (error) {
      console.log(`❌ TheSportsDB FAILED: ${error.message}`);
    }
    
    // SECONDARY SOURCE: ESPN Schedule Scraper
    try {
      console.log('🥈 SECONDARY: Trying ESPN schedule scraper...');
      const espnResult = await espnScheduleService.fetchSchedule(startDate, endDate);
      
      if (espnResult.games.length >= minThreshold) {
        console.log(`✅ ESPN SCRAPER SUCCESS: ${espnResult.games.length} games found`);
        return {
          games: espnResult.games,
          totalGames: espnResult.games.length,
          source: espnResult.source,
          dateRange: { start: startDate, end: endDate },
          fallbackUsed: true
        };
      } else {
        console.log(`⚠️ ESPN SCRAPER insufficient: Only ${espnResult.games.length} games (need ${minThreshold})`);
      }
    } catch (error) {
      console.log(`❌ ESPN SCRAPER FAILED: ${error.message}`);
    }
    
    // TERTIARY SOURCE: NFL.com Schedule Scraper
    try {
      console.log('🥉 TERTIARY: Trying NFL.com schedule scraper...');
      const nflResult = await nflScheduleService.fetchSchedule(startDate, endDate);
      
      if (nflResult.games.length > 0) {
        console.log(`✅ NFL.COM SCRAPER SUCCESS: ${nflResult.games.length} games found`);
        return {
          games: nflResult.games,
          totalGames: nflResult.games.length,
          source: nflResult.source,
          dateRange: { start: startDate, end: endDate },
          fallbackUsed: true
        };
      } else {
        console.log(`⚠️ NFL.COM SCRAPER insufficient: Only ${nflResult.games.length} games`);
      }
    } catch (error) {
      console.log(`❌ NFL.COM SCRAPER FAILED: ${error.message}`);
    }
    
    // FINAL FALLBACK: Team-by-team approach (legacy method)
    console.log('🔄 FINAL FALLBACK: Using team-by-team schedule fetching...');
    return await this.getTeamBasedSchedule(startDate, endDate);
  }

  /**
   * Fetch schedule from TheSportsDB API (original logic)
   * @param {Date} startDate - Start date for schedule window
   * @param {Date} endDate - End date for schedule window
   * @returns {Promise<Object>} Schedule data from TheSportsDB
   */
  async fetchFromTheSportsDB(startDate, endDate) {
    console.log(`   📡 Fetching from TheSportsDB (season: ${this.currentSeason})...`);
    
    // Try season endpoint first, but check if comprehensive during preseason
    const seasonData = await this.getSeasonSchedule(this.currentSeason);
    if (seasonData && seasonData.length > 0) {
      const filteredGames = this.filterGamesByDateRange(seasonData, startDate, endDate);
      const normalizedGames = this.normalizeGameFormatFutureOnly(filteredGames);
      
      console.log(`   📊 TheSportsDB season data: ${normalizedGames.length} future games found in date range`);
      
      // During preseason, if we have few games, use comprehensive date queries instead
      if (this.isPreseasonPeriod() && normalizedGames.length < 8) {
        console.log('   🏈 Preseason period detected with limited games - switching to comprehensive date queries...');
        
        const dateSpecificGames = await this.getGamesByDateRange(startDate, endDate);
        const comprehensiveNormalized = this.normalizeGameFormatFutureOnly(dateSpecificGames.games);
        
        console.log(`   ✅ Comprehensive preseason schedule: ${comprehensiveNormalized.length} future games found`);
        
        return {
          games: comprehensiveNormalized,
          totalGames: comprehensiveNormalized.length,
          source: 'TheSportsDB Comprehensive Date Queries (Preseason)',
          apiCalls: 1 + dateSpecificGames.apiCalls,
          dateRange: { start: startDate, end: endDate }
        };
      }
      
      // Auto-expand if too few games (focused on current period)
      const minThreshold = config.schedule.minGamesThreshold || 5;
      const maxExpansion = config.schedule.maxExpansionDays || 10;
      
      if (normalizedGames.length < minThreshold) {
        console.log(`   🔄 <${minThreshold} games found, expanding to ${maxExpansion} days...`);
        const expandedEndDate = new Date(startDate.getTime() + (maxExpansion * 24 * 60 * 60 * 1000));
        const expandedGames = this.filterGamesByDateRange(seasonData, startDate, expandedEndDate);
        const expandedNormalized = this.normalizeGameFormatFutureOnly(expandedGames);
        
        console.log(`   ✅ Expanded schedule: ${expandedNormalized.length} future games found in ${maxExpansion}-day window`);
        
        return {
          games: expandedNormalized,
          totalGames: expandedNormalized.length,
          source: `TheSportsDB League Season API (${maxExpansion}-day expansion)`,
          apiCalls: 1,
          dateRange: { start: startDate, end: expandedEndDate }
        };
      }
      
      return {
        games: normalizedGames,
        totalGames: normalizedGames.length,
        source: 'TheSportsDB League Season API',
        apiCalls: 1,
        dateRange: { start: startDate, end: endDate }
      };
    }
    
    // Enhanced fallback: Use date-specific queries for preseason coverage
    console.log('   🔄 Season data incomplete, using enhanced date-specific queries...');
    
    const dateSpecificGames = await this.getGamesByDateRange(startDate, endDate);
    const normalizedGames = this.normalizeGameFormatFutureOnly(dateSpecificGames.games);
    
    console.log(`   ✅ Enhanced schedule: ${normalizedGames.length} future games found via date queries`);
    
    return {
      games: normalizedGames,
      totalGames: normalizedGames.length,
      source: 'TheSportsDB Date-Specific API Queries',
      apiCalls: dateSpecificGames.apiCalls,
      dateRange: { start: startDate, end: endDate }
    };
  }
  
  /**
   * Get full NFL season schedule data with enhanced queue management
   * @param {string} season - Season year (e.g., '2025')
   * @returns {Array} Array of all season events
   */
  async getSeasonSchedule(season = this.currentSeason) {
    try {
      const url = `${this.baseUrl}/${this.key}${this.endpoints.eventsSeason}`;
      const config = {
        params: { id: this.nflLeagueId, s: season },
        timeout: 15000 // 15 second timeout for large dataset
      };
      
      const data = await apiQueue.makeRequest(url, config, {
        requestType: 'seasonSchedule',
        season: season,
        teamName: 'NFL League' // For logging purposes
      });
      
      return data?.events || [];
    } catch (error) {
      console.error(`Error getting season schedule for ${season}:`, error.message);
      return [];
    }
  }
  
  /**
   * Get upcoming NFL league games
   * @returns {Array} Array of upcoming events
   */
  async getUpcomingLeagueGames() {
    try {
      const url = `${this.baseUrl}/${this.key}${this.endpoints.eventsNextLeague}`;
      const response = await axios.get(url, {
        params: { id: this.nflLeagueId },
        timeout: 10000
      });
      
      return response.data?.events || [];
    } catch (error) {
      console.error('Error getting upcoming league games:', error.message);
      return [];
    }
  }
  
  /**
   * Get recent NFL league games
   * @returns {Array} Array of recent events
   */
  async getRecentLeagueGames() {
    try {
      const url = `${this.baseUrl}/${this.key}${this.endpoints.eventsPastLeague}`;
      const response = await axios.get(url, {
        params: { id: this.nflLeagueId },
        timeout: 10000
      });
      
      return response.data?.results || [];
    } catch (error) {
      console.error('Error getting recent league games:', error.message);
      return [];
    }
  }
  
  /**
   * Get NFL games using date-specific queries (comprehensive preseason coverage)
   * @param {Date} startDate - Start date for queries
   * @param {Date} endDate - End date for queries  
   * @returns {Object} Games and API call count
   */
  async getGamesByDateRange(startDate, endDate) {
    const allGames = [];
    let apiCallCount = 0;
    
    console.log(`📅 Fetching games via date queries: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
    
    // Generate date range (iterate day by day)
    const currentDate = new Date(startDate);
    const dates = [];
    
    while (currentDate <= endDate) {
      dates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    console.log(`   📊 Querying ${dates.length} dates for NFL games...`);
    
    // Query each date for NFL games
    for (const date of dates) {
      try {
        const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format
        const url = `${this.baseUrl}/${this.key}/eventsday.php`;
        
        const response = await axios.get(url, {
          params: { 
            d: dateStr,
            s: 'American Football' // Filter for American Football events
          },
          timeout: 8000
        });
        
        apiCallCount++;
        const dayEvents = response.data?.events || [];
        
        // Filter for NFL games only
        const nflGames = dayEvents.filter(event => 
          event.strLeague === 'NFL'
        );
        
        if (nflGames.length > 0) {
          console.log(`   ✅ ${dateStr}: ${nflGames.length} NFL games`);
          allGames.push(...nflGames);
        } else {
          console.log(`   ⚫ ${dateStr}: No NFL games`);
        }
        
        // Rate limiting - small delay between requests
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.log(`   ❌ ${date.toISOString().split('T')[0]}: ${error.message}`);
        apiCallCount++;
      }
    }
    
    console.log(`✅ Date queries complete: ${allGames.length} total NFL games from ${apiCallCount} API calls`);
    
    return {
      games: allGames,
      apiCalls: apiCallCount
    };
  }
  
  /**
   * Filter games by date range
   */
  filterGamesByDateRange(games, startDate, endDate) {
    if (!games || games.length === 0) return [];
    
    return games.filter(game => {
      try {
        const gameDateTime = this.parseGameDateToTZ(game);
        if (!gameDateTime) return false;
        
        const gameTime = gameDateTime.toMillis();
        return gameTime >= startDate.getTime() && gameTime <= endDate.getTime();
      } catch (error) {
        return false;
      }
    });
  }
  
  /**
   * Parse game date/time to America/New_York timezone
   * SIMPLIFIED: Focus on primary date fields with consistent timezone handling
   */
  parseGameDateToTZ(game) {
    // FIXED: Prioritize dateEventLocal (local date) over dateEvent (UTC date)
    const attempts = [
      // PRIMARY: Use dateEventLocal which represents actual game date
      { date: game.dateEventLocal, time: game.strTimeLocal },
      { date: game.dateEventLocal, time: game.strTime },
      { date: game.dateEventLocal, time: null }, // Date only, default to 8 PM
      
      // FALLBACK: Use dateEvent as backup
      { date: game.dateEvent, time: game.strTimeLocal },
      { date: game.dateEvent, time: game.strTime },
      { date: game.strDate, time: game.strTimeLocal },
      { date: game.strTimestamp, time: null }
    ];
    
    for (const { date, time } of attempts) {
      if (!date) continue;
      
      try {
        // Build datetime string
        let fullDateTimeStr = date;
        if (time && !date.includes(':')) {
          fullDateTimeStr = `${date} ${time}`;
        }
        
        console.log(`   🔍 [DEBUG] Parsing: "${fullDateTimeStr}"`);
        
        // Parse and convert to EST/EDT
        const parsed = this.parseFlexibleDateTime(fullDateTimeStr);
        
        if (parsed) {
          const converted = toTZ(parsed, DEFAULT_TIMEZONE);
          console.log(`   ✅ [DEBUG] Successfully parsed: ${converted.toFormat('MMM d, yyyy h:mm a ZZZZ')}`);
          return converted;
        }
        
      } catch (error) {
        console.log(`   ❌ [DEBUG] Parse error: ${error.message}`);
      }
    }
    
    console.log(`   ❌ [DEBUG] All parsing attempts failed for game`);
    return null;
  }

  /**
   * Parse flexible date/time formats that TheSportsDB might use
   * ENHANCED: Reject old dates, proper timezone handling, and realistic NFL game times
   */
  parseFlexibleDateTime(dateTimeStr) {
    if (!dateTimeStr) {
      console.log(`   🔍 [DEBUG] parseFlexibleDateTime: empty input`);
      return null;
    }
    
    // Clean the string
    const cleaned = dateTimeStr.trim();
    console.log(`   🔍 [DEBUG] parseFlexibleDateTime: processing "${cleaned}"`);
    
    // Get current year for validation
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-based
    
    // Try direct parsing first - but validate the result
    const directParse = new Date(cleaned);
    console.log(`   🔍 [DEBUG] Direct parse attempt: ${directParse.toISOString()} (valid: ${!isNaN(directParse.getTime())})`);
    if (!isNaN(directParse.getTime())) {
      // SIMPLIFIED: Accept current year and reasonable range for NFL games
      const parsedYear = directParse.getFullYear();
      
      // Accept games from current year (2025) - much simpler validation
      const isValidYear = parsedYear === currentYear;
      
      if (!isValidYear) {
        console.log(`   🗑️ [DEBUG] Direct parse rejected - wrong year (${parsedYear}, expected ${currentYear})`);
        return null;
      }
      
      // Validate that this is a reasonable NFL game time (not midnight)
      const convertedEST = toTZ(directParse.getTime(), DEFAULT_TIMEZONE);
      const estHour = convertedEST.hour;
      
      console.log(`   🔍 [DEBUG] Direct parse time check: EST hour=${estHour}, year=${parsedYear}`);
      
      // NFL games typically between 12pm and 11pm EST - reject midnight times
      if (estHour >= 12 && estHour <= 23) {
        console.log(`   ✅ [DEBUG] Direct parse successful with valid time: ${directParse.getTime()}`);
        return directParse.getTime();
      } else {
        console.log(`   ⚠️ [DEBUG] Direct parse rejected - invalid NFL time (${estHour}:xx EST)`);
      }
    }
    
    // If just a date, assume 8:00 PM EST (typical NFL primetime)
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
      console.log(`   🔍 [DEBUG] Date-only format detected, using 8:00 PM EST default`);
      
      // Validate year first
      const yearMatch = cleaned.match(/^(\d{4})/);
      if (yearMatch) {
        const parsedYear = parseInt(yearMatch[1]);
        const isValidYear = parsedYear === currentYear;
        
        if (!isValidYear) {
          console.log(`   🗑️ [DEBUG] Date-only rejected - wrong year (${parsedYear}, expected ${currentYear})`);
          return null;
        }
      }
      
      // Create explicit EST time (8pm) to avoid timezone confusion
      const moment = require('moment-timezone');
      const eveningTime = moment.tz(`${cleaned} 20:00`, 'YYYY-MM-DD HH:mm', DEFAULT_TIMEZONE);
      
      if (eveningTime.isValid()) {
        console.log(`   ✅ [DEBUG] Evening time parse successful: ${eveningTime.valueOf()} (${eveningTime.format('MMM D, YYYY h:mm A z')})`);
        return eveningTime.valueOf();
      } else {
        console.log(`   ❌ [DEBUG] Evening time parse failed`);
      }
    }
    
    // Try parsing with explicit timezone handling
    const moment = require('moment-timezone');
    
    // Try common NFL time formats with timezone context
    const timeFormats = [
      // Standard formats
      'YYYY-MM-DD HH:mm:ss',
      'YYYY-MM-DD HH:mm',
      'MM/DD/YYYY HH:mm',
      'DD/MM/YYYY HH:mm',
      
      // With explicit timezone
      'YYYY-MM-DD HH:mm:ss Z',
      'YYYY-MM-DD HH:mm Z'
    ];
    
    for (const format of timeFormats) {
      const attempt = moment.tz(cleaned, format, DEFAULT_TIMEZONE);
      if (attempt.isValid()) {
        const estHour = attempt.hour();
        const parsedYear = attempt.year();
        
        console.log(`   🔍 [DEBUG] Format "${format}" parsed to: ${attempt.format('MMM D, YYYY h:mm A z')} (hour: ${estHour}, year: ${parsedYear})`);
        
        // Validate year
        const isValidYear = parsedYear === currentYear;
        
        if (!isValidYear) {
          console.log(`   🗑️ [DEBUG] Format parse rejected - wrong year (${parsedYear}, expected ${currentYear})`);
          continue;
        }
        
        // Validate reasonable NFL time
        if (estHour >= 12 && estHour <= 23) {
          console.log(`   ✅ [DEBUG] Format parse successful with valid time: ${attempt.valueOf()}`);
          return attempt.valueOf();
        } else {
          console.log(`   ⚠️ [DEBUG] Format parse rejected - invalid NFL time (${estHour}:xx EST)`);
        }
      }
    }
    
    console.log(`   ❌ [DEBUG] parseFlexibleDateTime: all parsing attempts failed for "${cleaned}"`);
    return null;
  }

  /**
   * Format game date for grouping (Today, Tomorrow, Mon 8/14)
   * FIXED: Simplified and accurate date calculation
   */
  formatGameDateGroup(gameDateTime) {
    const now = nowTZ(DEFAULT_TIMEZONE);
    const today = now.startOf('day');
    const gameDate = gameDateTime.startOf('day');
    
    // Use Math.round to avoid floating point precision issues
    const diffDays = Math.round(gameDate.diff(today, 'days').days);
    
    console.log(`   📅 [DATE] Game: ${gameDateTime.toFormat('MMM d, yyyy h:mm a')} | Today: ${today.toFormat('MMM d, yyyy')} | Diff: ${diffDays} days`);
    
    let label;
    if (diffDays === 0) {
      label = 'Today';
    } else if (diffDays === 1) {
      label = 'Tomorrow';
    } else if (diffDays >= 2 && diffDays <= 6) {
      label = gameDateTime.toFormat('EEE M/d');
    } else if (diffDays < 0) {
      // Past games (shouldn't show up, but handle gracefully)
      label = 'Past';
    } else {
      label = gameDateTime.toFormat('MMM dd');
    }
    
    console.log(`   📅 [DATE] Label: "${label}"`);
    
    return label;
  }

  /**
   * Parse game date from TheSportsDB event object
   * @param {Object} game - Game/event object
   * @returns {Date|null} Parsed date or null
   */
  parseGameDate(game) {
    // Try various date fields that TheSportsDB might use
    const dateFields = [
      'dateEvent',
      'strDate', 
      'strTimestamp',
      'dateEventLocal'
    ];
    
    for (const field of dateFields) {
      if (game[field]) {
        const parsedDate = new Date(game[field]);
        if (!isNaN(parsedDate.getTime())) {
          return parsedDate;
        }
      }
    }
    
    return null;
  }
  
  /**
   * Normalize game format with strict future-only filtering and timezone conversion
   * All event datetimes converted to America/New_York, filter kickoff >= nowTZ(TZ)
   * ENHANCED: Comprehensive data validation and quality checks
   * @param {Array} games - Array of raw game objects
   * @returns {Array} Array of normalized future-only games
   */
  normalizeGameFormatFutureOnly(games) {
    if (!games || games.length === 0) return [];
    
    const now = nowTZ(DEFAULT_TIMEZONE);
    console.log(`   ⏰ Current time (${DEFAULT_TIMEZONE}): ${now.toFormat('MMM d, yyyy h:mm a ZZZZ')}`);
    console.log(`   🔍 VALIDATION: Processing ${games.length} raw games for normalization`);
    
    let validGameCount = 0;
    let invalidDateCount = 0;
    let finishedGameCount = 0;
    let pastGameCount = 0;
    let wrongYearCount = 0;
    let invalidTimeCount = 0;
    
    const processedGames = games.map(game => {
      try {
        const homeTeam = textUtils.formatTeamName(game.strHomeTeam || 'TBD');
        const awayTeam = textUtils.formatTeamName(game.strAwayTeam || 'TBD');
        
        // VALIDATION: Check for valid team names
        if (homeTeam === 'TBD' || awayTeam === 'TBD') {
          console.log(`   ⚠️ VALIDATION WARNING: Missing team data for game: ${awayTeam} @ ${homeTeam}`);
        }
        
        // DEBUG: Log raw game data to see what date fields are available
        console.log(`   🔍 [DEBUG] Raw game data: ${awayTeam} @ ${homeTeam}`);
        console.log(`   🔍 [DEBUG] All available fields:`, {
          dateEvent: game.dateEvent,
          strDate: game.strDate,
          strTime: game.strTime,
          strTimeLocal: game.strTimeLocal,
          strTimestamp: game.strTimestamp,
          dateEventLocal: game.dateEventLocal,
          strStatus: game.strStatus,
          strSeason: game.strSeason,
          intRound: game.intRound,
          strEvent: game.strEvent
        });
        
        const gameDateTime = this.parseGameDateToTZ(game);
        
        if (!gameDateTime) {
          invalidDateCount++;
          console.log(`   ❌ VALIDATION: Invalid date/time for ${awayTeam} @ ${homeTeam}`);
          return null; // Skip games without valid date/time
        }
        
        // VALIDATION: Check for reasonable year (prevent old data)
        const gameYear = gameDateTime.year;
        const currentYear = now.year;
        if (Math.abs(gameYear - currentYear) > 1) {
          wrongYearCount++;
          console.log(`   🗑️ VALIDATION: Wrong year ${gameYear} for ${awayTeam} @ ${homeTeam} (current: ${currentYear})`);
          return null;
        }
        
        // VALIDATION: Check for reasonable game time (12 PM - 11 PM EST)
        const gameHour = gameDateTime.hour;
        if (gameHour < 12 || gameHour > 23) {
          invalidTimeCount++;
          console.log(`   ⚠️ VALIDATION: Unrealistic game time ${gameHour}:xx EST for ${awayTeam} @ ${homeTeam}`);
          // Don't skip, but log the issue
        }
        
        // Skip games that are already finished/completed (expanded list)
        const gameStatus = game.strStatus;
        const finishedStatuses = ['FT', 'Finished', 'Final', 'Completed', 'Complete', 'FINAL', 'FINISHED'];
        if (finishedStatuses.includes(gameStatus)) {
          finishedGameCount++;
          console.log(`   🏁 SKIPPING FINISHED GAME: ${awayTeam} @ ${homeTeam} (Status: ${gameStatus})`);
          return null;
        }
        
        // Future-only filter: kickoff >= nowTZ(TZ)
        const isFuture = gameDateTime >= now;
        
        // Future-only filter with clean logging
        const gameTimeStr = gameDateTime.toFormat('MMM d, yyyy h:mm a ZZZZ');
        
        if (!isFuture) {
          pastGameCount++;
          console.log(`   🗑️ DROPPING PAST GAME: ${awayTeam} @ ${homeTeam} - ${gameTimeStr}`);
          return null;
        }
        
        validGameCount++;
        console.log(`   ✅ KEEPING FUTURE GAME: ${awayTeam} @ ${homeTeam} - ${gameTimeStr}`);
        
        // Format date group for grouping
        const dateGroup = this.formatGameDateGroup(gameDateTime);
        
        // Format game display string
        const timeStr = gameDateTime.toFormat('h:mm a ZZZZ');
        const dateStr = gameDateTime.toFormat('MMM d');
        const formatted = `${awayTeam} @ ${homeTeam} – ${dateStr}, ${timeStr}`;
        
        // VALIDATION: Check formatted string quality
        if (formatted.includes('undefined') || formatted.includes('TBD @ TBD')) {
          console.log(`   ⚠️ VALIDATION: Poor formatting quality: "${formatted}"`);
        }
        
        return {
          formatted: formatted,
          timestamp: gameDateTime.toMillis(),
          dateGroup: dateGroup,
          isFuture: true, // All returned games are future
          homeTeam: homeTeam,
          awayTeam: awayTeam,
          venue: game.strVenue,
          status: game.strStatus,
          source: game.source || 'TheSportsDB',
          gameYear: gameYear,
          gameHour: gameHour
        };
        
      } catch (error) {
        console.log(`   ❌ Error processing game: ${error.message}`);
        return null;
      }
    }).filter(game => game !== null);
    
    // VALIDATION SUMMARY
    console.log(`   📊 VALIDATION SUMMARY:`);
    console.log(`      ✅ Valid games: ${validGameCount}`);
    console.log(`      ❌ Invalid dates: ${invalidDateCount}`);
    console.log(`      🏁 Finished games: ${finishedGameCount}`);
    console.log(`      🗑️ Past games: ${pastGameCount}`);
    console.log(`      📅 Wrong year: ${wrongYearCount}`);
    console.log(`      ⏰ Invalid times: ${invalidTimeCount}`);
    
    // Add relevance scoring and prioritize current/near-term games
    const scoredGames = this.addRelevanceScoring(processedGames);
    
    // Sort by relevance score (highest first), then by time
    scoredGames.sort((a, b) => {
      if (a.relevanceScore !== b.relevanceScore) {
        return b.relevanceScore - a.relevanceScore; // Higher score first
      }
      return a.timestamp - b.timestamp; // Earlier time first for same score
    });
    
    // FINAL VALIDATION: Check for data quality issues
    if (scoredGames.length === 0) {
      console.log(`   ❌ VALIDATION ALERT: No valid games after filtering!`);
    } else if (scoredGames.length < 3) {
      console.log(`   ⚠️ VALIDATION WARNING: Only ${scoredGames.length} games found - may indicate data issues`);
    }
    
    // Check for date diversity
    const uniqueDates = new Set(scoredGames.map(game => game.dateGroup));
    if (uniqueDates.size === 1 && scoredGames.length > 1) {
      console.log(`   ⚠️ VALIDATION WARNING: All games on same date (${Array.from(uniqueDates)[0]}) - may indicate limited data`);
    }
    
    console.log(`   ✅ Processed games: ${scoredGames.length} future games after filtering and prioritization`);
    
    return scoredGames;
  }

  /**
   * Add relevance scoring to prioritize current/near-term games
   * @param {Array} games - Array of processed game objects
   * @returns {Array} Games with relevance scores added
   */
  addRelevanceScoring(games) {
    const now = nowTZ(DEFAULT_TIMEZONE);
    
    return games.map(game => {
      const gameTime = toTZ(game.timestamp, DEFAULT_TIMEZONE);
      const hoursUntilGame = gameTime.diff(now, 'hours');
      const daysUntilGame = Math.ceil(hoursUntilGame / 24);
      
      // Scoring system: prioritize sooner games
      let relevanceScore = 100;
      
      if (hoursUntilGame <= 6) {
        relevanceScore = 1000; // Starting soon - highest priority
      } else if (hoursUntilGame <= 12) {
        relevanceScore = 900;  // Today - very high priority
      } else if (hoursUntilGame <= 24) {
        relevanceScore = 800;  // Later today - high priority
      } else if (daysUntilGame <= 2) {
        relevanceScore = 700;  // Tomorrow - high priority
      } else if (daysUntilGame <= 3) {
        relevanceScore = 600;  // Day after tomorrow - medium-high
      } else if (daysUntilGame <= 5) {
        relevanceScore = 400;  // This week - medium priority
      } else if (daysUntilGame <= 7) {
        relevanceScore = 200;  // Next week - low priority
      } else {
        relevanceScore = 100;  // Far future - lowest priority
      }
      
      console.log(`   🏈 Game: ${game.awayTeam} @ ${game.homeTeam} - ${daysUntilGame}d away - Score: ${relevanceScore}`);
      
      return {
        ...game,
        relevanceScore,
        daysUntilGame,
        hoursUntilGame
      };
    });
  }

  /**
   * Normalize game objects with enhanced formatting and future-only filtering
   * @param {Array} games - Array of raw game objects
   * @param {boolean} futureOnly - Only include future games
   * @returns {Array} Array of normalized game objects with enhanced data
   */
  normalizeGameFormat(games, futureOnly = false) {
    if (!games || games.length === 0) return [];
    
    const processedGames = games.map(game => {
      try {
        const homeTeam = textUtils.formatTeamName(game.strHomeTeam || 'TBD');
        const awayTeam = textUtils.formatTeamName(game.strAwayTeam || 'TBD');
        const gameDate = this.parseGameDate(game);
        
        if (!gameDate) {
          return {
            formatted: `${awayTeam} @ ${homeTeam} – TBD`,
            timestamp: null,
            dateGroup: 'TBD',
            isFuture: false
          };
        }
        
        const timestamp = gameDate.getTime();
        const isFuture = timestamp > Date.now();
        
        // Skip past games if future-only mode is enabled
        if (futureOnly && !isFuture) {
          return null;
        }
        
        // Enhanced time formatting
        const dateStr = new Date(timestamp).toLocaleDateString();
        const dateGroup = this.formatGameDateGroup(toTZ(timestamp, DEFAULT_TIMEZONE));
        
        return {
          formatted: `${awayTeam} @ ${homeTeam} – ${dateStr}`,
          timestamp,
          dateGroup,
          isFuture,
          homeTeam,
          awayTeam
        };
      } catch (error) {
        console.warn(`Error normalizing game format:`, error.message);
        return {
          formatted: `${game.strAwayTeam || 'TBD'} @ ${game.strHomeTeam || 'TBD'} – TBD`,
          timestamp: null,
          dateGroup: 'TBD',
          isFuture: false
        };
      }
    }).filter(game => game !== null && game.formatted && !game.formatted.includes('undefined'));
    
    // Sort by timestamp (earliest first)
    return processedGames.sort((a, b) => {
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return a.timestamp - b.timestamp;
    });
  }
  
  /**
   * Group games by date for enhanced presentation
   * @param {Array} games - Array of normalized game objects
   * @returns {Object} Games grouped by date with group labels
   */
  groupGamesByDate(games) {
    if (!games || games.length === 0) return {};
    
    const grouped = {};
    const dateGroupOrder = [];
    
    games.forEach(game => {
      const group = game.dateGroup || 'TBD';
      
      if (!grouped[group]) {
        grouped[group] = [];
        dateGroupOrder.push(group);
      }
      
      grouped[group].push(game.formatted);
    });
    
    return {
      grouped,
      dateGroupOrder,
      totalGames: games.length
    };
  }
  
  /**
   * Format grouped games for Discord display
   * @param {Object} groupedData - Result from groupGamesByDate
   * @returns {Array} Array of formatted strings ready for Discord
   */
  formatGroupedGames(groupedData) {
    if (!groupedData.grouped || Object.keys(groupedData.grouped).length === 0) {
      return ['No upcoming games'];
    }
    
    const formatted = [];
    
    groupedData.dateGroupOrder.forEach(dateGroup => {
      const games = groupedData.grouped[dateGroup];
      
      if (games.length > 0) {
        // Add games for this date with date prefix included in each bullet
        games.forEach(game => {
          // Include date group in the game format: "Tomorrow: Team A @ Team B – Time"
          const gameWithDate = `${dateGroup}: ${game}`;
          formatted.push(gameWithDate);
        });
      }
    });
    
    return formatted;
  }
  
  /**
   * Fallback method: Get schedule using team-by-team approach
   */
  async getTeamBasedSchedule(startDate, endDate) {
    console.log('🔄 Using team-by-team schedule fallback (legacy method)...');
    
    const allGames = [];
    let apiCallCount = 0;
    
    // Get a subset of teams to avoid rate limits in fallback mode
    const teamNames = ['Kansas City Chiefs', 'Philadelphia Eagles', 'Buffalo Bills', 'Dallas Cowboys'];
    
    for (const teamName of teamNames) {
      try {
        const teamData = await this.getTeamUpdateData(teamName);
        if (teamData?.nextEvents) {
          allGames.push(...teamData.nextEvents);
          apiCallCount += 2; // searchTeam + getNextEvents
        }
      } catch (error) {
        console.error(`Error in team-based schedule for ${teamName}:`, error.message);
      }
    }
    
    const filteredGames = this.filterGamesByDateRange(allGames, startDate, endDate);
    const normalizedGames = this.normalizeGameFormatFutureOnly(filteredGames);
    
    console.log(`✅ Team-based schedule: ${normalizedGames.length} future games from ${apiCallCount} API calls`);
    
    return {
      games: normalizedGames,
      totalGames: normalizedGames.length,
      source: 'Team-by-Team Fallback',
      apiCalls: apiCallCount,
      dateRange: { start: startDate, end: endDate },
      fallbackUsed: true
    };
  }

  /**
   * Get comprehensive team data for daily updates (optimized for rate limits)
   * Uses hardcoded team IDs to avoid search API calls
   * @param {string} teamName - Name of the team
   * @returns {Object} Comprehensive team data for analysis
   */
  async getTeamUpdateData(teamName) {
    try {
      console.log(`🔍 Fetching update data for ${teamName}...`);
      
      // Step 1: Use hardcoded team ID (no API call needed)
      const teamId = getTeamId(teamName);
      if (!teamId) {
        console.log(`❌ Team not mapped: ${teamName}`);
        return null;
      }

      // Step 2: Get only upcoming events (single API call)
      const nextEvents = await this.getNextEvents(teamId);
      
      // Note: Removed timeline fetching to reduce API calls
      // Timeline data was causing 3-6 extra API calls per team
      
      console.log(`✅ Retrieved ${nextEvents?.length || 0} upcoming events for ${teamName}`);

      return {
        team: { idTeam: teamId, strTeam: teamName },
        nextEvents: nextEvents || [],
        lastEvents: [], // Skip last events to reduce API calls
        timelineData: [] // No timeline data to avoid rate limits
      };
    } catch (error) {
      console.error(`Error getting update data for ${teamName}:`, error.message);
      return null;
    }
  }

  /**
   * Detect if we're currently in NFL preseason period (July - September)
   * @returns {boolean} True if current date is in preseason period
   */
  isPreseasonPeriod() {
    const now = new Date();
    const month = now.getMonth(); // 0-based: 0=Jan, 6=Jul, 7=Aug, 8=Sep
    
    // Preseason typically runs July-September (months 6-8)
    // But we'll be generous and include June-October to catch edge cases
    return month >= 5 && month <= 9; // June (5) through October (9)
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      baseUrl: this.baseUrl,
      nflLeagueId: this.nflLeagueId,
      currentSeason: this.currentSeason,
      timezone: DEFAULT_TIMEZONE,
      isPreseasonPeriod: this.isPreseasonPeriod()
    };
  }
}

module.exports = new SportsDBAPI();