const axios = require('axios');
const config = require('../config/config');
const { getTeamId } = require('../config/nflTeamMappings');

/**
 * TheSportsDB API Service
 * Handles all interactions with TheSportsDB API for NFL data
 */
class SportsDBAPI {
  constructor() {
    this.baseUrl = config.sportsdb.baseUrl;
    this.key = config.sportsdb.key;
    this.endpoints = config.sportsdb.endpoints;
  }

  /**
   * Search for NFL team by name with rate limiting handling
   * @param {string} teamName - Name of the team to search for
   * @param {number} retryCount - Number of retries attempted
   * @returns {Object|null} Team data or null if not found
   */
  async searchTeam(teamName, retryCount = 0) {
    try {
      const url = `${this.baseUrl}/${this.key}${this.endpoints.searchTeams}`;
      const response = await axios.get(url, {
        params: { t: teamName },
        timeout: 10000 // 10 second timeout
      });

      if (response.data?.teams) {
        // Filter for NFL teams only
        const nflTeam = response.data.teams.find(team => 
          team.strSport === 'American Football' && 
          team.strLeague === 'NFL'
        );
        return nflTeam || null;
      }
      return null;
    } catch (error) {
      if (error.response?.status === 429 && retryCount < 3) {
        // Rate limited - wait longer and retry
        const waitTime = (retryCount + 1) * 2000; // 2s, 4s, 6s
        console.warn(`⏳ Rate limited searching for ${teamName}, waiting ${waitTime}ms... (retry ${retryCount + 1}/3)`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.searchTeam(teamName, retryCount + 1);
      }
      
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