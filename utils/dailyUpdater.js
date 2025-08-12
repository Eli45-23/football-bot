const cron = require('node-cron');
const moment = require('moment-timezone');
const crypto = require('crypto');
const sportsdb = require('../api/sportsdb');
const { fetchFallbackNews } = require('../services/rssFallback');
const { getCache, setCache } = require('../lib/cache');
const config = require('../config/config');
const rssService = require('../services/rss');
const articleCache = require('../utils/articleCache');
const dedupHashService = require('../utils/dedupHash');
const aggregateNews = require('../utils/aggregateNews');
const gptSummarizer = require('../src/services/gptSummarizer.ts');
const apiQueue = require('../lib/apiQueue');
const scheduleState = require('../src/state/scheduleState');
const offlineQueue = require('../src/posting/offlineQueue');

/**
 * NFL Scheduled Updates Service
 * Handles 3 daily scheduled updates (8 AM, 2 PM, 8 PM EST) 
 * Uses batched processing to avoid rate limits
 * Integrates RSS feeds with schedule data
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
   * Legacy start method - now handled by resilient scheduler
   * Kept for backward compatibility but shows deprecation notice
   */
  start() {
    console.log('⚠️ DEPRECATED: Traditional cron scheduling has been replaced by resilient scheduler');
    console.log('🔄 Scheduling is now handled by the resilient scheduler in index.js');
    console.log(`📡 Monitoring ${config.nflTeams.length} NFL teams`);
    console.log(`📦 Batch size: ${this.batchSize} teams per batch (reduced for rate limits)`);
    console.log(`⏱️  Batch delay: ${this.batchDelayMs/1000}s between batches`);
    console.log(`🐌 Team delay: ${this.teamDelayMs}ms between teams`);
    console.log(`🎯 Estimated processing time: ~${Math.ceil((config.nflTeams.length / this.batchSize) * (this.batchDelayMs/1000/60))} minutes`);
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
      // Idempotency checks before execution
      const canProceed = await this.checkIdempotency(updateType);
      if (!canProceed) {
        console.log(`🔒 Skipping ${updateType} update - idempotency check failed`);
        return;
      }

      console.log(`🚀 Starting ${updateType} NFL update for ${timeStr}...`);
      console.log(`📊 Processing ${config.nflTeams.length} teams in batches of ${this.batchSize}...`);
      
      // Collect NFL data using batched processing + RSS
      const nflData = await this.collectNFLDataBatched();
      
      // Generate content hash for duplicate detection
      const contentHash = this.generateContentHash(nflData, updateType, timeStr);
      
      // Post categorized updates to Discord (5 separate messages)
      await this.postStaggeredUpdatesToDiscord(nflData, timeStr, updateType);
      
      // Process any deferred API requests with extended delays
      await this.processAPIDeferialsInBackground(updateType);
      
      // Record successful run in persistent state
      await scheduleState.setRun(updateType, Date.now());
      await scheduleState.setLastHash(updateType, contentHash);
      this.lastRuns[updateType] = new Date();
      
      // Log detailed GPT metrics as requested
      const gptMetrics = gptSummarizer.getDetailedMetrics();
      console.log(`📊 ${gptMetrics}`);
      
      console.log(`🎉 ${updateType} update completed successfully!`);

    } catch (error) {
      console.error(`❌ Error during ${updateType} update:`, error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Collect NFL data using batched processing + RSS integration
   * @returns {Object} Categorized NFL data
   */
  async collectNFLDataBatched() {
    console.log('📡 Starting batched data collection...');
    
    // Check for cached full dataset first (24-hour cache)
    const fullCacheKey = 'nfl:daily:full-dataset';
    const cachedFullData = await getCache(fullCacheKey);
    if (cachedFullData) {
      console.log('💾 Using cached full NFL dataset (24-hour cache)');
      // Still fetch RSS for fresh news even with cached schedule data
      const rssData = await this.collectRSSData();
      return this.mergeScheduleAndRSS(cachedFullData, rssData);
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

    // Collect schedule and RSS data in parallel
    // NEW: Using league-wide schedule API instead of team-by-team
    const [scheduleData, rssData] = await Promise.all([
      this.collectLeagueScheduleWithWindowing(),
      this.collectRSSData()
    ]);

    // Merge the data
    const mergedData = this.mergeScheduleAndRSS(scheduleData, rssData);

    // Cache the full dataset for 24 hours
    await setCache(fullCacheKey, mergedData, 1440); // 24 hours = 1440 minutes
    console.log('💾 Cached full NFL dataset for 24 hours');

    return mergedData;
  }

  /**
   * Collect RSS news data with full-text fact extraction
   * @returns {Object} Categorized RSS data with extracted facts
   */
  async collectRSSData() {
    try {
      console.log('📰 Collecting RSS news with fact extraction...');
      
      // Use the new aggregated news service for fact-based extraction
      const categorizedNews = await aggregateNews.getCategorizedNews(null, 24, 5);
      
      console.log(`✅ Fact extraction complete:`);
      console.log(`   🏥 Injuries: ${categorizedNews.injuries.totalCount} found`);
      console.log(`   🔁 Roster: ${categorizedNews.roster.totalCount} found`);
      console.log(`   📰 Breaking: ${categorizedNews.breaking.totalCount} found`);
      
      // Log GPT status if enabled
      if (process.env.GPT_ENABLED === 'true') {
        const gptStatus = gptSummarizer.getStatus();
        console.log(`   🤖 GPT: ${gptStatus.callsUsed}/${gptStatus.callsLimit} calls used`);
      }
      
      return categorizedNews;
      
    } catch (error) {
      console.error('❌ Error collecting RSS data:', error);
      return {
        injuries: { bullets: [], overflow: 0, totalCount: 0, source: 'RSS' },
        roster: { bullets: [], overflow: 0, totalCount: 0, source: 'RSS' },
        breaking: { bullets: [], overflow: 0, totalCount: 0, source: 'RSS' }
      };
    }
  }

  /**
   * Collect league-wide schedule with intelligent 14-day windowing
   * NEW METHOD: Replaces team-by-team approach with single league API call
   * @returns {Object} Schedule data with windowing metadata
   */
  async collectLeagueScheduleWithWindowing() {
    console.log('📅 Collecting NFL league schedule with intelligent windowing...');
    
    const now = moment().tz(config.timezone);
    
    // Phase 1: Try 7-day window first (±7 days from today)
    let startDate = now.clone().subtract(7, 'days').startOf('day').toDate();
    let endDate = now.clone().add(7, 'days').endOf('day').toDate();
    
    console.log(`📋 Phase 1: Trying 7-day window (${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]})`);
    
    let scheduleResult = await sportsdb.getLeagueSchedule(startDate, endDate);
    let windowUsed = '7 days';
    let windowExpanded = false;
    
    // Phase 2: Expand to 14 days if fewer than 10 games found
    if (scheduleResult.totalGames < config.schedule.minGamesThreshold) {
      console.log(`📋 Phase 2: Only ${scheduleResult.totalGames} games found, expanding to 14-day window...`);
      
      startDate = now.clone().subtract(14, 'days').startOf('day').toDate();
      endDate = now.clone().add(14, 'days').endOf('day').toDate();
      
      scheduleResult = await sportsdb.getLeagueSchedule(startDate, endDate);
      windowUsed = '14 days';
      windowExpanded = true;
    }
    
    // Sort games by date
    const sortedGames = scheduleResult.games.sort((a, b) => {
      try {
        const dateA = this.parseGameDateFromString(a);
        const dateB = this.parseGameDateFromString(b);
        return dateA - dateB;
      } catch {
        return 0;
      }
    });
    
    console.log(`✅ League schedule collected:`);
    console.log(`   🗓️ Window: ${windowUsed} (${windowExpanded ? 'expanded' : 'initial'})`); 
    console.log(`   🏈 Games found: ${scheduleResult.totalGames}`);
    console.log(`   📡 API calls: ${scheduleResult.apiCalls}`);
    console.log(`   📊 Source: ${scheduleResult.source}`);
    
    return {
      scheduledGames: sortedGames,
      totalProcessed: 1, // League API call instead of 32 team calls
      successfulRequests: 1,
      unavailableTeams: [],
      dataSource: scheduleResult.source,
      fallbackUsed: scheduleResult.fallbackUsed || false,
      apiCallsUsed: scheduleResult.apiCalls,
      windowUsed,
      windowExpanded,
      dateRange: scheduleResult.dateRange
    };
  }
  
  /**
   * Parse game date from formatted game string
   * @param {string} gameStr - Formatted game string "Team @ Team – Date"
   * @returns {Date} Parsed date
   */
  parseGameDateFromString(gameStr) {
    try {
      const dateMatch = gameStr.match(/–\s*(.+)$/);
      if (dateMatch) {
        return new Date(dateMatch[1]);
      }
    } catch (error) {
      // Ignore parsing errors
    }
    return new Date(); // Default to now if parsing fails
  }

  /**
   * Collect schedule data using existing batched processing (LEGACY FALLBACK)
   * @param {Object} nflData - NFL data object to populate
   * @returns {Object} Schedule data
   */
  async collectScheduleDataBatched(nflData) {
    console.log('📅 Collecting schedule data from TheSportsDB...');
    
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

    console.log(`\n✅ Schedule data collection complete:`);
    console.log(`   📊 Total teams: ${nflData.totalProcessed}`);
    console.log(`   ✅ Successful: ${nflData.successfulRequests}`);
    console.log(`   ⚠️ Unavailable: ${nflData.unavailableTeams.length}`);
    if (nflData.unavailableTeams.length > 0) {
      console.log(`   📝 Unavailable teams: ${nflData.unavailableTeams.join(', ')}`);
    }

    return nflData;
  }

  /**
   * Merge schedule data from TheSportsDB with RSS news data
   * @param {Object} scheduleData - Data from TheSportsDB
   * @param {Object} rssData - Categorized RSS data
   * @returns {Object} Merged data
   */
  mergeScheduleAndRSS(scheduleData, rssData) {
    console.log('🔄 Merging league schedule and RSS data...');
    
    const merged = {
      // Copy league schedule metadata
      totalProcessed: scheduleData.totalProcessed,
      successfulRequests: scheduleData.successfulRequests,
      unavailableTeams: scheduleData.unavailableTeams,
      fallbackUsed: scheduleData.fallbackUsed,
      apiCallsUsed: scheduleData.apiCallsUsed,
      windowUsed: scheduleData.windowUsed,
      windowExpanded: scheduleData.windowExpanded,
      
      // Format RSS data for display (no legacy schedule items since we use league API)
      injuries: this.formatCategory(rssData.injuries, []),
      rosterChanges: this.formatCategory(rssData.roster, []),
      breakingNews: this.formatCategory(rssData.breaking, []),
      
      // Format league schedule games
      scheduledGames: this.formatScheduleCategory(scheduleData.scheduledGames || []),
      
      // Update data source info with league schedule details
      dataSource: scheduleData.dataSource,
      rssSource: 'RSS-FullText',
      sourcesLine: this.buildSourcesLine(scheduleData)
    };
    
    console.log(`✅ Merged data: ${merged.injuries.totalCount} injuries, ${merged.rosterChanges.totalCount} roster, ${merged.scheduledGames.totalCount} games, ${merged.breakingNews.totalCount} news`);
    console.log(`   📊 Schedule: ${scheduleData.windowUsed} window, ${scheduleData.apiCallsUsed} API calls, ${scheduleData.dataSource}`);
    
    return merged;
  }
  
  /**
   * Build sources line with schedule and GPT information
   * @param {Object} scheduleData - Schedule data with metadata
   * @returns {string} Formatted sources line
   */
  buildSourcesLine(scheduleData) {
    let sourceLine = '🗂 Sources: ';
    
    // Add schedule source
    if (scheduleData.dataSource.includes('League')) {
      sourceLine += 'TheSportsDB League API';
    } else if (scheduleData.fallbackUsed) {
      sourceLine += 'TheSportsDB (Fallback)';
    } else {
      sourceLine += 'TheSportsDB';
    }
    
    // Add RSS sources
    sourceLine += ' • ESPN • NFL.com • Yahoo • CBS Sports • ProFootballTalk';
    
    // Add detailed GPT information as requested
    const gptStatus = gptSummarizer.getStatus();
    if (gptStatus.enabled) {
      sourceLine += ` • 🤖 GPT polish: ${gptStatus.callsUsed}/${gptStatus.callsLimit} calls (${gptStatus.model})`;
    } else {
      sourceLine += ' • Full-text rule-based analysis';
    }
    
    // Add schedule window info
    if (scheduleData.windowExpanded) {
      sourceLine += ` • Schedule: ${scheduleData.windowUsed} (expanded)`;
    } else {
      sourceLine += ` • Schedule: ${scheduleData.windowUsed}`;
    }
    
    return sourceLine;
  }

  /**
   * Format RSS category data with fact bullets
   * @param {Object} rssCategory - RSS category data with fact bullets
   * @param {Array} legacyItems - Legacy items from TheSportsDB
   * @returns {Object} Formatted category
   */
  formatCategory(rssCategory, legacyItems = []) {
    // RSS category now contains fact bullets, not raw items
    const rssBullets = rssCategory.bullets || [];
    
    // Combine fact bullets with any legacy items (prioritize RSS facts)
    const allItems = [...rssBullets, ...legacyItems];
    
    // NEW: No truncation - pagination will handle large datasets
    return {
      items: allItems, // Show ALL items, pagination will chunk them
      totalCount: allItems.length,
      truncatedCount: 0, // No truncation with pagination system
      source: rssBullets.length > 0 ? (legacyItems.length > 0 ? 'Mixed' : 'RSS') : 'TheSportsDB'
    };
  }

  /**
   * Format schedule category data - shows ALL games, no cap
   * @param {Array} scheduleItems - Schedule items
   * @returns {Object} Formatted schedule category
   */
  formatScheduleCategory(scheduleItems) {
    // Sort schedule items by date if possible
    const sortedItems = scheduleItems.sort((a, b) => {
      try {
        const dateA = new Date(a.match(/\w+ \d+, \d+:\d+ \w+/)?.[0] || '1970-01-01');
        const dateB = new Date(b.match(/\w+ \d+, \d+:\d+ \w+/)?.[0] || '1970-01-01');
        return dateA - dateB;
      } catch {
        return 0;
      }
    });
    
    // Return ALL items, no truncation
    return {
      items: sortedItems,
      totalCount: sortedItems.length,
      truncatedCount: 0, // No truncation for scheduled games
      source: 'TheSportsDB'
    };
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
   * Generic array chunking utility for pagination
   * @param {Array} array - Array to chunk
   * @param {number} chunkSize - Size of each chunk
   * @returns {Array} Array of chunks
   */
  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
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
   * Post a category with chunking/pagination support
   * @param {Object} channel - Discord channel
   * @param {string} categoryTitle - Category title (e.g., "🏥 Injuries")
   * @param {Object} categoryData - Category data with items array
   * @param {number} itemsPerMessage - Items per message for this category
   * @returns {Promise} Resolves when all messages posted
   */
  async postCategoryWithChunking(channel, categoryTitle, categoryData, itemsPerMessage) {
    const items = categoryData.items || [];
    const totalItems = items.length;
    
    if (totalItems === 0) {
      // Post empty category section
      const emptyEmbed = this.createNewSectionEmbed(categoryTitle, categoryData);
      await this.queuedSend(channel, { embeds: [emptyEmbed] }, `empty ${categoryTitle.toLowerCase()}`);
      console.log(`   ${categoryTitle.split(' ')[0]} Posted empty ${categoryTitle.toLowerCase()}`);
      return;
    }
    
    if (totalItems <= itemsPerMessage) {
      // Single message - no chunking needed
      const singleEmbed = this.createNewSectionEmbed(categoryTitle, categoryData);
      await this.queuedSend(channel, { embeds: [singleEmbed] }, `${categoryTitle.toLowerCase()} (single message)`);
      console.log(`   ${categoryTitle.split(' ')[0]} Posted ${categoryTitle.toLowerCase()} (${totalItems} items in 1 message)`);
    } else {
      // Multiple messages - chunk the data
      const chunks = this.chunkArray(items, itemsPerMessage);
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkData = {
          items: chunk,
          totalCount: chunk.length,
          truncatedCount: 0, // No truncation with pagination
          source: categoryData.source
        };
        
        // Add page number to title: "🏥 Injuries (1/3)"
        const pagedTitle = `${categoryTitle} (${i + 1}/${chunks.length})`;
        const chunkEmbed = this.createNewSectionEmbed(pagedTitle, chunkData);
        await this.queuedSend(channel, { embeds: [chunkEmbed] }, `${categoryTitle.toLowerCase()} chunk ${i + 1}/${chunks.length}`);
        
        // Small delay between chunks
        if (i < chunks.length - 1) {
          await this.sleep(1000);
        }
      }
      
      console.log(`   ${categoryTitle.split(' ')[0]} Posted ${categoryTitle.toLowerCase()} (${totalItems} items in ${chunks.length} messages)`);
    }
  }

  /**
   * Post staggered updates to Discord with pagination support
   * @param {Object} nflData - Categorized NFL data
   * @param {string} timeStr - Formatted time string
   * @param {string} updateType - Type of update for logging
   */
  async postStaggeredUpdatesToDiscord(nflData, timeStr, updateType) {
    try {
      // Check for duplicate payload first
      const dedupResult = dedupHashService.checkAndRecord(nflData);
      if (dedupResult.isDuplicate) {
        console.log(`🚫 Skipping duplicate post (hash: ${dedupResult.hash}, window: ${dedupResult.windowMs/1000}s)`);
        return;
      }
      
      console.log(`✅ Payload hash verified: ${dedupResult.hash} (posting allowed)`);
      
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

      // Header message with run type
      const headerEmbed = this.createHeaderEmbed(timeStr, updateType, nflData);
      await this.queuedSend(channel, { embeds: [headerEmbed] }, `${updateType} header message`);
      console.log(`   📢 Posted header message`);
      await this.sleep(this.messageDelayMs);

      // 1. Injuries Section - NEW: With chunking (8 items per message)
      await this.postCategoryWithChunking(channel, '🏥 Injuries', nflData.injuries, config.schedule.pagination.injuries);
      await this.sleep(this.messageDelayMs);

      // 2. Roster Changes Section - NEW: With chunking (6 items per message)
      await this.postCategoryWithChunking(channel, '🔁 Roster Changes', nflData.rosterChanges, config.schedule.pagination.roster);
      await this.sleep(this.messageDelayMs);

      // 3. Scheduled Games Section - NEW: Using generic chunking method
      await this.postCategoryWithChunking(channel, '📅 Scheduled Games', nflData.scheduledGames, config.schedule.pagination.games);
      await this.sleep(this.messageDelayMs);

      // 4. Breaking News Section - NEW: With chunking (5 items per message)
      await this.postCategoryWithChunking(channel, '📰 Breaking News', nflData.breakingNews, config.schedule.pagination.breaking);
      await this.sleep(this.messageDelayMs);

      // Footer with sources
      const footerEmbed = this.createSourcesFooterEmbed(nflData);
      await this.queuedSend(channel, { embeds: [footerEmbed] }, `${updateType} sources footer`);
      console.log(`   🗺 Posted sources footer`);

      console.log(`✅ Staggered ${updateType} update posted successfully!`);

    } catch (error) {
      console.error('❌ Error posting staggered updates to Discord:', error);
      this.logStaggeredUpdatesToConsole(nflData, timeStr, updateType);
    }
  }

  /**
   * Create header embed for the update
   * @param {string} timeStr - Formatted time string
   * @param {string} updateType - Type of update (morning/afternoon/evening)
   * @param {Object} nflData - NFL data for stats
   * @returns {Object} Discord embed
   */
  createHeaderEmbed(timeStr, updateType, nflData) {
    const { EmbedBuilder } = require('discord.js');
    
    const runLabel = updateType.charAt(0).toUpperCase() + updateType.slice(1);
    const title = `📢 NFL ${runLabel} Update – ${timeStr.split(' – ')[0]} – ${timeStr.split(' – ')[1]}`;
    
    // Build comprehensive description with GPT and schedule info
    let description = this.buildHeaderDescription(nflData, updateType);
    
    return new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(0x013369)
      .setTimestamp();
  }
  
  /**
   * Build comprehensive header description with GPT status and schedule info
   * @param {Object} nflData - NFL data with stats
   * @param {string} updateType - Update type for context
   * @returns {string} Formatted description
   */
  buildHeaderDescription(nflData, updateType) {
    const descriptionParts = [];
    
    // Processing stats
    if (nflData.totalProcessed) {
      let processingStat = `Processing ${nflData.totalProcessed} teams • ${nflData.successfulRequests} successful`;
      if (nflData.unavailableTeams && nflData.unavailableTeams.length > 0) {
        processingStat += ` • ${nflData.unavailableTeams.length} unavailable`;
      }
      descriptionParts.push(processingStat);
    }
    
    // GPT Status - Make GPT usage OBVIOUS as requested
    const gptStatus = gptSummarizer.getStatus();
    let gptLine = '';
    if (gptStatus.enabled) {
      gptLine = `🤖 AI polish: **ON** (${gptStatus.model}, calls used: ${gptStatus.callsUsed})`;
    } else {
      gptLine = '🤖 AI polish: **OFF**';
    }
    descriptionParts.push(gptLine);
    
    // Schedule Window Info
    if (nflData.windowUsed) {
      const windowText = nflData.windowExpanded 
        ? `📅 Schedule: ${nflData.windowUsed} (expanded)`
        : `📅 Schedule: ${nflData.windowUsed}`;
      descriptionParts.push(windowText);
    }
    
    // API Efficiency Stats (if available)
    if (nflData.apiCallsUsed && nflData.apiCallsUsed <= 5) {
      descriptionParts.push(`📡 API calls: ${nflData.apiCallsUsed} (League API)`);
    }
    
    return descriptionParts.length > 0 
      ? descriptionParts.join(' • ')
      : 'Gathering latest NFL updates...';
  }

  /**
   * Create section embed for a specific category with new format
   * @param {string} title - Section title
   * @param {Object} categoryData - Category data with items, counts, etc.
   * @returns {Object} Discord embed
   */
  createNewSectionEmbed(title, categoryData) {
    const { EmbedBuilder } = require('discord.js');
    
    let content = '';
    
    if (categoryData.items && categoryData.items.length > 0) {
      content = categoryData.items.map(item => `• ${item}`).join('\n');
      
      // REMOVED: Truncation logic - pagination system handles large datasets
      // No more "(+N more)" messages needed
    } else {
      // Default messages for empty sections
      const defaultMessages = {
        '🏥 Injuries': '• No updates',
        '🔁 Roster Changes': '• No updates',
        '📅 Scheduled Games': '• No upcoming games',
        '📰 Breaking News': '• No updates'
      };
      content = defaultMessages[title] || '• No updates';
    }

    return new EmbedBuilder()
      .setTitle(title)
      .setDescription(content.substring(0, 4096)) // Discord description limit
      .setColor(0x013369);
  }

  // REMOVED: postScheduledGamesWithChunking - replaced by generic postCategoryWithChunking method

  /**
   * Create sources footer embed
   * @param {Object} nflData - NFL data
   * @returns {Object} Discord embed
   */
  createSourcesFooterEmbed(nflData) {
    const { EmbedBuilder } = require('discord.js');
    
    const sourceText = nflData.sourcesLine || '🗺 Sources: TheSportsDB';
    
    let description = sourceText;
    if (nflData.unavailableTeams && nflData.unavailableTeams.length > 0) {
      description += `\n\n⚠️ Some team data unavailable due to rate limits: ${nflData.unavailableTeams.slice(0, 5).join(', ')}`;
      if (nflData.unavailableTeams.length > 5) {
        description += ` (+${nflData.unavailableTeams.length - 5} more)`;
      }
    }

    return new EmbedBuilder()
      .setDescription(description)
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
    if (nflData.totalProcessed) {
      console.log(`📊 ${nflData.totalProcessed} teams • ${nflData.successfulRequests} successful • ${nflData.unavailableTeams?.length || 0} unavailable`);
    }

    // Injuries
    console.log('\n🏥 INJURIES');
    console.log('-'.repeat(30));
    if (nflData.injuries?.items?.length > 0) {
      nflData.injuries.items.forEach(injury => console.log(`• ${injury}`));
      // REMOVED: Truncation count display - pagination handles all items
    } else {
      console.log('• No updates');
    }

    // Roster Changes
    console.log('\n🔁 ROSTER CHANGES');
    console.log('-'.repeat(30));
    if (nflData.rosterChanges?.items?.length > 0) {
      nflData.rosterChanges.items.forEach(change => console.log(`• ${change}`));
      // REMOVED: Truncation count display - pagination handles all items
    } else {
      console.log('• No updates');
    }

    // Scheduled Games - show all without truncation notice
    console.log('\n📅 SCHEDULED GAMES');
    console.log('-'.repeat(30));
    if (nflData.scheduledGames?.items?.length > 0) {
      nflData.scheduledGames.items.forEach(game => console.log(`• ${game}`));
      console.log(`Total games: ${nflData.scheduledGames.totalCount}`);
    } else {
      console.log('• No upcoming games');
    }

    // Breaking News
    console.log('\n📰 BREAKING NEWS');
    console.log('-'.repeat(30));
    if (nflData.breakingNews?.items?.length > 0) {
      nflData.breakingNews.items.forEach(news => console.log(`• ${news}`));
      // REMOVED: Truncation count display - pagination handles all items
    } else {
      console.log('• No updates');
    }

    // Unavailable teams
    if (nflData.unavailableTeams?.length > 0) {
      console.log('\n⚠️ UNAVAILABLE TEAMS (Rate Limited)');
      console.log('-'.repeat(30));
      console.log(nflData.unavailableTeams.join(', '));
    }

    const sourceText = nflData.sourcesLine || '🗺 Data Sources: TheSportsDB';
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
   * Process deferred API requests in background with extended delays
   * @param {string} updateType - Type of update for logging
   */
  async processAPIDeferialsInBackground(updateType) {
    try {
      console.log('🔄 Processing deferred API requests...');
      
      const deferredResults = await apiQueue.processDeferredItems();
      
      if (deferredResults.processed > 0) {
        console.log(`✅ Deferred processing complete: ${deferredResults.successful}/${deferredResults.processed} successful`);
        
        // If some items still failed, post a warning to Discord
        if (deferredResults.stillFailed > 0) {
          await this.postDeferredFailureWarning(deferredResults, updateType);
        }
        
        // Log final queue stats
        const queueStats = await apiQueue.getStats();
        console.log(`📊 API Queue Stats: ${queueStats.queue.successRate} success rate, ${queueStats.deferred.failedItems} final failures`);
      }
      
    } catch (error) {
      console.error('❌ Error processing deferred API requests:', error.message);
    }
  }
  
  /**
   * Post warning about items that still failed after deferred processing
   * @param {Object} deferredResults - Results from deferred processing
   * @param {string} updateType - Update type for context
   */
  async postDeferredFailureWarning(deferredResults, updateType) {
    try {
      if (!config.discord.nflUpdatesChannelId) {
        console.log('⚠️ NFL_UPDATES_CHANNEL_ID not set, skipping deferred failure warning');
        return;
      }
      
      const channel = await this.client.channels.fetch(config.discord.nflUpdatesChannelId);
      if (!channel) {
        console.log('⚠️ Could not find NFL updates channel for deferred failure warning');
        return;
      }
      
      const stillFailedItems = apiQueue.getStillFailedItems();
      const failedTeamNames = stillFailedItems.map(item => item.teamName).filter(name => name);
      
      if (failedTeamNames.length === 0) return;
      
      // Create warning embed
      const { EmbedBuilder } = require('discord.js');
      
      const warningEmbed = new EmbedBuilder()
        .setTitle('⚠️ Temporary Data Delays')
        .setDescription(`Some team data was temporarily unavailable during the ${updateType} update. Auto-retry is running in background.`)
        .addFields({
          name: 'Affected Teams',
          value: failedTeamNames.slice(0, 8).join(', ') + (failedTeamNames.length > 8 ? ` (+${failedTeamNames.length - 8} more)` : ''),
          inline: false
        })
        .setColor(0xFFA500) // Orange color for warnings
        .setTimestamp();
      
      await this.queuedSend(channel, { embeds: [warningEmbed] }, 'deferred failure warning');
      console.log(`⚠️ Posted deferred failure warning for ${failedTeamNames.length} teams`);
      
    } catch (error) {
      console.error('❌ Error posting deferred failure warning:', error.message);
    }
  }

  /**
   * Check idempotency before running update (prevent double-posting)
   * @param {string} updateType - morning|afternoon|evening|test
   * @returns {boolean} True if update can proceed
   */
  async checkIdempotency(updateType) {
    // Skip idempotency checks for test runs
    if (updateType === 'test') {
      console.log('🧪 Test run - skipping idempotency checks');
      return true;
    }

    // Check if slot was run recently (within 10 minutes)
    const withinMs = 10 * 60 * 1000; // 10 minutes
    const wasRecentlyRun = await scheduleState.wasRecentlyRun(updateType, withinMs);
    
    if (wasRecentlyRun) {
      console.log(`🔒 ${updateType} update was run within last ${withinMs/60000} minutes - skipping to prevent double-post`);
      return false;
    }

    console.log(`✅ ${updateType} update idempotency check passed`);
    return true;
  }

  /**
   * Generate content hash for duplicate detection
   * @param {Object} nflData - NFL data object
   * @param {string} updateType - Update type
   * @param {string} timeStr - Time string
   * @returns {string} SHA-256 hash of content
   */
  generateContentHash(nflData, updateType, timeStr) {
    const contentToHash = {
      updateType,
      date: timeStr.split(' - ')[0], // Date part only (ignore exact time)
      injuryCount: nflData.injuries?.totalCount || 0,
      rosterCount: nflData.roster?.totalCount || 0,
      breakingCount: nflData.breakingNews?.totalCount || 0,
      gameCount: nflData.scheduledGames?.length || 0,
      // Include a sample of the actual content for more precise detection
      injurySample: nflData.injuries?.items?.slice(0, 3)?.map(i => i.text?.substring(0, 50)) || [],
      rosterSample: nflData.roster?.items?.slice(0, 3)?.map(i => i.text?.substring(0, 50)) || []
    };

    const hash = crypto.createHash('sha256')
      .update(JSON.stringify(contentToHash))
      .digest('hex');

    console.log(`🔐 Generated content hash: ${hash.substring(0, 12)}... (${updateType})`);
    return hash;
  }

  /**
   * Create a queued posting function for channel.send()
   * @param {Channel} channel - Discord channel
   * @param {Object} content - Message content
   * @param {string} description - Description for logging
   * @returns {Promise} Promise for queued send
   */
  async queuedSend(channel, content, description = 'message') {
    return offlineQueue.queuedChannelSend(channel, content, this.client, description);
  }

  /**
   * Manual trigger for testing updates
   */
  async testUpdate() {
    console.log('🧪 Running test NFL update with RSS integration...');
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
      messageDelayMs: this.messageDelayMs,
      rssEnabled: true,
      dedupEnabled: true,
      gptEnabled: process.env.GPT_ENABLED === 'true',
      gptStatus: gptSummarizer.getStatus()
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