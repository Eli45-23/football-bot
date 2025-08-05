const { limitedGet } = require('../lib/http');

/**
 * Enhanced SportsDB API Service
 * Uses rate-limited HTTP client with proper error handling and fallback support
 */

const BASE_URL = 'https://www.thesportsdb.com/api/v1/json';
const API_KEY = process.env.SPORTSDB_KEY || '123';

/**
 * Search for NFL team by name
 * @param {string} name - Team name to search for
 * @returns {Promise<Array|null>} Array of teams or null if not found
 */
async function searchTeamByName(name) {
  try {
    const url = `${BASE_URL}/${API_KEY}/searchteams.php?t=${encodeURIComponent(name)}`;
    const response = await limitedGet(url);
    
    const teams = response.data?.teams;
    if (!teams || teams.length === 0) {
      console.log(`⚠️ No teams found for: ${name}`);
      return null;
    }

    // Filter for NFL teams only
    const nflTeams = teams.filter(team => 
      team.strSport === 'American Football' && 
      team.strLeague === 'NFL'
    );

    console.log(`✅ Found ${nflTeams.length} NFL team(s) for: ${name}`);
    return nflTeams.length > 0 ? nflTeams : null;

  } catch (error) {
    console.error(`❌ Error searching team "${name}":`, error.message);
    throw new Error(`TEAM_SEARCH_FAILED: ${error.message}`);
  }
}

/**
 * Search for NFL player by name
 * @param {string} name - Player name to search for
 * @returns {Promise<Array|null>} Array of players or null if not found
 */
async function searchPlayerByName(name) {
  try {
    const url = `${BASE_URL}/${API_KEY}/searchplayers.php?p=${encodeURIComponent(name)}`;
    const response = await limitedGet(url);
    
    const players = response.data?.player;
    if (!players || players.length === 0) {
      console.log(`⚠️ No players found for: ${name}`);
      return null;
    }

    // Filter for NFL players only
    const nflPlayers = players.filter(player => 
      player.strSport === 'American Football'
    );

    console.log(`✅ Found ${nflPlayers.length} NFL player(s) for: ${name}`);
    return nflPlayers.length > 0 ? nflPlayers : null;

  } catch (error) {
    console.error(`❌ Error searching player "${name}":`, error.message);
    throw new Error(`PLAYER_SEARCH_FAILED: ${error.message}`);
  }
}

/**
 * Get last/recent events for a team
 * @param {string} teamId - TheSportsDB team ID
 * @returns {Promise<Array|null>} Array of recent events or null
 */
async function eventsLast(teamId) {
  try {
    const url = `${BASE_URL}/${API_KEY}/eventslast.php?id=${encodeURIComponent(teamId)}`;
    const response = await limitedGet(url);
    
    const events = response.data?.results;
    if (!events || events.length === 0) {
      console.log(`⚠️ No recent events found for team: ${teamId}`);
      return null;
    }

    console.log(`✅ Found ${events.length} recent event(s) for team: ${teamId}`);
    return events;

  } catch (error) {
    console.error(`❌ Error getting last events for team ${teamId}:`, error.message);
    throw new Error(`EVENTS_LAST_FAILED: ${error.message}`);
  }
}

/**
 * Get next/upcoming events for a team
 * @param {string} teamId - TheSportsDB team ID
 * @returns {Promise<Array|null>} Array of upcoming events or null
 */
async function eventsNext(teamId) {
  try {
    const url = `${BASE_URL}/${API_KEY}/eventsnext.php?id=${encodeURIComponent(teamId)}`;
    const response = await limitedGet(url);
    
    const events = response.data?.events;
    if (!events || events.length === 0) {
      console.log(`⚠️ No upcoming events found for team: ${teamId}`);
      return null;
    }

    console.log(`✅ Found ${events.length} upcoming event(s) for team: ${teamId}`);
    return events;

  } catch (error) {
    console.error(`❌ Error getting next events for team ${teamId}:`, error.message);
    throw new Error(`EVENTS_NEXT_FAILED: ${error.message}`);
  }
}

/**
 * Get timeline data for a specific event
 * @param {string} eventId - TheSportsDB event ID
 * @returns {Promise<Array|null>} Array of timeline entries or null
 */
