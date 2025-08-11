#!/usr/bin/env node

const axios = require('axios');

/**
 * Demonstration of optimized NFL schedule retrieval using TheSportsDB
 * Shows the difference between current team-by-team approach and optimized league-wide approach
 */

const API_KEY = '123'; // Free test key
const NFL_LEAGUE_ID = '4391';
const BASE_URL_V1 = 'https://www.thesportsdb.com/api/v1/json';

class OptimizedNFLScheduler {
  constructor() {
    this.baseUrl = BASE_URL_V1;
    this.apiKey = API_KEY;
    this.nflLeagueId = NFL_LEAGUE_ID;
  }

  /**
   * OPTIMIZED APPROACH: Get entire NFL season with 1 API call
   * @param {string} season - Season year (e.g., "2025")
   * @returns {Array} All NFL games for the season
   */
  async getNFLSeasonSchedule(season = '2025') {
    try {
      const url = `${this.baseUrl}/${this.apiKey}/eventsseason.php?id=${this.nflLeagueId}&s=${season}`;
      console.log(`🏈 Fetching entire NFL ${season} season with 1 API call...`);
      
      const response = await axios.get(url, { timeout: 15000 });
      const games = response.data.events || [];
      
      console.log(`✅ Retrieved ${games.length} NFL games`);
      return games;
    } catch (error) {
      console.error(`❌ Error fetching season schedule: ${error.message}`);
      return [];
    }
  }

  /**
   * Filter games to a specific date range
   * @param {Array} games - All games from season
   * @param {Date} startDate - Start of range
   * @param {number} days - Number of days to include
   * @returns {Array} Games within the date range
   */
  filterGamesByDateRange(games, startDate, days = 14) {
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + days);
    
