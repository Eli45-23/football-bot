#!/usr/bin/env node

const axios = require('axios');

/**
 * Test 14-day window strategy for NFL games using TheSportsDB
 */

const API_KEY = '123';
const NFL_LEAGUE_ID = '4391';
const BASE_URL_V1 = 'https://www.thesportsdb.com/api/v1/json';

// NFL team ID mappings found from the API responses
const nflTeamIds = {
  'Arizona Cardinals': '134934',
  'Atlanta Falcons': '134942',
  'Baltimore Ravens': '134936',
  'Buffalo Bills': '134935',
  'Carolina Panthers': '134937',
  'Chicago Bears': '134938',
  'Cincinnati Bengals': '134940',
  'Cleveland Browns': '134941',
  'Dallas Cowboys': '134945',
  'Denver Broncos': '134946',
  'Detroit Lions': '134939',
  'Green Bay Packers': '134943',
  'Houston Texans': '134948',
  'Indianapolis Colts': '134947',
  'Jacksonville Jaguars': '134949',
  'Kansas City Chiefs': '135908', // Found in API response
  'Las Vegas Raiders': '134950',
  'Los Angeles Chargers': '135908', // Found in API response
  'Los Angeles Rams': '134951',
  'Miami Dolphins': '134919', // Found in API response
  'Minnesota Vikings': '134952',
  'New England Patriots': '134953',
  'New Orleans Saints': '134954',
  'New York Giants': '134955',
  'New York Jets': '134956',
  'Philadelphia Eagles': '134958',
  'Pittsburgh Steelers': '134957',
  'San Francisco 49ers': '134959',
  'Seattle Seahawks': '134960',
  'Tampa Bay Buccaneers': '134961',
  'Tennessee Titans': '134929', // Found in API response
  'Washington Commanders': '134962'
};

