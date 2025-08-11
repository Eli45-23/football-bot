#!/usr/bin/env node

const axios = require('axios');

/**
 * Detailed analysis of successful TheSportsDB endpoints
 */

const API_KEY = '123';
const NFL_LEAGUE_ID = '4391';
const BASE_URL_V1 = 'https://www.thesportsdb.com/api/v1/json';

async function analyzeEndpoint(url, description) {
  try {
    console.log(`\n🔍 Analyzing: ${description}`);
    console.log(`URL: ${url}`);
    
    const response = await axios.get(url, { timeout: 10000 });
    const data = response.data;
    
    console.log('📋 Response structure:');
    console.log('Keys:', Object.keys(data));
    
    // Find the events array
    let events = null;
    if (data.events) {
      events = data.events;
      console.log(`✅ Found ${events.length} events in 'events' key`);
    } else if (data.eventspastleague) {
      events = data.eventspastleague;
      console.log(`✅ Found ${events.length} events in 'eventspastleague' key`);
    } else if (data.eventsnextleague) {
      events = data.eventsnextleague;
      console.log(`✅ Found ${events.length} events in 'eventsnextleague' key`);
    }
    
    if (events && events.length > 0) {
      const sampleEvent = events[0];
      console.log('\n📊 Sample event structure:');
      console.log('Event keys:', Object.keys(sampleEvent));
      
      console.log('\n🏈 Sample NFL event data:');
      console.log(`   Event ID: ${sampleEvent.idEvent}`);
      console.log(`   Date: ${sampleEvent.dateEvent}`);
      console.log(`   Time: ${sampleEvent.strTime || sampleEvent.strEventTime || 'N/A'}`);
      console.log(`   Home: ${sampleEvent.strHomeTeam} (ID: ${sampleEvent.idHomeTeam})`);
      console.log(`   Away: ${sampleEvent.strAwayTeam} (ID: ${sampleEvent.idAwayTeam})`);
      console.log(`   League: ${sampleEvent.strLeague}`);
      console.log(`   Sport: ${sampleEvent.strSport}`);
      console.log(`   Season: ${sampleEvent.strSeason || 'N/A'}`);
      console.log(`   Week: ${sampleEvent.intRound || 'N/A'}`);
      console.log(`   Status: ${sampleEvent.strStatus || 'N/A'}`);
      
      // Check for NFL-specific data
      const nflEvents = events.filter(e => e.strLeague === 'NFL');
      console.log(`\n🎯 NFL events in this response: ${nflEvents.length}`);
      
      if (nflEvents.length > 0) {
        console.log('NFL events:');
        nflEvents.slice(0, 5).forEach((event, i) => {
          console.log(`   ${i + 1}. ${event.strAwayTeam} @ ${event.strHomeTeam} - ${event.dateEvent}`);
        });
      }
    }
    
    return { success: true, data: events };
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testDetailedEndpoints() {
  console.log('🏈 Detailed Analysis of NFL Endpoints');
  
  // Test the successful endpoints in detail
  await analyzeEndpoint(
    `${BASE_URL_V1}/${API_KEY}/eventspastleague.php?id=${NFL_LEAGUE_ID}`,
    'V1 Past League Events (NFL)'
  );
  
  await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
  
  await analyzeEndpoint(
    `${BASE_URL_V1}/${API_KEY}/eventsnextleague.php?id=${NFL_LEAGUE_ID}`,
    'V1 Next League Events (NFL)'
  );
  
  await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
  
  // Test events by date with American Football filter
  const today = new Date();
  const recentSunday = new Date(today);
  recentSunday.setDate(today.getDate() - today.getDay());
  const dateStr = recentSunday.toISOString().split('T')[0];
  
  await analyzeEndpoint(
    `${BASE_URL_V1}/${API_KEY}/eventsday.php?d=${dateStr}&s=American Football`,
    `V1 Events by Date (${dateStr}) - American Football`
  );
  
  await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
  
  // Try the season endpoint with different format
  await analyzeEndpoint(
    `${BASE_URL_V1}/${API_KEY}/eventsseason.php?id=${NFL_LEAGUE_ID}&s=2025-2026`,
    'V1 Season Schedule (2025-2026)'
  );
  
  await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
  
  // Try current season format
  await analyzeEndpoint(
    `${BASE_URL_V1}/${API_KEY}/eventsseason.php?id=${NFL_LEAGUE_ID}&s=2025`,
    'V1 Season Schedule (2025)'
  );
  
  console.log('\n💡 === KEY FINDINGS FOR OPTIMIZATION ===');
  console.log('1. eventspastleague.php and eventsnextleague.php work for NFL');
  console.log('2. eventsday.php with American Football filter includes NFL games');
  console.log('3. Can get 14-day window with 14 API calls instead of 64 team calls');
  console.log('4. Each endpoint provides full game details including team IDs');
  console.log('5. Need to filter by strLeague === "NFL" when using sport filter');
}

testDetailedEndpoints().catch(console.error);