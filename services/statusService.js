const dayjs = require('dayjs');
const { getTeamStatusData, getPlayerStatusData } = require('./sportsdb');
const { fetchFallbackNews } = require('./rssFallback');
const summarizer = require('./summarizer');
const { getCache, setCache, CacheKeys } = require('../lib/cache');

/**
 * NFL Status Service
 * Orchestrates the flow: SportsDB → RSS Fallback → Cache
 * Provides transparent source attribution
 */

/**
 * Get team status with fallback chain
 * @param {string} teamName - Name of the NFL team
 * @returns {Promise<Object>} Status result with source attribution
 */
async function getTeamStatus(teamName) {
  const cacheKey = CacheKeys.teamStatus(teamName);
  
  try {
    // Step 1: Check cache first
    const cached = await getCache(cacheKey);
    if (cached) {
      console.log(`💾 Returning cached team status for: ${teamName}`);
      return { ...cached, source: 'Cached' };
    }

    // Step 2: Try SportsDB primary source
    console.log(`🏈 Attempting SportsDB lookup for team: ${teamName}`);
    
    try {
      const sportsData = await getTeamStatusData(teamName);
      
      // Generate summary using SportsDB data
      const summary = await summarizer.summarizeFromSportsDB({
        teamName: sportsData.team.strTeam,
        lastEvent: sportsData.lastEvent,
        timeline: sportsData.timeline
      });

      const result = {
        title: `🟢 ${sportsData.team.strTeam} Status (${dayjs().format('MMM D')})`,
        summary: summary || 'No significant updates found from recent games.',
        source: 'SportsDB',
        teamData: {
          name: sportsData.team.strTeam,
          id: sportsData.team.idTeam,
          logo: sportsData.team.strTeamBadge || sportsData.team.strTeamLogo
        },
        lastUpdated: dayjs().toISOString()
      };

      // Cache successful result
      await setCache(cacheKey, result, 20); // 20 minute cache
      console.log(`✅ SportsDB team status generated for: ${sportsData.team.strTeam}`);
      return result;

    } catch (sportsDbError) {
      console.warn(`⚠️ SportsDB failed for team ${teamName}:`, sportsDbError.message);
      
      // Step 3: Fallback to RSS sources
      console.log(`📰 Falling back to RSS sources for team: ${teamName}`);
      
      try {
        const rssItems = await fetchFallbackNews(teamName);
        
        if (rssItems.length === 0) {
          throw new Error('No RSS items found');
        }

        const summary = await summarizer.summarizeFromRSS({
          subject: teamName,
          items: rssItems
        });

        const result = {
          title: `🟡 ${teamName} Status – Fallback (${dayjs().format('MMM D')})`,
          summary: summary || 'No confirmed updates found from fallback sources.',
          source: 'RSS fallback',
          rssItemCount: rssItems.length,
          lastUpdated: dayjs().toISOString()
        };

        // Cache fallback result with shorter TTL
        await setCache(cacheKey, result, 10); // 10 minute cache for fallback
        console.log(`✅ RSS fallback team status generated for: ${teamName}`);
        return result;

      } catch (rssError) {
        console.error(`❌ RSS fallback also failed for team ${teamName}:`, rssError.message);
        
        // Step 4: Return error result (will still be cached briefly)
        const result = {
          title: `❌ ${teamName} Status - Unavailable`,
          summary: 'Unable to fetch team status from primary or fallback sources. Please try again later.',
          source: 'Error',
          error: true,
          lastUpdated: dayjs().toISOString()
        };

        // Cache error result very briefly
        await setCache(cacheKey, result, 2); // 2 minute cache for errors
        return result;
      }
    }

  } catch (error) {
    console.error(`❌ Unexpected error in getTeamStatus for ${teamName}:`, error.message);
    
    return {
      title: `❌ ${teamName} Status - Error`,
      summary: 'An unexpected error occurred while fetching team status.',
      source: 'System Error',
      error: true,
      lastUpdated: dayjs().toISOString()
    };
  }
}

/**
 * Get player status with fallback chain
 * @param {string} playerName - Name of the NFL player
 * @returns {Promise<Object>} Status result with source attribution
 */
