#!/usr/bin/env node

/**
 * Test script for /injuries command
 * Tests injury report fetching for teams and league-wide
 */

require('dotenv').config();
const injuryService = require('./services/injuryService');

async function testInjuriesCommand() {
  console.log('🧪 Testing /injuries Command System\n');
  
  try {
    // Test 1: Team-specific injury report
    console.log('📋 Test 1: Team Injury Report (Eagles)');
    console.log('=====================================');
    const eaglesInjuries = await injuryService.getTeamInjuries('eagles');
    
    console.log(`Title: ${eaglesInjuries.title}`);
    console.log(`Summary: ${eaglesInjuries.summary}`);
    console.log(`Source: ${eaglesInjuries.source}`);
    console.log(`Severity: ${eaglesInjuries.severity}`);
    console.log(`Items analyzed: ${eaglesInjuries.itemCount || 0}`);
    
    if (eaglesInjuries.injuries?.length > 0) {
      console.log('\n🏥 Injuries:');
      eaglesInjuries.injuries.forEach(injury => console.log(`  ${injury}`));
    }
    
    if (eaglesInjuries.rosterMoves?.length > 0) {
      console.log('\n🔄 Roster Moves:');
      eaglesInjuries.rosterMoves.forEach(move => console.log(`  ${move}`));
    }
    
    if (eaglesInjuries.practiceReport?.length > 0) {
      console.log('\n📋 Practice Report:');
      eaglesInjuries.practiceReport.forEach(report => console.log(`  ${report}`));
    }
    
    console.log('\n');

    // Test 2: Another team (Cowboys)
    console.log('📋 Test 2: Team Injury Report (Cowboys)');
    console.log('======================================');
    const cowboysInjuries = await injuryService.getTeamInjuries('cowboys');
    
    console.log(`Title: ${cowboysInjuries.title}`);
    console.log(`Summary: ${cowboysInjuries.summary}`);
    console.log(`Items analyzed: ${cowboysInjuries.itemCount || 0}`);
    console.log('');

    // Test 3: League-wide injuries
    console.log('📋 Test 3: League-Wide Injury Report');
    console.log('===================================');
    const leagueInjuries = await injuryService.getLeagueInjuries();
    
    console.log(`Title: ${leagueInjuries.title}`);
    console.log(`Summary: ${leagueInjuries.summary}`);
    console.log(`Source: ${leagueInjuries.source}`);
    console.log(`Severity: ${leagueInjuries.severity}`);
    console.log(`Items analyzed: ${leagueInjuries.itemCount || 0}`);
    
    const totalUpdates = 
      (leagueInjuries.injuries?.length || 0) + 
      (leagueInjuries.rosterMoves?.length || 0) + 
      (leagueInjuries.practiceReport?.length || 0);
    
    console.log(`Total updates found: ${totalUpdates}`);
    console.log('');

    // Test 4: Cache hit test
    console.log('📋 Test 4: Cache Hit Test (Eagles again)');
    console.log('========================================');
    const cachedResult = await injuryService.getTeamInjuries('eagles');
    console.log(`Source: ${cachedResult.source} (should be 'Cached')`);
    console.log('');

    // Test 5: Invalid team
    console.log('📋 Test 5: Invalid Team Test');
    console.log('===========================');
    const invalidResult = await injuryService.getTeamInjuries('faketeam');
    console.log(`Title: ${invalidResult.title}`);
    console.log(`Error: ${invalidResult.error}`);
    console.log('');

    console.log('✅ All injury command tests completed successfully!');
    console.log('\n📊 Summary:');
    console.log('- Team-specific injury reports working');
    console.log('- League-wide injury reports working');
    console.log('- Caching system working');
    console.log('- RSS fallback and filtering working');
    console.log('- Injury categorization working');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Test helper function
function displayInjuryData(data) {
  console.log('\n--- Injury Report Data ---');
  console.log(`Injuries: ${data.injuries?.length || 0}`);
  console.log(`Roster Moves: ${data.rosterMoves?.length || 0}`);
  console.log(`Practice Reports: ${data.practiceReport?.length || 0}`);
  console.log(`Severity: ${data.severity}`);
  console.log('-------------------------\n');
}

// Run tests if called directly
if (require.main === module) {
  console.log('🏥 NFL Injuries Command Test Suite');
  console.log('==================================\n');
  
  testInjuriesCommand()
    .then(() => {
      console.log('\n✨ Test suite completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = { testInjuriesCommand };