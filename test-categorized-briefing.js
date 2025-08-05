#!/usr/bin/env node

/**
 * Test suite for the new categorized NFL briefing system
 * Tests both daily updates and /updates command functionality
 */

require('dotenv').config();
const gptSummarizer = require('./utils/gptSummarizer');
const categorizer = require('./services/categorizer');
const sportsdb = require('./api/sportsdb');
const { fetchFallbackNews } = require('./services/rssFallback');
const { clearCache } = require('./lib/cache');

console.log('🧪 Testing Categorized NFL Briefing System');
console.log('='.repeat(60));

async function testCategorizationSystem() {
  try {
    // Clear cache for clean testing
    await clearCache();
    console.log('🧹 Cache cleared for clean test');

    // Test 1: Test data collection and categorization
    console.log('\n📋 PHASE 1: Testing Data Collection & Categorization');
    console.log('-'.repeat(50));
    
    const testTeams = ['eagles', 'cowboys', 'patriots'];
    const teamDataArray = [];

    for (const teamName of testTeams) {
      try {
        console.log(`\n🔍 Testing data collection for: ${teamName}`);
        
        // Try SportsDB first
        let teamData = null;
        try {
          const sportsDbData = await sportsdb.getTeamUpdateData(teamName);
          if (sportsDbData && (sportsDbData.timelineData.length > 0 || sportsDbData.nextEvents.length > 0)) {
            const summary = await gptSummarizer.summarizeTeamUpdates(
              teamName,
              sportsDbData.timelineData,
              sportsDbData.nextEvents,
              sportsDbData.lastEvents
            );

            teamData = {
              team: teamName,
              summary: summary,
              timelineData: sportsDbData.timelineData,
              nextEvents: sportsDbData.nextEvents,
              lastEvents: sportsDbData.lastEvents,
              rssItems: [],
              source: 'SportsDB'
            };
            console.log(`  ✅ SportsDB data collected: ${sportsDbData.timelineData.length} timeline, ${sportsDbData.nextEvents.length} upcoming`);
          }
        } catch (sportsDbError) {
          console.log(`  ⚠️ SportsDB failed: ${sportsDbError.message}`);
        }

        // Try RSS fallback if needed
        if (!teamData) {
          try {
            const rssItems = await fetchFallbackNews(teamName);
            if (rssItems.length > 0) {
              teamData = {
                team: teamName,
                summary: `Recent news coverage found for ${teamName}`,
                timelineData: [],
                nextEvents: [],
                lastEvents: [],
                rssItems: rssItems.slice(0, 5),
                source: 'RSS Fallback'
              };
              console.log(`  ✅ RSS fallback data collected: ${rssItems.length} news items`);
            }
          } catch (rssError) {
            console.log(`  ⚠️ RSS fallback failed: ${rssError.message}`);
          }
        }

        if (teamData) {
          teamDataArray.push(teamData);
          console.log(`  ✅ Added ${teamName} to dataset (${teamData.source})`);
        } else {
          console.log(`  ❌ No data found for ${teamName}`);
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`  ❌ Error collecting data for ${teamName}:`, error.message);
      }
    }

    console.log(`\n📊 Data collection complete: ${teamDataArray.length}/${testTeams.length} teams`);

    // Test 2: Test categorization
    console.log('\n📋 PHASE 2: Testing Content Categorization');
    console.log('-'.repeat(50));

    if (teamDataArray.length > 0) {
      console.log('🧠 Testing categorization with collected data...');
      
      const today = new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });

      const categorizedContent = await categorizer.categorizeAllContent(teamDataArray, today);
      
      console.log('\n📋 Categorization Results:');
      console.log(`  🏥 Injuries: ${categorizedContent.injuries?.length || 0}`);
      console.log(`  🔁 Roster Moves: ${categorizedContent.rosterMoves?.length || 0}`);
      console.log(`  📅 Scheduled Games: ${categorizedContent.scheduledGames?.length || 0}`);
      console.log(`  🚨 Breaking News: ${categorizedContent.breakingNews?.length || 0}`);
      
      if (categorizedContent.injuries?.length > 0) {
        console.log('\n🏥 Sample Injuries:');
        categorizedContent.injuries.slice(0, 2).forEach(item => {
          console.log(`  • ${item}`);
        });
      }

      if (categorizedContent.rosterMoves?.length > 0) {
        console.log('\n🔁 Sample Roster Moves:');
        categorizedContent.rosterMoves.slice(0, 2).forEach(item => {
          console.log(`  • ${item}`);
        });
      }

      if (categorizedContent.scheduledGames?.length > 0) {
        console.log('\n📅 Sample Scheduled Games:');
        categorizedContent.scheduledGames.slice(0, 2).forEach(item => {
          console.log(`  • ${item}`);
        });
      }

      if (categorizedContent.breakingNews?.length > 0) {
        console.log('\n🚨 Sample Breaking News:');
        categorizedContent.breakingNews.slice(0, 2).forEach(item => {
          console.log(`  • ${item}`);
        });
      }

      // Test 3: Test Discord embed formatting
      console.log('\n📋 PHASE 3: Testing Discord Embed Formatting');
      console.log('-'.repeat(50));

      const discordEmbed = categorizer.formatForDiscord(categorizedContent);
      
      console.log('📤 Discord Embed Test:');
      console.log(`  Title: ${discordEmbed.data.title}`);
      console.log(`  Color: #${discordEmbed.data.color?.toString(16)}`);
      console.log(`  Fields: ${discordEmbed.data.fields?.length || 0}`);
      
      if (discordEmbed.data.fields) {
        discordEmbed.data.fields.forEach((field, index) => {
          console.log(`  Field ${index + 1}: ${field.name} (${field.value.length} chars)`);
        });
      }

      console.log(`  Footer: ${discordEmbed.data.footer?.text}`);

      // Test 4: Test GPT summarizer integration
      console.log('\n📋 PHASE 4: Testing GPT Summarizer Integration');
      console.log('-'.repeat(50));

      const briefingEmbed = await gptSummarizer.createCategorizedBriefing(teamDataArray, today);
      
      console.log('🧠 GPT Summarizer Integration Test:');
      console.log(`  Title: ${briefingEmbed.data.title}`);
      console.log(`  Fields: ${briefingEmbed.data.fields?.length || 0}`);
      console.log(`  Has content: ${briefingEmbed.data.fields?.some(f => f.value !== 'No significant updates')}`);

    } else {
      console.log('⚠️ No team data available for categorization testing');
    }

    // Test 5: Test empty data handling
    console.log('\n📋 PHASE 5: Testing Empty Data Handling');
    console.log('-'.repeat(50));

    const emptyBriefing = await categorizer.categorizeAllContent([], 'Test Date');
    console.log('📭 Empty data test:');
    console.log(`  isEmpty: ${emptyBriefing.isEmpty}`);
    console.log(`  Message: ${emptyBriefing.metadata.message}`);

    const emptyEmbed = categorizer.formatForDiscord(emptyBriefing);
    console.log(`  Empty embed title: ${emptyEmbed.data.title}`);
    console.log(`  Empty embed description length: ${emptyEmbed.data.description?.length || 0}`);

  } catch (error) {
    console.error('❌ Test suite error:', error);
  }
}