async function getPlayerStatus(playerName) {
  const cacheKey = CacheKeys.playerStatus(playerName);
  
  try {
    // Step 1: Check cache first
    const cached = await getCache(cacheKey);
    if (cached) {
      console.log(`💾 Returning cached player status for: ${playerName}`);
      return { ...cached, source: 'Cached' };
    }

    // Step 2: Try SportsDB primary source
    console.log(`🏈 Attempting SportsDB lookup for player: ${playerName}`);
    
    try {
      const playerData = await getPlayerStatusData(playerName);
      
      // Generate summary using player data and team timeline
      const summary = await summarizer.summarizePlayerFromTeamData({
        playerName: playerData.playerDetails.strPlayer,
        playerData: playerData.playerDetails,
        teamTimeline: playerData.teamTimeline
      });

      const result = {
        title: `👤 ${playerData.playerDetails.strPlayer} – Status (${dayjs().format('MMM D')})`,
        summary: summary || 'No specific status updates found for this player.',
        source: 'SportsDB',
        playerData: {
          name: playerData.playerDetails.strPlayer,
          team: playerData.playerDetails.strTeam,
          position: playerData.playerDetails.strPosition,
          image: playerData.playerDetails.strThumb || playerData.playerDetails.strCutout
        },
        lastUpdated: dayjs().toISOString()
      };

      // Cache successful result
      await setCache(cacheKey, result, 20); // 20 minute cache
      console.log(`✅ SportsDB player status generated for: ${playerData.playerDetails.strPlayer}`);
      return result;

    } catch (sportsDbError) {
      console.warn(`⚠️ SportsDB failed for player ${playerName}:`, sportsDbError.message);
      
      // Step 3: Fallback to RSS sources
      console.log(`📰 Falling back to RSS sources for player: ${playerName}`);
      
      try {
        const rssItems = await fetchFallbackNews(playerName);
        
        if (rssItems.length === 0) {
          throw new Error('No RSS items found');
        }

        const summary = await summarizer.summarizeFromRSS({
          subject: playerName,
          items: rssItems
        });

        const result = {
          title: `👤 ${playerName} – Fallback (${dayjs().format('MMM D')})`,
          summary: summary || 'No confirmed updates found from fallback sources.',
          source: 'RSS fallback',
          rssItemCount: rssItems.length,
          lastUpdated: dayjs().toISOString()
        };

        // Cache fallback result with shorter TTL
        await setCache(cacheKey, result, 15); // 15 minute cache for player fallback
        console.log(`✅ RSS fallback player status generated for: ${playerName}`);
        return result;

      } catch (rssError) {
        console.error(`❌ RSS fallback also failed for player ${playerName}:`, rssError.message);
        
        // Step 4: Return error result
        const result = {
          title: `❌ ${playerName} Status - Unavailable`,
          summary: 'Unable to fetch player status from primary or fallback sources. Please try again later.',
          source: 'Error',
          error: true,
          lastUpdated: dayjs().toISOString()
        };

        // Cache error result very briefly
        await setCache(cacheKey, result, 2); // 2 minute cache for errors
        return result;
      }
    }

  } catch (error) {
    console.error(`❌ Unexpected error in getPlayerStatus for ${playerName}:`, error.message);
    
    return {
      title: `❌ ${playerName} Status - Error`,
      summary: 'An unexpected error occurred while fetching player status.',
      source: 'System Error',
      error: true,
      lastUpdated: dayjs().toISOString()
    };
  }
}

/**
 * Smart detection: try team first, then player
 * @param {string} target - Team or player name
 * @returns {Promise<Object>} Status result with source attribution
 */
async function getStatus(target) {
  console.log(`🔍 Smart status lookup for: "${target}"`);
  
  try {
    // First attempt: try as team
    const teamResult = await getTeamStatus(target);
    
    // If team lookup succeeded (not an error), return it
    if (!teamResult.error) {
      console.log(`✅ Successfully identified "${target}" as team`);
      return teamResult;
    }

    // If team failed, try as player
    console.log(`⚠️ Team lookup failed, trying as player: "${target}"`);
    const playerResult = await getPlayerStatus(target);
    
    // Return player result regardless of success/failure
    if (!playerResult.error) {
      console.log(`✅ Successfully identified "${target}" as player`);
    }
    
    return playerResult;

  } catch (error) {
    console.error(`❌ Smart status lookup failed for "${target}":`, error.message);
    
    return {
      title: `❌ "${target}" - Not Found`,
      summary: 'Could not find this team or player in NFL databases or news sources.',
      source: 'Search Failed',
      error: true,
      lastUpdated: dayjs().toISOString()
    };
  }
}

/**
 * Get service statistics and health
 * @returns {Object} Service status information
 */
function getServiceStats() {
  return {
    service: 'NFL Status Service',
    version: '1.0.0',
    sources: ['SportsDB API', 'RSS Feeds', 'SQLite Cache'],
    cacheStatus: 'Active',
    rateLimiting: 'Enabled',
    fallbackFeeds: (process.env.FALLBACK_FEEDS || '').split(',').length
  };
}

module.exports = {
  getTeamStatus,
  getPlayerStatus,
  getStatus,
  getServiceStats
};