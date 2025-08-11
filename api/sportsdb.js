const axios = require('axios');
const config = require('../config/config');
const { getTeamId } = require('../config/nflTeamMappings');
const apiQueue = require('../lib/apiQueue');

/**
 * TheSportsDB API Service
 * Handles all interactions with TheSportsDB API for NFL data
 */
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
   * Get league-wide NFL schedule with intelligent date windowing
   * Primary method for getting all NFL games in a specified date range
   * @param {Date} startDate - Start date for schedule window
   * @param {Date} endDate - End date for schedule window  
   * @returns {Object} Schedule data with games array and metadata
   */
  async getLeagueSchedule(startDate, endDate) {
    try {
      console.log(`📅 Fetching NFL league schedule: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
      
      // Try season endpoint first (most efficient - 1 API call)
      const seasonData = await this.getSeasonSchedule(this.currentSeason);
      if (seasonData && seasonData.length > 0) {
        const filteredGames = this.filterGamesByDateRange(seasonData, startDate, endDate);
        const normalizedGames = this.normalizeGameFormat(filteredGames);
        
        console.log(`✅ League schedule: ${filteredGames.length} games found in date range`);
        return {
          games: normalizedGames,
          totalGames: normalizedGames.length,
          source: 'League Season API',
          apiCalls: 1,
          dateRange: { start: startDate, end: endDate }
        };
      }
      
      // Fallback: Use upcoming + recent league endpoints (2 API calls)
      console.log('🔄 Season endpoint failed, trying upcoming + recent league data...');
      const [upcomingGames, recentGames] = await Promise.all([
        this.getUpcomingLeagueGames(),
        this.getRecentLeagueGames()
      ]);
      
      const allGames = [...(upcomingGames || []), ...(recentGames || [])];
      const filteredGames = this.filterGamesByDateRange(allGames, startDate, endDate);
      const normalizedGames = this.normalizeGameFormat(filteredGames);
      
      console.log(`✅ League schedule (fallback): ${filteredGames.length} games found`);
      return {
        games: normalizedGames,
        totalGames: normalizedGames.length,
        source: 'League Upcoming+Recent API',
        apiCalls: 2,
        dateRange: { start: startDate, end: endDate }
      };
      
    } catch (error) {
      console.error('❌ League schedule fetch failed:', error.message);
      
      // Final fallback: team-by-team approach (legacy method)
      console.log('🔄 Falling back to team-by-team schedule fetching...');
      return await this.getTeamBasedSchedule(startDate, endDate);
    }
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
   * Filter games array by date range
   * @param {Array} games - Array of game objects
   * @param {Date} startDate - Filter start date
   * @param {Date} endDate - Filter end date
   * @returns {Array} Filtered games array
   */
  filterGamesByDateRange(games, startDate, endDate) {
    if (!games || games.length === 0) return [];
    
    return games.filter(game => {
      try {
        // Parse game date from various possible fields
        const gameDate = this.parseGameDate(game);
        if (!gameDate) return false;
        
        return gameDate >= startDate && gameDate <= endDate;
      } catch (error) {
        console.warn(`Error parsing game date for filtering:`, error.message);
        return false;
      }
    });
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
   * Normalize game objects to consistent format for Discord display
   * @param {Array} games - Array of raw game objects
   * @returns {Array} Array of normalized game strings
   */
  normalizeGameFormat(games) {
    if (!games || games.length === 0) return [];
    
    return games.map(game => {
      try {
        const homeTeam = game.strHomeTeam || 'TBD';
        const awayTeam = game.strAwayTeam || 'TBD';
        const gameDate = this.parseGameDate(game);
        
        let dateStr = 'TBD';
        if (gameDate) {
          // Format as "MMM DD, h:mm A ET"
          const options = {
            month: 'short',
            day: 'numeric', 
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'America/New_York'
          };
          dateStr = gameDate.toLocaleDateString('en-US', options);
        }
        
        return `${awayTeam} @ ${homeTeam} – ${dateStr}`;
      } catch (error) {
        console.warn(`Error normalizing game format:`, error.message);
        return `${game.strAwayTeam || 'TBD'} @ ${game.strHomeTeam || 'TBD'} – TBD`;
      }
    }).filter(gameStr => gameStr && !gameStr.includes('undefined'));
  }
  
  /**
   * Fallback method: Get schedule using team-by-team approach
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Object} Schedule data from team aggregation
   */
  async getTeamBasedSchedule(startDate, endDate) {
    console.log('🔄 Using team-by-team schedule fallback (legacy method)...');
    
    const allGames = [];
    let apiCallCount = 0;
    
    // Get a subset of teams to avoid rate limits in fallback mode
    const sampleTeams = config.nflTeams.slice(0, 8); // Sample 8 teams
    
    for (const teamName of sampleTeams) {
      try {
        const teamId = getTeamId(teamName);
        if (!teamId) continue;
        
        const [nextEvents, lastEvents] = await Promise.all([
          this.getNextEvents(teamId),
          this.getLastEvents(teamId)
        ]);
        
        allGames.push(...(nextEvents || []), ...(lastEvents || []));
        apiCallCount += 2;
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.warn(`Team fallback failed for ${teamName}:`, error.message);
      }
    }
    
    const filteredGames = this.filterGamesByDateRange(allGames, startDate, endDate);
    const normalizedGames = this.normalizeGameFormat(filteredGames);
    
    console.log(`✅ Team-based schedule: ${normalizedGames.length} games from ${apiCallCount} API calls`);
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
}

module.exports = new SportsDBAPI();