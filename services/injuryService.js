const dayjs = require('dayjs');
const { getTeamStatusData, searchTeamByName } = require('./sportsdb');
const { fetchFallbackNews } = require('./rssFallback');
const summarizer = require('./summarizer');
const { getCache, setCache, CacheKeys } = require('../lib/cache');
const config = require('../config/config');

/**
 * NFL Injury Service
 * Specialized service for injury reports and roster changes
 */

/**
 * Extract injury-related keywords from text
 * @param {string} text - Text to analyze
 * @returns {boolean} True if injury-related
 */
function isInjuryRelated(text) {
  const injuryKeywords = [
    'injury', 'injured', 'hurt', 'surgery', 'out', 'questionable', 'doubtful',
    'dnp', 'did not practice', 'limited', 'ir', 'injured reserve', 'pup',
    'ruled out', 'game-time decision', 'setback', 'rehab', 'recovery',
    'practice report', 'illness', 'concussion', 'protocol', 'designation',
    'waived', 'released', 'signed', 'promoted', 'practice squad', 'roster move',
    'activated', 'placed on', 'cleared', 'return', 'expected back'
  ];
  
  const lowerText = text.toLowerCase();
  return injuryKeywords.some(keyword => lowerText.includes(keyword));
}

/**
 * Get team-specific injury and roster updates
 * @param {string} teamName - NFL team name
 * @returns {Promise<Object>} Injury report data
 */
async function getTeamInjuries(teamName) {
  const cacheKey = `injuries:team:${teamName.toLowerCase()}`;
  
  try {
    // Check cache first
    const cached = await getCache(cacheKey);
    if (cached) {
      console.log(`💾 Returning cached injury report for: ${teamName}`);
      return { ...cached, source: 'Cached' };
    }

    console.log(`🏥 Fetching injury report for team: ${teamName}`);
    
    // Step 1: Try SportsDB first (following proper fallback chain)
    let teamData = null;
    let sportsDbData = null;
    
    try {
      console.log(`🏈 Attempting SportsDB injury lookup for team: ${teamName}`);
      sportsDbData = await getTeamStatusData(teamName);
      
      teamData = {
        name: sportsDbData.team.strTeam,
        logo: sportsDbData.team.strTeamBadge || sportsDbData.team.strTeamLogo,
        id: sportsDbData.team.idTeam
      };

      // Try to generate injury report from SportsDB timeline data
      if (sportsDbData.timeline && sportsDbData.timeline.length > 0) {
        console.log(`📊 Analyzing SportsDB timeline data for injuries...`);
        
        const summary = await summarizer.summarizeFromSportsDB({
          teamName: sportsDbData.team.strTeam,
          lastEvent: sportsDbData.lastEvent,
          timeline: sportsDbData.timeline
        });

        // If we got meaningful injury data from SportsDB, use it
        if (summary && !summary.includes('No significant updates') && !summary.includes('Limited data available')) {
          const parsedData = parseInjuryReport(summary);
          const totalUpdates = 
            parsedData.injuries.length + 
            parsedData.rosterMoves.length + 
            parsedData.practiceReport.length + 
            (parsedData.uncategorized?.length || 0);

          if (totalUpdates > 0) {
            const result = {
              title: `🏥 ${sportsDbData.team.strTeam} Injury Report (${dayjs().format('MMM D')})`,
              summary: `Found ${totalUpdates} injury/roster updates`,
              fullReport: summary,
              injuries: parsedData.injuries,
              rosterMoves: parsedData.rosterMoves,
              practiceReport: parsedData.practiceReport,
              uncategorized: parsedData.uncategorized,
              severity: determineSeverity(parsedData),
              source: 'SportsDB',
              teamData,
              itemCount: totalUpdates,
              lastUpdated: dayjs().toISOString()
            };

            await setCache(cacheKey, result, 20);
            console.log(`✅ SportsDB injury report generated for: ${sportsDbData.team.strTeam}`);
            return result;
          }
        }
      }

      console.log(`⚠️ SportsDB data insufficient for injury analysis, falling back to RSS...`);
      
    } catch (error) {
      console.warn(`⚠️ SportsDB failed for team ${teamName}:`, error.message);
      console.log(`📰 Falling back to RSS sources for team: ${teamName}`);
    }

    // Step 2: Fallback to RSS news analysis
    const newsItems = await fetchFallbackNews(teamName);
    
    // Filter for injury-related news
    const injuryNews = newsItems.filter(item => 
      isInjuryRelated(item.title + ' ' + item.contentSnippet)
    );

    console.log(`📰 Found ${injuryNews.length} injury-related items for ${teamName}`);

    // Generate injury-focused summary
    const summary = await summarizer.summarizeInjuries({
      teamName: teamData?.name || teamName,
      items: injuryNews
    });

    // Parse summary into categories
    const parsedData = parseInjuryReport(summary);

    const totalUpdates = 
      parsedData.injuries.length + 
      parsedData.rosterMoves.length + 
      parsedData.practiceReport.length + 
      (parsedData.uncategorized?.length || 0);

    const result = {
      title: `🏥 ${teamData?.name || teamName} Injury Report (${dayjs().format('MMM D')})`,
      summary: totalUpdates > 0 ? 
        `Found ${totalUpdates} injury/roster updates` : 
        'No recent injury or roster updates found',
      fullReport: summary, // Include the full GPT report  
      injuries: parsedData.injuries,
      rosterMoves: parsedData.rosterMoves,
      practiceReport: parsedData.practiceReport,
      uncategorized: parsedData.uncategorized,
      severity: determineSeverity(parsedData),
      source: 'RSS Fallback',
      teamData,
      itemCount: injuryNews.length,
      lastUpdated: dayjs().toISOString()
    };

    // Cache for 15 minutes
    await setCache(cacheKey, result, 15);
    console.log(`✅ Injury report generated for: ${teamData?.name || teamName}`);
    
    return result;

  } catch (error) {
    console.error(`❌ Error getting injury report for ${teamName}:`, error.message);
    
    return {
      title: `❌ ${teamName} Injury Report - Error`,
      summary: 'Unable to fetch injury report from SportsDB or RSS sources',
      injuries: [],
      rosterMoves: [],
      practiceReport: [],
      uncategorized: [],
      severity: 'unknown',
      source: 'Error',
      error: true,
      lastUpdated: dayjs().toISOString()
    };
  }
}