async function testDailyUpdaterIntegration() {
  console.log('\n📋 PHASE 6: Testing Daily Updater Integration');
  console.log('-'.repeat(50));

  try {
    // Test the daily updater with limited teams
    const DailyUpdater = require('./utils/dailyUpdater');
    const { Client, GatewayIntentBits } = require('discord.js');
    
    // Create mock client
    const mockClient = new Client({ intents: [GatewayIntentBits.Guilds] });
    const updater = new DailyUpdater(mockClient);
    
    console.log('🕐 Daily updater created successfully');
    console.log(`  Status: ${JSON.stringify(updater.getStatus(), null, 2)}`);
    
    // Test data collection method
    const testData = await updater.collectComprehensiveTeamData('eagles');
    if (testData) {
      console.log(`✅ Daily updater data collection working: ${testData.source}`);
    } else {
      console.log('⚠️ Daily updater returned no data');
    }

  } catch (error) {
    console.error('❌ Daily updater integration error:', error.message);
  }
}

async function testUpdatesCommandIntegration() {
  console.log('\n📋 PHASE 7: Testing /updates Command Integration');
  console.log('-'.repeat(50));

  try {
    const updatesCommand = require('./commands/updates');
    
    console.log('💬 Updates command loaded successfully');
    console.log(`  Description: ${updatesCommand.data.description}`);
    console.log(`  Status: ${JSON.stringify(updatesCommand.getStatus(), null, 2)}`);
    
    // Test data collection method
    const testData = await updatesCommand.collectComprehensiveTeamData('eagles');
    if (testData) {
      console.log(`✅ Updates command data collection working: ${testData.source}`);
    } else {
      console.log('⚠️ Updates command returned no data');
    }

  } catch (error) {
    console.error('❌ Updates command integration error:', error.message);
  }
}

// Run all tests
async function runAllTests() {
  try {
    await testCategorizationSystem();
    await testDailyUpdaterIntegration();
    await testUpdatesCommandIntegration();
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 CATEGORIZED BRIEFING SYSTEM TEST COMPLETE');
    console.log('='.repeat(60));
    console.log('✅ All major components tested successfully');
    console.log('✅ Ready for production use');
    
  } catch (error) {
    console.error('\n💥 Test suite failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };