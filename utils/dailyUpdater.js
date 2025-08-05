const cron = require('node-cron');
const moment = require('moment-timezone');
const sportsdb = require('../api/sportsdb');
const { fetchFallbackNews } = require('../services/rssFallback');
const { getCache, setCache } = require('../lib/cache');
const config = require('../config/config');

/**
 * NFL Scheduled Updates Service
 * Handles 3 daily scheduled updates (8 AM, 2 PM, 8 PM EST) 
 * Uses batched processing to avoid rate limits
 * Posts categorized NFL updates to Discord in separate messages
 */
class DailyUpdater {
  constructor(client) {
    this.client = client;
    this.isRunning = false;
    this.lastRuns = {
      morning: null,
      afternoon: null,
      evening: null
    };
    this.batchSize = 3;
    this.batchDelayMs = 45000; // 45 seconds between batches
    this.teamDelayMs = 3000;   // 3 seconds between teams
    this.messageDelayMs = 2000; // 2 seconds between category messages
  }

  /**
   * Initialize all 3 daily update cron jobs
   */
  start() {
    console.log('🕐 Initializing NFL scheduled update system...');
    
    if (config.testMode) {
      console.log('🧪 TEST MODE: Running updates every minute');
      cron.schedule('* * * * *', async () => {
        await this.runScheduledUpdate('test');
      }, {
        scheduled: true,
        timezone: config.timezone
      });
    } else {
      // Morning update - 8:00 AM EST
      cron.schedule(config.cronSchedules.morning, async () => {
        await this.runScheduledUpdate('morning');
      }, {
        scheduled: true,
        timezone: config.timezone
      });

      // Afternoon update - 2:00 PM EST  
      cron.schedule(config.cronSchedules.afternoon, async () => {
        await this.runScheduledUpdate('afternoon');
      }, {
        scheduled: true,
        timezone: config.timezone
      });

      // Evening update - 8:00 PM EST
      cron.schedule(config.cronSchedules.evening, async () => {
        await this.runScheduledUpdate('evening');
      }, {
        scheduled: true,
        timezone: config.timezone
      });
    }

    console.log(`✅ Scheduled updates configured:`);
    console.log(`   🌅 Morning: ${config.cronSchedules.morning} (8:00 AM EST)`);
    console.log(`   🌞 Afternoon: ${config.cronSchedules.afternoon} (2:00 PM EST)`);
    console.log(`   🌙 Evening: ${config.cronSchedules.evening} (8:00 PM EST)`);
    console.log(`   🌍 Timezone: ${config.timezone}`);
    console.log(`   📡 Monitoring ${config.nflTeams.length} NFL teams`);
    console.log(`   📦 Batch size: ${this.batchSize} teams per batch (reduced for rate limits)`);
    console.log(`   ⏱️  Batch delay: ${this.batchDelayMs/1000}s between batches`);
    console.log(`   🐌 Team delay: ${this.teamDelayMs}ms between teams`);
    console.log(`   🎯 Estimated processing time: ~${Math.ceil((config.nflTeams.length / this.batchSize) * (this.batchDelayMs/1000/60))} minutes`);
  }