/**
 * Get league-wide injury updates
 * @returns {Promise<Object>} League injury report data
 */
async function getLeagueInjuries() {
  const cacheKey = 'injuries:league:all';
  
  try {
    // Check cache first
    const cached = await getCache(cacheKey);
    if (cached) {
      console.log('💾 Returning cached league injury report');
      return { ...cached, source: 'Cached' };
    }

    console.log('🏥 Fetching league-wide injury report');
    
    // Step 1: Try SportsDB approach - sample key teams for timeline data
    const sampleTeams = ['eagles', 'cowboys', 'patriots', 'packers', 'ravens']; // Sample of popular teams
    let sportsDbData = [];
    let timelineCount = 0;
    
    console.log('🏈 Attempting SportsDB league analysis from sample teams...');
    
    try {
      for (const teamName of sampleTeams) {
        try {
          const teamData = await getTeamStatusData(teamName);
          if (teamData.timeline && teamData.timeline.length > 0) {
            sportsDbData.push({
              team: teamData.team.strTeam,
              timeline: teamData.timeline,
              lastEvent: teamData.lastEvent
            });
            timelineCount += teamData.timeline.length;
          }
        } catch (error) {
          console.warn(`⚠️ Failed to get SportsDB data for ${teamName}:`, error.message);
        }
        
        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      console.log(`📊 Collected timeline data from ${sportsDbData.length} teams (${timelineCount} events)`);
      
      // If we have significant timeline data, try to analyze it
      if (timelineCount >= 3) {
        console.log('📈 Analyzing SportsDB timeline data for league injuries...');
        
        // Combine all timeline data for analysis
        const combinedTimeline = sportsDbData.flatMap(team => 
          team.timeline.map(event => ({
            ...event,
            teamName: team.team
          }))
        );
        
        const summary = await summarizer.summarizeFromSportsDB({
          teamName: 'League-wide',
          lastEvent: null,
          timeline: combinedTimeline
        });
        
        // If we got meaningful data from SportsDB, use it
        if (summary && !summary.includes('No significant updates') && !summary.includes('Limited data available')) {
          const parsedData = parseInjuryReport(summary);
          const totalUpdates = 
            parsedData.injuries.length + 
            parsedData.rosterMoves.length + 
            parsedData.practiceReport.length + 
            (parsedData.uncategorized?.length || 0);

          if (totalUpdates > 0) {
            const result = {
              title: `🏥 NFL Injury Report - League Wide (${dayjs().format('MMM D')})`,
              summary: `${totalUpdates} injury/roster updates across the league`,
              fullReport: summary,
              injuries: parsedData.injuries,
              rosterMoves: parsedData.rosterMoves,
              practiceReport: parsedData.practiceReport,
              uncategorized: parsedData.uncategorized,
              severity: determineSeverity(parsedData),
              source: 'SportsDB',
              itemCount: totalUpdates,
              teamsAnalyzed: sportsDbData.length,
              lastUpdated: dayjs().toISOString()
            };

            await setCache(cacheKey, result, 15);
            console.log(`✅ SportsDB league injury report generated from ${sportsDbData.length} teams`);
            return result;
          }
        }
      }
      
      console.log('⚠️ SportsDB league data insufficient, falling back to RSS...');
      
    } catch (error) {
      console.warn('⚠️ SportsDB league analysis failed:', error.message);
      console.log('📰 Falling back to RSS sources for league report...');
    }
    
    // Step 2: Fallback to RSS news analysis
    const newsItems = await fetchFallbackNews('NFL');
    
    // Filter for injury-related news
    const injuryNews = newsItems.filter(item => 
      isInjuryRelated(item.title + ' ' + item.contentSnippet)
    );

    console.log(`📰 Found ${injuryNews.length} league-wide injury items`);

    // Generate league-wide injury summary
    const summary = await summarizer.summarizeInjuries({
      teamName: 'League-wide',
      items: injuryNews,
      isLeagueWide: true
    });

    // Parse summary into categories
    const parsedData = parseInjuryReport(summary);

    const totalUpdates = 
      parsedData.injuries.length + 
      parsedData.rosterMoves.length + 
      parsedData.practiceReport.length + 
      (parsedData.uncategorized?.length || 0);

    const result = {
      title: `🏥 NFL Injury Report - League Wide (${dayjs().format('MMM D')})`,
      summary: totalUpdates > 0 ? 
        `${totalUpdates} injury/roster updates across the league` : 
        'No significant injury updates across the league',
      fullReport: summary, // Include the full GPT report
      injuries: parsedData.injuries,
      rosterMoves: parsedData.rosterMoves,
      practiceReport: parsedData.practiceReport,
      uncategorized: parsedData.uncategorized,
      severity: determineSeverity(parsedData),
      source: 'RSS Fallback',
      itemCount: injuryNews.length,
      lastUpdated: dayjs().toISOString()
    };

    // Cache for 10 minutes (league-wide updates more frequently)
    await setCache(cacheKey, result, 10);
    console.log('✅ League injury report generated');
    
    return result;

  } catch (error) {
    console.error('❌ Error getting league injury report:', error.message);
    
    return {
      title: '❌ NFL Injury Report - Error',
      summary: 'Unable to fetch league injury report at this time',
      injuries: [],
      rosterMoves: [],
      practiceReport: [],
      severity: 'unknown',
      source: 'Error',
      error: true,
      lastUpdated: dayjs().toISOString()
    };
  }
}

/**
 * Parse injury report summary into structured categories
 * @param {string} summary - GPT-generated summary
 * @returns {Object} Parsed injury data
 */
function parseInjuryReport(summary) {
  const injuries = [];
  const rosterMoves = [];
  const practiceReport = [];
  const uncategorized = [];

  if (!summary || typeof summary !== 'string') {
    return { injuries, rosterMoves, practiceReport, uncategorized };
  }

  // Split by bullet points and clean up
  const lines = summary.split('\n').filter(line => line.trim());

  lines.forEach(line => {
    const trimmed = line.trim();
    
    // Skip empty lines or headers
    if (!trimmed || trimmed.length < 3) return;
    
    // Categorize based on content and emojis
    if (trimmed.includes('🏥') || trimmed.includes('🛑') || 
        trimmed.match(/injured|hurt|out|questionable|doubtful|DNP|did not practice|limited practice|concussion|IR|injured reserve/i)) {
      injuries.push(trimmed);
    } else if (trimmed.includes('🔄') || trimmed.includes('📝') ||
               trimmed.match(/signed|released|waived|promoted|activated|traded|acquired|claimed|cut|placed on|designated/i)) {
      rosterMoves.push(trimmed);
    } else if (trimmed.includes('📋') || trimmed.match(/practice|limited|full participation|workout|training/i)) {
      practiceReport.push(trimmed);
    } else if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
      // Catch any bullet points that weren't categorized
      uncategorized.push(trimmed);
    }
  });

  // If we have uncategorized items, try to categorize them or add to injuries as default
  uncategorized.forEach(item => {
    if (item.match(/player|position|team|NFL/i)) {
      // Likely an injury or roster move, add to injuries as safe default
      injuries.push(item);
    }
  });

  return { injuries, rosterMoves, practiceReport, uncategorized };
}

/**
 * Determine severity level based on injury data
 * @param {Object} parsedData - Parsed injury data
 * @returns {string} Severity level (high/medium/low)
 */
function determineSeverity(parsedData) {
  const totalIssues = 
    parsedData.injuries.length + 
    parsedData.rosterMoves.length + 
    parsedData.practiceReport.length;

  // Check for key players or serious injuries
  const seriousKeywords = ['ruled out', 'IR', 'injured reserve', 'surgery', 'season-ending'];
  const hasSeriousInjury = parsedData.injuries.some(injury => 
    seriousKeywords.some(keyword => injury.toLowerCase().includes(keyword.toLowerCase()))
  );

  if (hasSeriousInjury || parsedData.injuries.length >= 5) {
    return 'high';
  } else if (totalIssues >= 3) {
    return 'medium';
  } else {
    return 'low';
  }
}

module.exports = {
  getTeamInjuries,
  getLeagueInjuries,
  isInjuryRelated
};