async function lookupTimeline(eventId) {
  try {
    const url = `${BASE_URL}/${API_KEY}/lookuptimeline.php?id=${encodeURIComponent(eventId)}`;
    const response = await limitedGet(url);
    
    const timeline = response.data?.timeline;
    if (!timeline || timeline.length === 0) {
      console.log(`⚠️ No timeline found for event: ${eventId}`);
      return null;
    }

    console.log(`✅ Found ${timeline.length} timeline entries for event: ${eventId}`);
    return timeline;

  } catch (error) {
    console.error(`❌ Error getting timeline for event ${eventId}:`, error.message);
    throw new Error(`TIMELINE_LOOKUP_FAILED: ${error.message}`);
  }
}

/**
 * Get detailed player information by ID
 * @param {string} playerId - TheSportsDB player ID
 * @returns {Promise<Object|null>} Player details or null
 */
async function lookupPlayer(playerId) {
  try {
    const url = `${BASE_URL}/${API_KEY}/lookupplayer.php?id=${encodeURIComponent(playerId)}`;
    const response = await limitedGet(url);
    
    const players = response.data?.players;
    if (!players || players.length === 0) {
      console.log(`⚠️ No player details found for ID: ${playerId}`);
      return null;
    }

    console.log(`✅ Found player details for ID: ${playerId}`);
    return players[0];

  } catch (error) {
    console.error(`❌ Error looking up player ${playerId}:`, error.message);
    throw new Error(`PLAYER_LOOKUP_FAILED: ${error.message}`);
  }
}

/**
 * Get comprehensive team data for status analysis
 * @param {string} teamName - Name of the team
 * @returns {Promise<Object>} Team data with events and timeline
 */
async function getTeamStatusData(teamName) {
  try {
    console.log(`📡 Fetching comprehensive data for team: ${teamName}`);

    // Step 1: Find the team
    const teams = await searchTeamByName(teamName);
    if (!teams || teams.length === 0) {
      throw new Error('TEAM_NOT_FOUND');
    }

    const team = teams[0]; // Take first matching NFL team

    // Step 2: Get recent events (parallel fetch)
    const [lastEvents, nextEvents] = await Promise.all([
      eventsLast(team.idTeam).catch(() => null),
      eventsNext(team.idTeam).catch(() => null)
    ]);

    // Step 3: Get timeline from most recent event
    let timeline = null;
    if (lastEvents && lastEvents.length > 0) {
      const recentEvent = lastEvents[0];
      if (recentEvent.idEvent) {
        timeline = await lookupTimeline(recentEvent.idEvent).catch(() => null);
      }
    }

    const result = {
      team,
      lastEvent: lastEvents?.[0] || null,
      nextEvents: nextEvents || [],
      timeline: timeline || []
    };

    console.log(`✅ Successfully fetched team data for: ${team.strTeam}`);
    return result;

  } catch (error) {
    console.error(`❌ Error getting team status data for ${teamName}:`, error.message);
    throw error;
  }
}

/**
 * Get comprehensive player data for status analysis
 * @param {string} playerName - Name of the player
 * @returns {Promise<Object>} Player data with team timeline
 */
async function getPlayerStatusData(playerName) {
  try {
    console.log(`📡 Fetching comprehensive data for player: ${playerName}`);

    // Step 1: Find the player
    const players = await searchPlayerByName(playerName);
    if (!players || players.length === 0) {
      throw new Error('PLAYER_NOT_FOUND');
    }

    // Select most relevant player (prefer current NFL players)
    let selectedPlayer = players[0];
    const currentPlayers = players.filter(p => p.strTeam && p.strTeam.trim().length > 0);
    if (currentPlayers.length > 0) {
      selectedPlayer = currentPlayers[0];
    }

    // Step 2: Get detailed player info
    const playerDetails = await lookupPlayer(selectedPlayer.idPlayer).catch(() => selectedPlayer);

    // Step 3: Get team timeline if player has a current team
    let teamTimeline = null;
    if (playerDetails.strTeam && playerDetails.idTeam) {
      try {
        const teamStatusData = await getTeamStatusData(playerDetails.strTeam);
        teamTimeline = teamStatusData.timeline;
      } catch (error) {
        console.warn(`⚠️ Could not fetch team data for player's team: ${playerDetails.strTeam}`);
      }
    }

    const result = {
      player: selectedPlayer,
      playerDetails,
      teamTimeline: teamTimeline || []
    };

    console.log(`✅ Successfully fetched player data for: ${playerDetails.strPlayer}`);
    return result;

  } catch (error) {
    console.error(`❌ Error getting player status data for ${playerName}:`, error.message);
    throw error;
  }
}

module.exports = {
  searchTeamByName,
  searchPlayerByName,
  eventsLast,
  eventsNext,
  lookupTimeline,
  lookupPlayer,
  getTeamStatusData,
  getPlayerStatusData
};