    return games.filter(game => {
      const gameDate = new Date(game.dateEvent);
      return gameDate >= startDate && gameDate < endDate;
    });
  }

  /**
   * ALTERNATIVE: Get next/past events with 2 API calls
   * @returns {Array} Recent and upcoming NFL games
   */
  async getNFLRecentAndUpcoming() {
    try {
      console.log(`🔄 Fetching recent + upcoming NFL games with 2 API calls...`);
      
      const [pastResponse, nextResponse] = await Promise.all([
        axios.get(`${this.baseUrl}/${this.apiKey}/eventspastleague.php?id=${this.nflLeagueId}`, { timeout: 10000 }),
        axios.get(`${this.baseUrl}/${this.apiKey}/eventsnextleague.php?id=${this.nflLeagueId}`, { timeout: 10000 })
      ]);
      
      const pastGames = pastResponse.data.events || [];
      const nextGames = nextResponse.data.events || [];
      const allGames = [...pastGames, ...nextGames];
      
      console.log(`✅ Retrieved ${pastGames.length} past + ${nextGames.length} upcoming = ${allGames.length} total games`);
      return allGames;
    } catch (error) {
      console.error(`❌ Error fetching recent/upcoming games: ${error.message}`);
      return [];
    }
  }

  /**
   * ALTERNATIVE: Get games for specific dates (14 API calls)
   * @param {Date} startDate - Start date
   * @param {number} days - Number of days to query
   * @returns {Array} All NFL games in the date range
   */
  async getNFLGamesByDateRange(startDate, days = 14) {
    console.log(`📅 Fetching NFL games for ${days} days with ${days} API calls...`);
    
    const allGames = [];
    
    for (let i = 0; i < days; i++) {
      const queryDate = new Date(startDate);
      queryDate.setDate(startDate.getDate() + i);
      const dateStr = queryDate.toISOString().split('T')[0];
      
      try {
        const url = `${this.baseUrl}/${this.apiKey}/eventsday.php?d=${dateStr}&s=American Football`;
        const response = await axios.get(url, { timeout: 10000 });
        
        if (response.data.events) {
          const nflGames = response.data.events.filter(event => event.strLeague === 'NFL');
          allGames.push(...nflGames);
        }
        
        // Rate limiting delay
        if (i < days - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (error) {
        console.error(`   ❌ Error for ${dateStr}: ${error.message}`);
      }
    }
    
    console.log(`✅ Retrieved ${allGames.length} NFL games from date range queries`);
    return allGames;
  }

  /**
   * Format game for display
   * @param {Object} game - Game object
   * @returns {string} Formatted game string
   */
  formatGame(game) {
    const date = new Date(game.dateEvent).toLocaleDateString();
    const time = game.strTime || 'TBD';
    const status = game.strStatus || 'Scheduled';
    return `${game.strAwayTeam} @ ${game.strHomeTeam} - ${date} ${time} (${status})`;
  }
}

async function demonstrateOptimization() {
  const scheduler = new OptimizedNFLScheduler();
  const today = new Date();
  
  console.log('🚀 NFL Schedule API Optimization Demonstration\n');
  console.log('═'.repeat(70));
  
  // Strategy 1: Single season API call (RECOMMENDED)
  console.log('\n📋 STRATEGY 1: Season Schedule (MOST EFFICIENT)');
  console.log('─'.repeat(50));
  
  const startTime1 = Date.now();
  const seasonGames = await scheduler.getNFLSeasonSchedule('2025');
  const seasonTime = Date.now() - startTime1;
  
  // Filter to 14-day window
  const gamesIn14Days = scheduler.filterGamesByDateRange(seasonGames, today, 14);
  
  console.log(`⏱️  Time taken: ${seasonTime}ms`);
  console.log(`📊 API calls made: 1`);
  console.log(`🎯 Games in next 14 days: ${gamesIn14Days.length}`);
  console.log(`📈 Total season games available: ${seasonGames.length}`);
  
  if (gamesIn14Days.length > 0) {
    console.log('\n📅 Next 14-day games:');
    gamesIn14Days.slice(0, 5).forEach(game => {
      console.log(`   ${scheduler.formatGame(game)}`);
    });
    if (gamesIn14Days.length > 5) {
      console.log(`   ... and ${gamesIn14Days.length - 5} more games`);
    }
  }
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Strategy 2: Recent + Upcoming (ALTERNATIVE)
  console.log('\n📋 STRATEGY 2: Recent + Upcoming Events');
  console.log('─'.repeat(50));
  
  const startTime2 = Date.now();
  const recentUpcomingGames = await scheduler.getNFLRecentAndUpcoming();
  const recentUpcomingTime = Date.now() - startTime2;
  
  console.log(`⏱️  Time taken: ${recentUpcomingTime}ms`);
  console.log(`📊 API calls made: 2`);
  console.log(`🎯 Total games retrieved: ${recentUpcomingGames.length}`);
  
  if (recentUpcomingGames.length > 0) {
    console.log('\n📅 Sample games:');
    recentUpcomingGames.slice(0, 3).forEach(game => {
      console.log(`   ${scheduler.formatGame(game)}`);
    });
  }
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Strategy 3: Date range queries (CURRENT ALTERNATIVE)
  console.log('\n📋 STRATEGY 3: Date Range Queries');
  console.log('─'.repeat(50));
  
  const startTime3 = Date.now();
  const dateRangeGames = await scheduler.getNFLGamesByDateRange(today, 7); // 7 days to reduce API calls for demo
  const dateRangeTime = Date.now() - startTime3;
  
  console.log(`⏱️  Time taken: ${dateRangeTime}ms`);
  console.log(`📊 API calls made: 7 (would be 14 for full 14-day window)`);
  console.log(`🎯 Games found: ${dateRangeGames.length}`);
  
  // Performance Comparison
  console.log('\n' + '═'.repeat(70));
  console.log('📊 PERFORMANCE COMPARISON');
  console.log('═'.repeat(70));
  
  const currentApproachCalls = 64; // 32 teams × 2 endpoints
  
  console.log(`
┌─────────────────────────────┬──────────────┬──────────────┬─────────────────┐
│ Strategy                    │ API Calls    │ Time (ms)    │ Efficiency      │
├─────────────────────────────┼──────────────┼──────────────┼─────────────────┤
│ 1. Season Schedule          │      1       │    ${seasonTime.toString().padStart(6)}     │ 🥇 BEST         │
│ 2. Recent + Upcoming        │      2       │    ${recentUpcomingTime.toString().padStart(6)}     │ 🥈 Good         │
│ 3. Date Range (14 days)     │     14       │    ~${(dateRangeTime * 2).toString().padStart(5)}     │ 🥉 Okay         │
│ 4. Current (32 teams)       │     64       │   ~${(dateRangeTime * 9).toString().padStart(6)}     │ ❌ Inefficient  │
└─────────────────────────────┴──────────────┴──────────────┴─────────────────┘
`);

  console.log('💡 RECOMMENDATIONS:');
  console.log('1. 🎯 USE STRATEGY 1 for maximum efficiency (98% fewer API calls)');
  console.log('2. 🔄 USE STRATEGY 2 for "around now" windows when full season not needed');
  console.log('3. ❌ AVOID current team-by-team approach - wastes API quota and risks rate limits');
  
  console.log('\n🔧 IMPLEMENTATION STEPS:');
  console.log('1. Add eventsseason.php endpoint to your config');
  console.log('2. Create getNFLSeasonSchedule() method in your API service');
  console.log('3. Replace current team iteration with season call + client-side filtering');
  console.log('4. Reduce API usage from 64 calls to 1 call per update');
  console.log('5. Keep season data cached to avoid repeated API calls');

  console.log('\n✨ Result: 98.4% reduction in API calls with better data coverage!');
}

demonstrateOptimization().catch(console.error);