  /**
   * Execute a scheduled update with batched processing
   * @param {string} updateType - Type of update (morning/afternoon/evening/test)
   */
  async runScheduledUpdate(updateType = 'scheduled') {
    if (this.isRunning) {
      console.log(`⚠️ Update already in progress, skipping ${updateType} update...`);
      return;
    }

    this.isRunning = true;
    const now = moment().tz(config.timezone);
    const timeStr = now.format('MMMM D, YYYY - h:mm A z');
    
    try {
      console.log(`🚀 Starting ${updateType} NFL update for ${timeStr}...`);
      console.log(`📊 Processing ${config.nflTeams.length} teams in batches of ${this.batchSize}...`);
      
      // Collect NFL data using batched processing
      const nflData = await this.collectNFLDataBatched();
      
      // Post categorized updates to Discord (4 separate messages)
      await this.postStaggeredUpdatesToDiscord(nflData, timeStr, updateType);
      
      this.lastRuns[updateType] = new Date();
      console.log(`🎉 ${updateType} update completed successfully!`);

    } catch (error) {
      console.error(`❌ Error during ${updateType} update:`, error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Collect NFL data using batched processing to avoid rate limits
   * @returns {Object} Categorized NFL data
   */
  async collectNFLDataBatched() {
    console.log('📡 Starting batched data collection...');
    
    // Check for cached full dataset first (24-hour cache)
    const fullCacheKey = 'nfl:daily:full-dataset';
    const cachedFullData = await getCache(fullCacheKey);
    if (cachedFullData) {
      console.log('💾 Using cached full NFL dataset (24-hour cache)');
      return cachedFullData;
    }
    
    const nflData = {
      injuries: [],
      rosterChanges: [],
      scheduledGames: [],
      breakingNews: [],
      unavailableTeams: [],
      dataSource: 'TheSportsDB',
      fallbackUsed: false,
      totalProcessed: 0,
      successfulRequests: 0
    };

    // Split teams into batches
    const batches = this.createTeamBatches(config.nflTeams, this.batchSize);
    console.log(`📦 Created ${batches.length} batches of ${this.batchSize} teams each`);

    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchNum = batchIndex + 1;
      
      console.log(`\n🔄 Processing batch ${batchNum}/${batches.length}: [${batch.join(', ')}]`);
      
      // Process teams in this batch
      for (let teamIndex = 0; teamIndex < batch.length; teamIndex++) {
        const teamName = batch[teamIndex];
        const teamNum = nflData.totalProcessed + 1;
        
        try {
          console.log(`   📊 Processing ${teamName}... (${teamNum}/${config.nflTeams.length})`);
          
          const teamData = await this.collectTeamDataWithRetry(teamName);
          if (teamData) {
            this.categorizeTeamData(teamData, nflData);
            nflData.successfulRequests++;
            console.log(`   ✅ Success: ${teamName} (${teamData.source})`);
          } else {
            nflData.unavailableTeams.push(teamName);
            console.log(`   ⚠️ No data: ${teamName}`);
          }

          nflData.totalProcessed++;
          
          // Add delay between teams within the batch (except last team in batch)
          if (teamIndex < batch.length - 1) {
            console.log(`   ⏱️ Waiting ${this.teamDelayMs}ms before next team...`);
            await this.sleep(this.teamDelayMs);
          }

        } catch (error) {
          console.error(`   ❌ Error processing ${teamName}:`, error.message);
          nflData.unavailableTeams.push(teamName);
          nflData.totalProcessed++;
        }
      }

      // Add delay between batches (except after last batch)
      if (batchIndex < batches.length - 1) {
        console.log(`\n⏸️ Batch ${batchNum} complete. Waiting ${this.batchDelayMs/1000}s before next batch...`);
        await this.sleep(this.batchDelayMs);
      }
    }

    // Mark fallback usage if too many failures
    if (nflData.successfulRequests < config.nflTeams.length * 0.3) {
      nflData.fallbackUsed = true;
      nflData.dataSource = 'Cached/Fallback';
    }

    console.log(`\n✅ Batched collection complete:`);
    console.log(`   📊 Total teams: ${nflData.totalProcessed}`);
    console.log(`   ✅ Successful: ${nflData.successfulRequests}`);
    console.log(`   ⚠️ Unavailable: ${nflData.unavailableTeams.length}`);
    if (nflData.unavailableTeams.length > 0) {
      console.log(`   📝 Unavailable teams: ${nflData.unavailableTeams.join(', ')}`);
    }

    // Cache the full dataset for 24 hours to reduce API calls
    await setCache(fullCacheKey, nflData, 1440); // 24 hours = 1440 minutes
    console.log('💾 Cached full NFL dataset for 24 hours');

    return nflData;
  }

  /**
   * Split teams into batches of specified size
   * @param {Array} teams - Array of team names
   * @param {number} batchSize - Size of each batch
   * @returns {Array} Array of batches
   */
  createTeamBatches(teams, batchSize) {
    const batches = [];
    for (let i = 0; i < teams.length; i += batchSize) {
      batches.push(teams.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Collect data for a single team with enhanced retry logic
   * @param {string} teamName - Name of the team
   * @returns {Object|null} Team data or null if failed
   */
  async collectTeamDataWithRetry(teamName) {
    try {
      // Try TheSportsDB first
      const teamData = await sportsdb.getTeamUpdateData(teamName);
      if (teamData && (teamData.timelineData?.length > 0 || teamData.nextEvents?.length > 0)) {
        return { ...teamData, team: teamName, source: 'TheSportsDB' };
      }

      // Try RSS fallback
      const rssData = await fetchFallbackNews(teamName);
      if (rssData && rssData.length > 0) {
        return { 
          team: teamName, 
          rssItems: rssData.slice(0, 3),
          source: 'RSS'
        };
      }

      return null;

    } catch (error) {
      // Handle specific 429 errors
      if (error.response?.status === 429) {
        console.log(`   ⚠️ Rate limit hit for ${teamName} - trying cache fallback`);
      }
      
      // Try cache as last resort
      const cached = await getCache(`team:${teamName.toLowerCase()}`);
      if (cached) {
        return { ...cached, team: teamName, source: 'Cached' };
      }
      
      throw error;
    }
  }

  /**
   * Categorize team data into the 4 main sections
   * @param {Object} teamData - Raw team data
   * @param {Object} nflData - Target categorized data object
   */
  categorizeTeamData(teamData, nflData) {
    const { team } = teamData;

    // Process timeline data for injuries and roster changes
    if (teamData.timelineData) {
      teamData.timelineData.forEach(event => {
        const eventText = event.strEvent || event.strTimeline || '';
        const eventLower = eventText.toLowerCase();

        if (eventLower.includes('injur') || eventLower.includes('hurt') || eventLower.includes('ir')) {
          nflData.injuries.push(`${team}: ${eventText}`);
        } else if (eventLower.includes('sign') || eventLower.includes('trade') || eventLower.includes('waiv') || eventLower.includes('releas')) {
          nflData.rosterChanges.push(`${team}: ${eventText}`);
        } else {
          nflData.breakingNews.push(`${team}: ${eventText}`);
        }
      });
    }

    // Process upcoming games
    if (teamData.nextEvents) {
      teamData.nextEvents.forEach(game => {
        const gameTime = game.strTimestamp ? moment(game.strTimestamp).format('MMM D, h:mm A') : 'TBD';
        const homeTeam = game.strHomeTeam || 'TBD';
        const awayTeam = game.strAwayTeam || 'TBD';
        nflData.scheduledGames.push(`${awayTeam} @ ${homeTeam} - ${gameTime}`);
      });
    }

    // Process RSS items
    if (teamData.rssItems) {
      teamData.rssItems.forEach(item => {
        const title = item.title || '';
        const titleLower = title.toLowerCase();
        
        if (titleLower.includes('injur') || titleLower.includes('hurt')) {
          nflData.injuries.push(`${team}: ${title}`);
        } else if (titleLower.includes('sign') || titleLower.includes('trade') || titleLower.includes('waiv')) {
          nflData.rosterChanges.push(`${team}: ${title}`);
        } else {
          nflData.breakingNews.push(`${team}: ${title}`);
        }
      });
    }
  }

  /**
   * Post staggered updates to Discord (4 separate messages)
   * @param {Object} nflData - Categorized NFL data
   * @param {string} timeStr - Formatted time string
   * @param {string} updateType - Type of update for logging
   */
  async postStaggeredUpdatesToDiscord(nflData, timeStr, updateType) {
    try {
      if (!config.discord.nflUpdatesChannelId) {
        console.log('⚠️ NFL_UPDATES_CHANNEL_ID not set, logging to console:');
        this.logStaggeredUpdatesToConsole(nflData, timeStr, updateType);
        return;
      }

      const channel = await this.client.channels.fetch(config.discord.nflUpdatesChannelId);
      if (!channel) {
        console.error('❌ Could not find NFL updates channel');
        this.logStaggeredUpdatesToConsole(nflData, timeStr, updateType);
        return;
      }

      console.log(`📤 Starting staggered update posting to Discord (#${channel.name})...`);

      // Header message
      const headerEmbed = this.createHeaderEmbed(timeStr, nflData);
      await channel.send({ embeds: [headerEmbed] });
      console.log(`   📢 Posted header message`);
      await this.sleep(this.messageDelayMs);

      // 1. Injuries Section
      const injuryEmbed = this.createSectionEmbed('🏥 Injuries', nflData.injuries, nflData.unavailableTeams, 'injuries');
      await channel.send({ embeds: [injuryEmbed] });
      console.log(`   🏥 Posted injuries section`);
      await this.sleep(this.messageDelayMs);

      // 2. Roster Changes Section
      const rosterEmbed = this.createSectionEmbed('🔁 Roster Changes', nflData.rosterChanges, nflData.unavailableTeams, 'roster');
      await channel.send({ embeds: [rosterEmbed] });
      console.log(`   🔁 Posted roster changes section`);
      await this.sleep(this.messageDelayMs);

      // 3. Scheduled Games Section
      const gamesEmbed = this.createSectionEmbed('📅 Scheduled Games', nflData.scheduledGames, nflData.unavailableTeams, 'games');
      await channel.send({ embeds: [gamesEmbed] });
      console.log(`   📅 Posted scheduled games section`);
      await this.sleep(this.messageDelayMs);

      // 4. Breaking News Section
      const newsEmbed = this.createSectionEmbed('📰 Breaking News', nflData.breakingNews, nflData.unavailableTeams, 'news');
      await channel.send({ embeds: [newsEmbed] });
      console.log(`   📰 Posted breaking news section`);

      // Footer with data source
      const footerEmbed = this.createFooterEmbed(nflData);
      await channel.send({ embeds: [footerEmbed] });
      console.log(`   🗂 Posted data source footer`);

      console.log(`✅ Staggered ${updateType} update posted successfully!`);

    } catch (error) {
      console.error('❌ Error posting staggered updates to Discord:', error);
      this.logStaggeredUpdatesToConsole(nflData, timeStr, updateType);
    }
  }

  /**
   * Create header embed for the update
   * @param {string} timeStr - Formatted time string
   * @param {Object} nflData - NFL data for stats
   * @returns {Object} Discord embed
   */
  createHeaderEmbed(timeStr, nflData) {
    const { EmbedBuilder } = require('discord.js');
    
    return new EmbedBuilder()
      .setTitle(`📢 NFL Daily Update – ${timeStr}`)
      .setDescription(`Processing ${nflData.totalProcessed} teams • ${nflData.successfulRequests} successful • ${nflData.unavailableTeams.length} unavailable`)
      .setColor(0x013369)
      .setTimestamp();
  }

  /**
   * Create section embed for a specific category
   * @param {string} title - Section title
   * @param {Array} items - Items for this section
   * @param {Array} unavailableTeams - Teams that couldn't be processed
   * @param {string} type - Section type for unavailable message
   * @returns {Object} Discord embed
   */
  createSectionEmbed(title, items, unavailableTeams, type) {
    const { EmbedBuilder } = require('discord.js');
    
    let content = '';
    
    if (items.length > 0) {
      content = items.slice(0, 15).map(item => `• ${item}`).join('\n');
      if (items.length > 15) {
        content += `\n• ... and ${items.length - 15} more items`;
      }
    } else {
      // Default messages for empty sections
      const defaultMessages = {
        injuries: '• No reported injuries',
        roster: '• No roster changes reported', 
        games: '• No upcoming games scheduled',
        news: '• No breaking news at this time'
      };
      content = defaultMessages[type] || '• No updates available';
    }

    // Add unavailable teams message for each section
    if (unavailableTeams.length > 0) {
      content += `\n\n⚠️ Data unavailable (rate limits): ${unavailableTeams.slice(0, 5).join(', ')}`;
      if (unavailableTeams.length > 5) {
        content += ` and ${unavailableTeams.length - 5} more`;
      }
    }

    return new EmbedBuilder()
      .setTitle(title)
      .setDescription(content.substring(0, 4096)) // Discord description limit
      .setColor(0x013369);
  }

  /**
   * Create footer embed with data source info
   * @param {Object} nflData - NFL data
   * @returns {Object} Discord embed
   */
  createFooterEmbed(nflData) {
    const { EmbedBuilder } = require('discord.js');
    
    const sourceText = nflData.fallbackUsed 
      ? `⚠️ ${nflData.dataSource} - Some data temporarily unavailable due to rate limits`
      : `🗂 Data Source: ${nflData.dataSource}`;

    return new EmbedBuilder()
      .setDescription(sourceText)
      .setColor(0x666666)
      .setTimestamp();
  }

  /**
   * Log staggered updates to console as fallback
   * @param {Object} nflData - NFL data
   * @param {string} timeStr - Time string
   * @param {string} updateType - Update type
   */
  logStaggeredUpdatesToConsole(nflData, timeStr, updateType) {
    console.log('\n' + '='.repeat(60));
    console.log(`🏈 NFL ${updateType.toUpperCase()} UPDATE – ${timeStr}`);
    console.log('='.repeat(60));
    console.log(`📊 ${nflData.totalProcessed} teams • ${nflData.successfulRequests} successful • ${nflData.unavailableTeams.length} unavailable`);

    // Injuries
    console.log('\n🏥 INJURIES');
    console.log('-'.repeat(30));
    if (nflData.injuries.length > 0) {
      nflData.injuries.slice(0, 10).forEach(injury => console.log(`• ${injury}`));
    } else {
      console.log('• No reported injuries');
    }

    // Roster Changes
    console.log('\n🔁 ROSTER CHANGES');
    console.log('-'.repeat(30));
    if (nflData.rosterChanges.length > 0) {
      nflData.rosterChanges.slice(0, 10).forEach(change => console.log(`• ${change}`));
    } else {
      console.log('• No roster changes reported');
    }

    // Scheduled Games
    console.log('\n📅 SCHEDULED GAMES');
    console.log('-'.repeat(30));
    if (nflData.scheduledGames.length > 0) {
      nflData.scheduledGames.slice(0, 10).forEach(game => console.log(`• ${game}`));
    } else {
      console.log('• No upcoming games scheduled');
    }

    // Breaking News
    console.log('\n📰 BREAKING NEWS');
    console.log('-'.repeat(30));
    if (nflData.breakingNews.length > 0) {
      nflData.breakingNews.slice(0, 10).forEach(news => console.log(`• ${news}`));
    } else {
      console.log('• No breaking news at this time');
    }

    // Unavailable teams
    if (nflData.unavailableTeams.length > 0) {
      console.log('\n⚠️ UNAVAILABLE TEAMS (Rate Limited)');
      console.log('-'.repeat(30));
      console.log(nflData.unavailableTeams.join(', '));
    }

    const sourceText = nflData.fallbackUsed 
      ? `⚠️ ${nflData.dataSource} - Some data temporarily unavailable`
      : `🗂 Data Source: ${nflData.dataSource}`;
    console.log(`\n${sourceText}`);
    
    console.log('\n' + '='.repeat(60) + '\n');
  }

  /**
   * Sleep utility function
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after delay
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Manual trigger for testing updates
   */
  async testUpdate() {
    console.log('🧪 Running test NFL update with batched processing...');
    await this.runScheduledUpdate('test');
  }

  /**
   * Get status of the updater
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRuns: this.lastRuns,
      nextRuns: this.getNextRunTimes(),
      monitoredTeams: config.nflTeams.length,
      schedules: config.cronSchedules,
      testMode: config.testMode || false,
      batchSize: this.batchSize,
      batchDelayMs: this.batchDelayMs,
      teamDelayMs: this.teamDelayMs,
      messageDelayMs: this.messageDelayMs
    };
  }

  /**
   * Calculate next scheduled run times
   * @returns {Object} Next run times for each schedule
   */
  getNextRunTimes() {
    const now = moment().tz(config.timezone);
    const nextRuns = {};
    
    Object.keys(config.cronSchedules).forEach(scheduleType => {
      const next = moment().tz(config.timezone);
      
      switch(scheduleType) {
        case 'morning':
          next.hour(8).minute(0).second(0);
          if (now.hour() >= 8) next.add(1, 'day');
          break;
        case 'afternoon':  
          next.hour(14).minute(0).second(0);
          if (now.hour() >= 14) next.add(1, 'day');
          break;
        case 'evening':
          next.hour(20).minute(0).second(0);
          if (now.hour() >= 20) next.add(1, 'day');
          break;
      }
      
      nextRuns[scheduleType] = next.format('YYYY-MM-DD HH:mm:ss z');
    });
    
    return nextRuns;
  }
}

module.exports = DailyUpdater;