async function testDateRange(startDate, days = 14) {
  console.log(`🏈 Testing ${days}-day NFL schedule strategy`);
  console.log(`Start date: ${startDate.toISOString().split('T')[0]}`);
  
  const allGames = [];
  const apiCalls = [];
  
  for (let i = 0; i < days; i++) {
    const testDate = new Date(startDate);
    testDate.setDate(startDate.getDate() + i);
    const dateStr = testDate.toISOString().split('T')[0];
    
    try {
      // Strategy 1: Get all American Football for the date, then filter NFL
      const url = `${BASE_URL_V1}/${API_KEY}/eventsday.php?d=${dateStr}&s=American Football`;
      
      console.log(`📅 Day ${i + 1}: ${dateStr}`);
      
      const response = await axios.get(url, { timeout: 10000 });
      apiCalls.push(url);
      
      if (response.data.events) {
        const nflGames = response.data.events.filter(event => event.strLeague === 'NFL');
        
        if (nflGames.length > 0) {
          console.log(`   ✅ Found ${nflGames.length} NFL game(s)`);
          nflGames.forEach(game => {
            console.log(`      ${game.strAwayTeam} @ ${game.strHomeTeam} - ${game.strTime || 'TBD'}`);
            allGames.push({
              date: dateStr,
              homeTeam: game.strHomeTeam,
              awayTeam: game.strAwayTeam,
              homeTeamId: game.idHomeTeam,
              awayTeamId: game.idAwayTeam,
              eventId: game.idEvent,
              time: game.strTime,
              status: game.strStatus
            });
          });
        } else {
          console.log(`   ⚫ No NFL games`);
        }
      } else {
        console.log(`   ❌ No events data`);
      }
      
      // Add delay to avoid rate limiting
      if (i < days - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
  
  return { allGames, apiCalls };
}

async function testAlternativeStrategies() {
  console.log('🔍 Testing Alternative NFL Schedule Strategies\n');
  
  // Test Strategy 1: 14-day date iteration
  const today = new Date();
  const { allGames, apiCalls } = await testDateRange(today, 14);
  
  console.log('\n📊 === RESULTS ===');
  console.log(`Total NFL games found: ${allGames.length}`);
  console.log(`Total API calls made: ${apiCalls.length}`);
  
  // Show unique teams found
  const uniqueTeams = new Set();
  allGames.forEach(game => {
    uniqueTeams.add(game.homeTeam);
    uniqueTeams.add(game.awayTeam);
  });
  console.log(`Unique teams involved: ${uniqueTeams.size}`);
  
  // Group by date
  const gamesByDate = {};
  allGames.forEach(game => {
    if (!gamesByDate[game.date]) {
      gamesByDate[game.date] = [];
    }
    gamesByDate[game.date].push(game);
  });
  
  console.log('\n📅 Games by date:');
  Object.entries(gamesByDate).forEach(([date, games]) => {
    console.log(`   ${date}: ${games.length} game(s)`);
  });
  
  // Test Strategy 2: League next/past events
  console.log('\n🔄 Testing League-wide endpoints...');
  
  try {
    const pastUrl = `${BASE_URL_V1}/${API_KEY}/eventspastleague.php?id=${NFL_LEAGUE_ID}`;
    const nextUrl = `${BASE_URL_V1}/${API_KEY}/eventsnextleague.php?id=${NFL_LEAGUE_ID}`;
    
    const [pastResponse, nextResponse] = await Promise.all([
      axios.get(pastUrl, { timeout: 10000 }),
      axios.get(nextUrl, { timeout: 10000 })
    ]);
    
    const pastGames = pastResponse.data.events || [];
    const nextGames = nextResponse.data.events || [];
    
    console.log(`   Past events: ${pastGames.length}`);
    console.log(`   Next events: ${nextGames.length}`);
    console.log(`   Total with 2 API calls: ${pastGames.length + nextGames.length}`);
    
    // Test Strategy 3: Current season
    const seasonUrl = `${BASE_URL_V1}/${API_KEY}/eventsseason.php?id=${NFL_LEAGUE_ID}&s=2025`;
    const seasonResponse = await axios.get(seasonUrl, { timeout: 10000 });
    const seasonGames = seasonResponse.data.events || [];
    
    console.log(`   Full 2025 season: ${seasonGames.length} games with 1 API call`);
    
    // Find games within 14-day window from season data
    const fourteenDaysFromNow = new Date();
    fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14);
    
    const seasonGamesInWindow = seasonGames.filter(game => {
      const gameDate = new Date(game.dateEvent);
      return gameDate >= today && gameDate <= fourteenDaysFromNow;
    });
    
    console.log(`   Season games in 14-day window: ${seasonGamesInWindow.length}`);
    
  } catch (error) {
    console.log(`   ❌ Error testing league endpoints: ${error.message}`);
  }
  
  console.log('\n💡 === STRATEGY RECOMMENDATIONS ===');
  console.log('1. **BEST APPROACH**: Use season endpoint + client-side filtering');
  console.log('   - 1 API call gets entire season');
  console.log('   - Filter dates client-side for any time window');
  console.log('   - Most efficient for any date range queries');
  
  console.log('\n2. **ALTERNATIVE**: Use eventsnextleague + eventspastleague');
  console.log('   - 2 API calls get recent past + upcoming games');
  console.log('   - Good for "around now" time windows');
  console.log('   - May miss games outside the default range');
  
  console.log('\n3. **CURRENT APPROACH**: Team-by-team queries');
  console.log(`   - 64 API calls (32 teams × 2 endpoints)`);
  console.log('   - Least efficient, highest rate limit risk');
  console.log('   - Should be replaced by above approaches');
  
  console.log('\n🎯 === IMPLEMENTATION PLAN ===');
  console.log('1. Add eventsseason.php endpoint to config');
  console.log('2. Create getNFLSeasonSchedule() method');
  console.log('3. Filter games by date range client-side');
  console.log('4. Replace current team iteration with single season call');
  console.log('5. Reduce API calls from 64 → 1 (98.4% reduction!)');
}

testAlternativeStrategies().catch(console.error);