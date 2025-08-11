#!/usr/bin/env node

const axios = require('axios');

/**
 * Test TheSportsDB API endpoints for NFL league-wide schedules
 * Tests various endpoints to find the most efficient way to get NFL games
 */

const API_KEY = '123'; // Free test key
const NFL_LEAGUE_ID = '4391'; // NFL League ID
const BASE_URL_V1 = 'https://www.thesportsdb.com/api/v1/json';
const BASE_URL_V2 = 'https://www.thesportsdb.com/api/v2/json';

async function testEndpoint(url, description) {
  try {
    console.log(`\n🔍 Testing: ${description}`);
    console.log(`URL: ${url}`);
    
    const response = await axios.get(url, { timeout: 10000 });
    const data = response.data;
    
    if (data.events) {
      console.log(`✅ Success! Found ${data.events.length} events`);
      
      // Show first few events for context
      const sampleEvents = data.events.slice(0, 3);
      sampleEvents.forEach((event, i) => {
        console.log(`   Event ${i + 1}: ${event.strHomeTeam} vs ${event.strAwayTeam} - ${event.dateEvent}`);
      });
      
      return { success: true, count: data.events.length, endpoint: url };
    } else if (data.eventspastleague) {
      console.log(`✅ Success! Found ${data.eventspastleague.length} past events`);
      return { success: true, count: data.eventspastleague.length, endpoint: url };
    } else if (data.eventsnextleague) {
      console.log(`✅ Success! Found ${data.eventsnextleague.length} next events`);
      return { success: true, count: data.eventsnextleague.length, endpoint: url };
    } else {
      console.log(`⚠️ Unexpected response format:`, Object.keys(data));
      return { success: false, error: 'Unexpected format', endpoint: url };
    }
  } catch (error) {
    if (error.response) {
      console.log(`❌ HTTP ${error.response.status}: ${error.response.statusText}`);
      if (error.response.status === 429) {
        console.log(`   Rate limited - this endpoint may work with proper rate limiting`);
      }
      return { success: false, error: `HTTP ${error.response.status}`, endpoint: url };
    } else {
      console.log(`❌ Error: ${error.message}`);
      return { success: false, error: error.message, endpoint: url };
    }
  }
}

async function testNFLEndpoints() {
  console.log('🏈 Testing TheSportsDB NFL League Endpoints');
  console.log(`NFL League ID: ${NFL_LEAGUE_ID}`);
  
  const results = [];
  
  // Test V1 League Endpoints
  console.log('\n📋 === V1 API League Endpoints ===');
  
  results.push(await testEndpoint(
    `${BASE_URL_V1}/${API_KEY}/eventspastleague.php?id=${NFL_LEAGUE_ID}`,
    'V1 Past League Events'
  ));
  
  results.push(await testEndpoint(
    `${BASE_URL_V1}/${API_KEY}/eventsnextleague.php?id=${NFL_LEAGUE_ID}`,
    'V1 Next League Events'
  ));
  
  // Test V1 Season Endpoint (try current season)
  const currentYear = new Date().getFullYear();
  const currentSeason = `${currentYear}-${currentYear + 1}`;
  
  results.push(await testEndpoint(
    `${BASE_URL_V1}/${API_KEY}/eventsseason.php?id=${NFL_LEAGUE_ID}&s=${currentSeason}`,
    `V1 Season Schedule (${currentSeason})`
  ));
  
  // Test V1 Events by Date (try a recent Sunday)
  const today = new Date();
  const recentSunday = new Date(today);
  recentSunday.setDate(today.getDate() - today.getDay()); // Get last Sunday
  const dateStr = recentSunday.toISOString().split('T')[0];
  
  results.push(await testEndpoint(
    `${BASE_URL_V1}/${API_KEY}/eventsday.php?d=${dateStr}&s=American Football`,
    `V1 Events by Date (${dateStr}) - American Football`
  ));
  
  results.push(await testEndpoint(
    `${BASE_URL_V1}/${API_KEY}/eventsday.php?d=${dateStr}&l=${NFL_LEAGUE_ID}`,
    `V1 Events by Date (${dateStr}) - NFL League`
  ));
  
  // Test V2 League Endpoints (may require premium)
  console.log('\n📋 === V2 API League Endpoints (Premium) ===');
  
  results.push(await testEndpoint(
    `${BASE_URL_V2}/schedule/next/league/${NFL_LEAGUE_ID}`,
    'V2 Next League Schedule'
  ));
  
  results.push(await testEndpoint(
    `${BASE_URL_V2}/schedule/previous/league/${NFL_LEAGUE_ID}`,
    'V2 Previous League Schedule'
  ));
  
  results.push(await testEndpoint(
    `${BASE_URL_V2}/schedule/league/${NFL_LEAGUE_ID}/${currentSeason}`,
    `V2 Full Season Schedule (${currentSeason})`
  ));
  
  // Summary
  console.log('\n📊 === RESULTS SUMMARY ===');
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Successful endpoints: ${successful.length}`);
  successful.forEach(r => {
    console.log(`   ${r.endpoint} (${r.count || 'unknown count'} events)`);
  });
  
  console.log(`\n❌ Failed endpoints: ${failed.length}`);
  failed.forEach(r => {
    console.log(`   ${r.endpoint} - ${r.error}`);
  });
  
  // Recommendations
  console.log('\n💡 === RECOMMENDATIONS ===');
  if (successful.length > 0) {
    const bestEndpoint = successful.reduce((best, current) => {
      return (current.count || 0) > (best.count || 0) ? current : best;
    });
    console.log(`🎯 Best endpoint for NFL schedules: ${bestEndpoint.endpoint}`);
    console.log(`   Returns ${bestEndpoint.count} events`);
  }
  
  if (successful.some(r => r.endpoint.includes('eventsday'))) {
    console.log('\n📅 For 14-day window optimization:');
    console.log('   Use eventsday.php with date iteration');
    console.log('   Make 14 API calls (one per day) with NFL league filter');
    console.log('   This avoids the 32 team x 2 endpoints = 64 API calls currently used');
  }
  
  console.log('\n🔧 Integration suggestions:');
  console.log('1. Replace team-by-team approach with league-wide endpoints');
  console.log('2. Use successful endpoints above to reduce API calls from 64 to 1-14');
  console.log('3. Implement proper rate limiting (100 req/min max)');
  console.log('4. Consider premium API key for V2 endpoints if V1 is insufficient');
}

// Add a small delay between requests to avoid rate limiting
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the tests with delays
async function runWithDelays() {
  console.log('🚀 Starting NFL League Endpoint Tests...');
  await testNFLEndpoints();
  console.log('\n✨ Test completed!');
}

runWithDelays().catch(console.error);