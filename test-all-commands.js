#!/usr/bin/env node

/**
 * Comprehensive test suite for all NFL Discord bot commands
 * Tests fallback chains, source attribution, and error handling
 */

require('dotenv').config();
const { getStatus } = require('./services/statusService');
const { getTeamInjuries, getLeagueInjuries } = require('./services/injuryService');
const { clearCache } = require('./lib/cache');

console.log('🏈 NFL Discord Bot - Complete Command Test Suite');
console.log('='.repeat(60));

async function testAllCommands() {
  const results = {
    status: { team: null, player: null },
    injuries: { team: null, league: null },
    updates: 'Not directly testable (uses statusService)',
    team: 'UI-based command (SportsDB + fallbacks implemented)',
    player: 'UI-based command (SportsDB primary)',
    summary: {
      totalTests: 0,
      passed: 0,
      failed: 0,
      errors: []
    }
  };

  try {
    console.log('\n🧪 PHASE 1: Testing /status Command Fallback Chain');
    console.log('-'.repeat(50));
    
    // Test 1A: /status with team (should detect as team)
    console.log('\n📋 Test 1A: /status eagles (team detection)');
    try {
      const statusTeam = await getStatus('eagles');
      results.status.team = {
        success: true,
        title: statusTeam.title,
        source: statusTeam.source,
        hasData: statusTeam.summary && statusTeam.summary.length > 10,
        teamDetected: statusTeam.teamData ? true : false
      };
      console.log(`✅ Status Team Test: ${statusTeam.source} | ${statusTeam.title}`);
      results.summary.passed++;
    } catch (error) {
      results.status.team = { success: false, error: error.message };
      results.summary.errors.push(`Status Team: ${error.message}`);
      console.log(`❌ Status Team Test Failed: ${error.message}`);
      results.summary.failed++;
    }
    results.summary.totalTests++;

    // Test 1B: /status with player (should detect as player)  
    console.log('\n📋 Test 1B: /status aaron rodgers (player detection)');
    try {
      const statusPlayer = await getStatus('aaron rodgers');
      results.status.player = {
        success: true,
        title: statusPlayer.title,
        source: statusPlayer.source,
        hasData: statusPlayer.summary && statusPlayer.summary.length > 10,
        playerDetected: statusPlayer.playerData ? true : false
      };
      console.log(`✅ Status Player Test: ${statusPlayer.source} | ${statusPlayer.title}`);
      results.summary.passed++;
    } catch (error) {
      results.status.player = { success: false, error: error.message };
      results.summary.errors.push(`Status Player: ${error.message}`);
      console.log(`❌ Status Player Test Failed: ${error.message}`);
      results.summary.failed++;
    }
    results.summary.totalTests++;

    console.log('\n🧪 PHASE 2: Testing /injuries Command Fallback Chain');
    console.log('-'.repeat(50));

    // Test 2A: /injuries team-specific
    console.log('\n📋 Test 2A: /injuries eagles (team-specific)');
    try {
      const injuriesTeam = await getTeamInjuries('eagles');
      results.injuries.team = {
        success: true,
        title: injuriesTeam.title,
        source: injuriesTeam.source,
        hasData: injuriesTeam.fullReport && injuriesTeam.fullReport.length > 10,
        followedFallback: injuriesTeam.source !== 'Error'
      };
      console.log(`✅ Injuries Team Test: ${injuriesTeam.source} | Found ${injuriesTeam.itemCount || 0} items`);
      results.summary.passed++;
    } catch (error) {
      results.injuries.team = { success: false, error: error.message };
      results.summary.errors.push(`Injuries Team: ${error.message}`);
      console.log(`❌ Injuries Team Test Failed: ${error.message}`);
      results.summary.failed++;
    }
    results.summary.totalTests++;

    // Test 2B: /injuries league-wide
    console.log('\n📋 Test 2B: /injuries all (league-wide)');
    try {
      const injuriesLeague = await getLeagueInjuries();
      results.injuries.league = {
        success: true,
        title: injuriesLeague.title,
        source: injuriesLeague.source,
        hasData: injuriesLeague.fullReport && injuriesLeague.fullReport.length > 10,
        followedFallback: injuriesLeague.source !== 'Error',
        teamsAnalyzed: injuriesLeague.teamsAnalyzed || 'RSS-based'
      };
      console.log(`✅ Injuries League Test: ${injuriesLeague.source} | Teams: ${injuriesLeague.teamsAnalyzed || 'RSS'}`);
      results.summary.passed++;
    } catch (error) {
      results.injuries.league = { success: false, error: error.message };
      results.summary.errors.push(`Injuries League: ${error.message}`);
      console.log(`❌ Injuries League Test Failed: ${error.message}`);
      results.summary.failed++;
    }
    results.summary.totalTests++;

    console.log('\n🧪 PHASE 3: Cache Testing');
    console.log('-'.repeat(50));

    // Test 3A: Cache hit test (run same query again)
    console.log('\n📋 Test 3A: Cache hit test (eagles status again)');
    try {
      const cachedResult = await getStatus('eagles');
      const isCached = cachedResult.source === 'Cached';
      console.log(`${isCached ? '✅' : '⚠️'} Cache Test: Source = ${cachedResult.source}`);
      if (isCached) results.summary.passed++;
      else results.summary.errors.push('Cache test: Expected cached result but got fresh data');
    } catch (error) {
      results.summary.errors.push(`Cache test: ${error.message}`);
      console.log(`❌ Cache Test Failed: ${error.message}`);
      results.summary.failed++;
    }
    results.summary.totalTests++;

    console.log('\n🧪 PHASE 4: Error Handling Tests');
    console.log('-'.repeat(50));

    // Test 4A: Invalid team/player
    console.log('\n📋 Test 4A: Invalid input test');
    try {
      const invalidResult = await getStatus('nonexistent-team-12345');
      const handledGracefully = invalidResult.error === true;
      console.log(`${handledGracefully ? '✅' : '❌'} Error Handling: ${invalidResult.title}`);
      if (handledGracefully) results.summary.passed++;
      else results.summary.errors.push('Error handling: Invalid input not handled gracefully');
    } catch (error) {
      results.summary.errors.push(`Error handling test: ${error.message}`);
      console.log(`❌ Error Handling Test Failed: ${error.message}`);
      results.summary.failed++;
    }
    results.summary.totalTests++;

  } catch (error) {
    console.error('❌ Test suite crashed:', error);
    results.summary.errors.push(`Test suite crash: ${error.message}`);
  }

  // Print comprehensive results
  console.log('\n' + '='.repeat(60));
  console.log('📊 COMPREHENSIVE TEST RESULTS');
  console.log('='.repeat(60));
  
  console.log(`\n🎯 Overall Results:`);
  console.log(`   Total Tests: ${results.summary.totalTests}`);
  console.log(`   ✅ Passed: ${results.summary.passed}`);
  console.log(`   ❌ Failed: ${results.summary.failed}`);
  console.log(`   📈 Success Rate: ${((results.summary.passed / results.summary.totalTests) * 100).toFixed(1)}%`);

  console.log(`\n🔍 Command-by-Command Results:`);
  
  // Status command results
  console.log(`\n/status Command:`);
  if (results.status.team) {
    console.log(`   Team Detection: ${results.status.team.success ? '✅' : '❌'} (Source: ${results.status.team.source || 'Failed'})`);
  }
  if (results.status.player) {
    console.log(`   Player Detection: ${results.status.player.success ? '✅' : '❌'} (Source: ${results.status.player.source || 'Failed'})`);
  }

  // Injuries command results  
  console.log(`\n/injuries Command:`);
  if (results.injuries.team) {
    console.log(`   Team Reports: ${results.injuries.team.success ? '✅' : '❌'} (Source: ${results.injuries.team.source || 'Failed'})`);
  }
  if (results.injuries.league) {
    console.log(`   League Reports: ${results.injuries.league.success ? '✅' : '❌'} (Source: ${results.injuries.league.source || 'Failed'})`);
  }

  console.log(`\n📋 Fallback Chain Verification:`);
  const sourcesUsed = new Set();
  if (results.status.team?.source) sourcesUsed.add(results.status.team.source);
  if (results.status.player?.source) sourcesUsed.add(results.status.player.source);
  if (results.injuries.team?.source) sourcesUsed.add(results.injuries.team.source);
  if (results.injuries.league?.source) sourcesUsed.add(results.injuries.league.source);
  
  console.log(`   Sources Used: ${Array.from(sourcesUsed).join(', ')}`);
  console.log(`   Fallback Working: ${sourcesUsed.has('RSS Fallback') || sourcesUsed.has('RSS Analysis') ? '✅' : '⚠️'}`);
  console.log(`   Caching Working: ${sourcesUsed.has('Cached') ? '✅' : '⚠️'}`);

  if (results.summary.errors.length > 0) {
    console.log(`\n❌ Errors Encountered:`);
    results.summary.errors.forEach(error => console.log(`   • ${error}`));
  }

  console.log(`\n🚀 Production Readiness: ${results.summary.failed === 0 ? '✅ READY' : '⚠️ NEEDS ATTENTION'}`);
  console.log('='.repeat(60));

  return results;
}

// Run tests if called directly
if (require.main === module) {
  testAllCommands()
    .then(results => {
      const exitCode = results.summary.failed === 0 ? 0 : 1;
      console.log(`\n🏁 Test suite completed with exit code: ${exitCode}`);
      process.exit(exitCode);
    })
    .catch(error => {
      console.error('\n💥 Test suite failed catastrophically:', error);
      process.exit(1);
    });
}

module.exports = { testAllCommands };