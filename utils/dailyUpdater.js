require('dotenv').config();
const cron = require('node-cron');
const moment = require('moment-timezone');
const crypto = require('crypto');
const sportsdb = require('../api/sportsdb.js');
const { fetchFallbackNews } = require('../services/rssFallback');
const { getCache, setCache } = require('../lib/cache');
const config = require('../config/config');
const rssService = require('../services/rss');
const articleCache = require('../utils/articleCache');
const dedupHashService = require('../utils/dedupHash');
const aggregateNews = require('../utils/aggregateNews');
const gptSummarizer = require('../src/services/gptSummarizer.js');
const apiQueue = require('../lib/apiQueue');
const scheduleState = require('../src/state/scheduleState');
const contentState = require('../src/state/contentState');
const offlineQueue = require('../src/posting/offlineQueue');
const timeUtils = require('../src/utils/time.js');
const textUtils = require('../src/utils/text');
const runLogger = require('../src/utils/runLogger');

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
    this.runningSlots = new Set(); // Mutex protection per slot type
    this.lastRuns = {
      morning: null,
      afternoon: null,
      evening: null
    };
    this.pendingRuns = new Map(); // Debounce protection
    this.batchSize = 3;
    this.batchDelayMs = 45000; // 45 seconds between batches
    this.teamDelayMs = 3000;   // 3 seconds between teams
    this.messageDelayMs = 2000; // 2 seconds between category messages
    this.debounceMs = parseInt(process.env.UPDATE_DEBOUNCE_MS || '30000'); // 30s debounce
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
   * Execute a scheduled update with enhanced mutex and debounce protection
   * @param {string} updateType - Type of update (morning/afternoon/evening/test)
   */
  async runScheduledUpdate(updateType = 'scheduled') {
    // Enhanced mutex protection per slot type
    if (this.runningSlots.has(updateType)) {
      console.log(`⚠️ ${updateType} update already in progress, skipping...`);
      return;
    }
    
    // Global running check for backward compatibility
    if (this.isRunning) {
      console.log(`⚠️ Another update in progress, skipping ${updateType} update...`);
      return;
    }
    
    // Debounce protection - prevent rapid successive runs
    const lastPendingTime = this.pendingRuns.get(updateType);
    const now = Date.now();
    if (lastPendingTime && (now - lastPendingTime) < this.debounceMs) {
      const remainingMs = this.debounceMs - (now - lastPendingTime);
      console.log(`⏱️ ${updateType} update debounced, ${Math.round(remainingMs/1000)}s remaining`);
      return;
    }
    
    // Set mutex locks
    this.runningSlots.add(updateType);
    this.isRunning = true;
    this.pendingRuns.set(updateType, now);
    
    const momentNow = moment().tz(config.timezone);
    const timeStr = momentNow.format('MMMM D, YYYY - h:mm A z');
    
    // Start centralized logging for this run
    const runId = runLogger.startRun(updateType, timeStr);
    runLogger.log('info', `Starting ${updateType} NFL update`, { 
      updateType, 
      timeStr, 
      batchSize: this.batchSize,
      totalTeams: config.nflTeams.length 
    });
    
    try {
      // Idempotency checks before execution
      const canProceed = await this.checkIdempotency(updateType);
      if (!canProceed) {
        runLogger.log('warn', 'Idempotency check failed', { updateType });
        console.log(`🔒 Skipping ${updateType} update - idempotency check failed`);
        runLogger.endRun('skipped', { reason: 'idempotency_check_failed' });
        return;
      }

      console.log(`🚀 Starting ${updateType} NFL update for ${timeStr}...`);
      console.log(`📊 Processing ${config.nflTeams.length} teams in batches of ${this.batchSize}...`);
      
      // Collect NFL data using batched processing + RSS
      runLogger.log('info', 'Starting NFL data collection');
      const nflData = await this.collectNFLDataBatched();
      
      // Store for final metrics
      this.lastProcessedCount = nflData.totalProcessed || 0;
      this.lastSuccessfulCount = nflData.successfulRequests || 0;
      
      runLogger.log('info', 'NFL data collection completed', {
        totalProcessed: this.lastProcessedCount,
        successfulRequests: this.lastSuccessfulCount,
        injuryCount: nflData.injuries?.totalCount || 0,
        rosterCount: nflData.roster?.totalCount || 0,
        gamesCount: nflData.totalGames || 0,
        breakingCount: nflData.breaking?.totalCount || 0
      });
      
      // Compute payloadHash BEFORE posting for duplicate detection
      const payloadHash = dedupHashService.generateContentHash(nflData, updateType, timeStr);
      
      // Check for duplicate content but don't skip posting
      const isDuplicate = await dedupHashService.isDuplicateEnhanced(payloadHash, updateType);
      if (isDuplicate) {
        runLogger.log('info', 'Content unchanged since last update - posting anyway', { payloadHash, updateType });
        console.log(`📋 Content unchanged since last ${updateType} update (hash: ${payloadHash.substring(0, 8)}...) - posting scheduled update anyway`);
        // Continue with posting even if content is duplicate
      }
      
      console.log(`✅ Payload verification passed, proceeding with ${updateType} update (hash: ${payloadHash.substring(0, 8)}...)`);
      
      // Pass duplicate status to posting function
      nflData.isDuplicate = isDuplicate;
      
      // Post categorized updates to Discord (5 separate messages)
      await this.postStaggeredUpdatesToDiscord(nflData, timeStr, updateType, payloadHash);
      
      // Save reported content for next delta comparison
      await contentState.saveReportedContent(nflData, payloadHash);
      
      // Process any deferred API requests with extended delays
      await this.processAPIDeferialsInBackground(updateType);
      
      // Record successful run and payload hash in persistent state (skip for test runs)
      if (updateType !== 'test') {
        await scheduleState.setRun(updateType, Date.now());
        await scheduleState.setLastHash(updateType, payloadHash);
      }
      
      // Also record in in-memory dedup service for short-term detection
      dedupHashService.recordHash(payloadHash);
      this.lastRuns[updateType] = new Date();
      
      // Log detailed GPT metrics as requested
      const gptMetrics = gptSummarizer.getDetailedMetrics();
      const gptStatus = gptSummarizer.getStatus();
      console.log(`📊 ${gptMetrics}`);
      
      runLogger.log('success', 'Update completed successfully', {
        updateType,
        totalProcessed: nflData.totalProcessed,
        successfulRequests: nflData.successfulRequests,
        contentHash: 'N/A',
        gptCalls: gptStatus.callsUsed,
        gptTokens: gptStatus.tokenUsage?.totalInputTokens + gptStatus.tokenUsage?.totalOutputTokens || 0
      });
      
      console.log(`🎉 ${updateType} update completed successfully!`);

    } catch (error) {
      runLogger.log('error', 'Update failed with error', {
        updateType,
        error: error.message,
        stack: error.stack?.split('\n')[0]
      });
      
      console.error(`❌ Error during ${updateType} update:`, error);
      
      // Log error context for debugging
      console.error(`🔍 Error context:`, {
        updateType,
        timeStr,
        error: error.message,
        stack: error.stack?.split('\n')[0]
      });
    } finally {
      // Enhanced cleanup - release all mutex locks
      this.runningSlots.delete(updateType);
      this.isRunning = false;
      
      // Finalize run logging with metrics
      const finalStatus = runLogger.currentRunId ? 
        (runLogger.getRunData()?.status || 'completed') : 'completed';
      
      if (runLogger.currentRunId) {
        const gptStatus = gptSummarizer.getStatus();
        runLogger.endRun(finalStatus, {
          totalProcessed: this.lastProcessedCount || 0,
          successfulRequests: this.lastSuccessfulCount || 0,
          gptCalls: gptStatus.callsUsed || 0,
          gptTokens: gptStatus.tokenUsage?.totalInputTokens + gptStatus.tokenUsage?.totalOutputTokens || 0
        });
      }
      
      console.log(`🔓 Released mutex locks for ${updateType} update`);
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
    const cachedFullData = null; // TEMP: Force fresh data collection to test schedule fix
    // const cachedFullData = await getCache(fullCacheKey);
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

    // TEMPORARILY DISABLED: Cache the full dataset for 24 hours (for testing fixes)
    // await setCache(fullCacheKey, mergedData, 1440); // 24 hours = 1440 minutes
    console.log('🚫 CACHE DISABLED - Using fresh data for testing');

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
    console.log('📅 Collecting NFL league schedule with focused windowing...');
    
    const now = moment().tz(config.timezone);
    
    // Phase 1: Try configured window (default 7-day forward) for focused relevant games
    let startDate = now.clone().startOf('day').toDate();
    let endDate = now.clone().add(config.schedule.windowDays, 'days').endOf('day').toDate();
    
    console.log(`📋 Phase 1: Trying ${config.schedule.windowDays}-day forward window (${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]})`);
    
    let scheduleResult = await sportsdb.getLeagueSchedule(startDate, endDate);
    let windowUsed = `${config.schedule.windowDays} days`;
    let windowExpanded = false;
    
    // DEBUG: Log the raw API result
    console.log(`   🔍 CRITICAL DEBUG - Raw API result:`, {
      totalGames: scheduleResult.totalGames,
      gamesCount: scheduleResult.games ? scheduleResult.games.length : 'undefined',
      source: scheduleResult.source
    });
    
    // Phase 2: Expand to max window if fewer than threshold games found
    if (scheduleResult.totalGames < config.schedule.minGamesThreshold) {
      const maxDays = config.schedule.maxExpansionDays || 10;
      console.log(`📋 Phase 2: Only ${scheduleResult.totalGames} games found, expanding to ${maxDays}-day window...`);
      
      // Keep start date as today, expand end date to maximum configured window
      startDate = now.clone().startOf('day').toDate();
      endDate = now.clone().add(maxDays, 'days').endOf('day').toDate();
      
      scheduleResult = await sportsdb.getLeagueSchedule(startDate, endDate);
      windowUsed = `${maxDays} days`;
      windowExpanded = true;
      
      // DEBUG: Log the expanded API result
      console.log(`   🔍 CRITICAL DEBUG - Expanded API result:`, {
        totalGames: scheduleResult.totalGames,
        gamesCount: scheduleResult.games ? scheduleResult.games.length : 'undefined',
        source: scheduleResult.source
      });
    }
    
    // RSS Schedule Supplement: Add missing preseason games
    try {
      const nflScheduleRSS = require('../services/nflScheduleRSS');
      scheduleResult.games = await nflScheduleRSS.supplementSchedule(
        scheduleResult.games || [], 
        startDate, 
        endDate
      );
      scheduleResult.totalGames = scheduleResult.games.length;
      console.log(`📡 After RSS supplement: ${scheduleResult.totalGames} total games`);
    } catch (error) {
      console.log(`⚠️ RSS schedule supplement failed: ${error.message}`);
    }
    
    // Enhanced schedule processing with future-only filtering and date grouping
    // Default to true for better preseason game handling
    const groupByDate = process.env.GROUP_GAMES_BY_DATE !== 'false';
    
    console.log(`   🔍 DEBUG: GROUP_GAMES_BY_DATE=${process.env.GROUP_GAMES_BY_DATE}, groupByDate=${groupByDate}`);
    console.log(`   🔍 DEBUG: scheduleResult.games.length=${scheduleResult.games ? scheduleResult.games.length : 'undefined'}`);
    
    if (groupByDate && scheduleResult.games && scheduleResult.games.length > 0) {
      console.log('📅 Processing schedule with date grouping...');
      
      // Group games by date for enhanced presentation
      const groupedData = sportsdb.groupGamesByDate(scheduleResult.games);
      const formattedGames = sportsdb.formatGroupedGames(groupedData);
      
      console.log(`✅ Enhanced schedule: ${groupedData.totalGames} games grouped by ${groupedData.dateGroupOrder.length} dates`);
      
      return {
        scheduledGames: formattedGames,
        totalGames: groupedData.totalGames,
        source: scheduleResult.source,
        apiCalls: scheduleResult.apiCalls,
        windowUsed,
        windowExpanded,
        dateGrouping: true,
        dateGroups: groupedData.dateGroupOrder
      };
    }
    
    // Legacy format: Sort games by date for simple list
    console.log(`   🔍 DEBUG scheduleResult.games:`, scheduleResult.games ? scheduleResult.games.length : 'undefined');
    if (scheduleResult.games) {
      console.log(`   🔍 DEBUG first game:`, scheduleResult.games[0]);
    }
    
    const legacyGames = (scheduleResult.games || []).map(game => game.formatted || game);
    const sortedGames = legacyGames.sort((a, b) => {
      try {
        const dateA = this.parseGameDateFromString(a);
        const dateB = this.parseGameDateFromString(b);
        return dateA - dateB;
      } catch {
        return 0;
      }
    });
    
    console.log(`✅ League schedule collected (legacy format):`);
    console.log(`   🗓️ Window: ${windowUsed} (${windowExpanded ? 'expanded' : 'initial'})`); 
    console.log(`   🏈 Games found: ${scheduleResult.totalGames}`);
    console.log(`   📡 API calls: ${scheduleResult.apiCalls}`);
    console.log(`   📊 Source: ${scheduleResult.source}`);
    console.log(`   🔍 DEBUG legacyGames length: ${legacyGames.length}`);
    console.log(`   🔍 DEBUG sortedGames length: ${sortedGames.length}`);
    
    console.log(`   🔍 FINAL RETURN DEBUG:`, {
      sortedGames: sortedGames.length,
      scheduleResultTotalGames: scheduleResult.totalGames,
      scheduleResultGamesArray: scheduleResult.games ? scheduleResult.games.length : 'undefined'
    });

    return {
      scheduledGames: sortedGames,
      totalGames: scheduleResult.totalGames,
      totalProcessed: 1, // League API call instead of 32 team calls
      successfulRequests: 1,
      unavailableTeams: [],
      dataSource: scheduleResult.source,
      fallbackUsed: scheduleResult.fallbackUsed || false,
      apiCallsUsed: scheduleResult.apiCalls,
      windowUsed,
      windowExpanded,
      dateRange: scheduleResult.dateRange,
      dateGrouping: false
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
    
    // DEBUG: Log schedule data structure to diagnose 0 games issue
    console.log('   🔍 DEBUG scheduleData structure:', {
      scheduledGames: scheduleData.scheduledGames ? scheduleData.scheduledGames.length : 'undefined',
      totalGames: scheduleData.totalGames,
      dataSource: scheduleData.dataSource,
      // Note: scheduleData has 'scheduledGames' not 'games' - games are in the API response only
    });
    
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
    if (scheduleData.dataSource && scheduleData.dataSource.includes('League')) {
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
   * @param {Array} scheduleItems - Schedule items (strings or objects with .formatted)
   * @returns {Object} Formatted schedule category
   */
  formatScheduleCategory(scheduleItems) {
    if (!scheduleItems || scheduleItems.length === 0) {
      console.log('   ⚠️ formatScheduleCategory: No schedule items provided');
      return {
        items: [],
        totalCount: 0,
        truncatedCount: 0,
        source: 'TheSportsDB'
      };
    }
    
    console.log(`   📊 formatScheduleCategory: Processing ${scheduleItems.length} schedule items`);
    
    // Extract formatted strings from objects or use strings directly
    const gameStrings = scheduleItems.map(item => {
      if (typeof item === 'string') {
        return item;
      } else if (item && item.formatted) {
        return item.formatted;
      } else {
        console.log(`   ⚠️ Unexpected schedule item format:`, item);
        return JSON.stringify(item);
      }
    });
    
    // Sort schedule items by date if possible
    const sortedItems = gameStrings.sort((a, b) => {
      try {
        const dateA = new Date(a.match(/\w+ \d+, \d+:\d+ \w+/)?.[0] || '1970-01-01');
        const dateB = new Date(b.match(/\w+ \d+, \d+:\d+ \w+/)?.[0] || '1970-01-01');
        return dateA - dateB;
      } catch {
        return 0;
      }
    });
    
    console.log(`   ✅ formatScheduleCategory: Formatted ${sortedItems.length} games`);
    
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
      // Empty category - check policy
      const emptyMode = process.env.EMPTY_SECTION_MODE || 'message';
      
      if (emptyMode === 'skip') {
        console.log(`   ⏭️ ${categoryTitle.split(' ')[0]} Skipping empty ${categoryTitle.toLowerCase()} (policy: skip)`);
        return;
      } else {
        // Default 'message' mode - post empty message
        console.log(`   📝 ${categoryTitle.split(' ')[0]} Posting empty ${categoryTitle.toLowerCase()} (policy: ${emptyMode})`);
        const emptyEmbed = this.createEnhancedSectionEmbed(categoryTitle, categoryData, 1, 1);
        if (emptyEmbed) { // emptyEmbed could be null if skip policy is applied in createEnhancedSectionEmbed
          await this.queuedSend(channel, { embeds: [emptyEmbed] }, `empty ${categoryTitle.toLowerCase()}`);
        }
        return;
      }
    }
    
    if (totalItems <= itemsPerMessage) {
      // Single message - no chunking needed
      const singleEmbed = this.createEnhancedSectionEmbed(categoryTitle, categoryData, 1, 1);
      await this.queuedSend(channel, { embeds: [singleEmbed] }, `${categoryTitle.toLowerCase()} (single message)`);
      console.log(`   ${categoryTitle.split(' ')[0]} Posted ${categoryTitle.toLowerCase()} (${totalItems} items in 1 message)`);
    } else {
      // Multiple messages - chunk the data
      const chunks = this.chunkArray(items, itemsPerMessage);
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkData = {
          items: chunk,
          totalCount: categoryData.totalCount || totalItems, // Use total count from original data
          truncatedCount: 0, // No truncation with pagination
          source: categoryData.source
        };
        
        const chunkEmbed = this.createEnhancedSectionEmbed(categoryTitle, chunkData, i + 1, chunks.length);
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
  async postStaggeredUpdatesToDiscord(nflData, timeStr, updateType, payloadHash) {
    try {
      console.log(`📤 Posting ${updateType} update to Discord (hash: ${payloadHash.substring(0, 8)}...)`);
      
      if (!config.discord.nflUpdatesChannelId) {
        console.log('⚠️ NFL_UPDATES_CHANNEL_ID not set, logging to console:');
        this.logStaggeredUpdatesToConsole(nflData, timeStr, updateType);
        return;
      }

      let channel;
      try {
        channel = await this.client.channels.fetch(config.discord.nflUpdatesChannelId);
        if (!channel) {
          throw new Error(`Channel not found with ID: ${config.discord.nflUpdatesChannelId}`);
        }
      } catch (error) {
        console.error(`❌ Failed to fetch NFL updates channel: ${error.message}`);
        console.error(`   Channel ID attempted: ${config.discord.nflUpdatesChannelId}`);
        console.error(`   Bot ID: ${this.client.user?.id}`);
        if (config.discord.nflUpdatesChannelId === this.client.user?.id) {
          console.error('   ⚠️  ERROR: NFL_UPDATES_CHANNEL_ID is set to the bot\'s user ID!');
          console.error('   Please update NFL_UPDATES_CHANNEL_ID to a valid channel ID');
        }
        this.logStaggeredUpdatesToConsole(nflData, timeStr, updateType);
        return;
      }

      console.log(`📤 Starting staggered update posting to Discord (#${channel.name})...`);

      // Header message with run type
      try {
        const headerEmbed = this.createHeaderEmbed(timeStr, updateType, nflData);
        await this.queuedSend(channel, { embeds: [headerEmbed] }, `${updateType} header message`);
        console.log(`   📢 Posted header message`);
      } catch (error) {
        console.error(`❌ Failed to post header message: ${error.message}`);
        console.error(`   Error details:`, error);
      }
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
      console.error('💥 [CRITICAL] Error posting staggered updates to Discord:', error);
      console.error('   📍 This will prevent the run from being marked as successful');
      this.logStaggeredUpdatesToConsole(nflData, timeStr, updateType);
      
      // RE-THROW ERROR: This is critical! If Discord posting fails, 
      // the scheduler should NOT record the run as successful
      throw new Error(`Discord posting failed: ${error.message}`);
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
    
    // Format title as: "NFL {Morning|Afternoon|Evening} Update – {MMM d}, {h:mm A} EDT"
    const updateTypeLabel = updateType.charAt(0).toUpperCase() + updateType.slice(1);
    const now = timeUtils.now();
    const dateStr = now.toFormat('MMM d');
    const formattedTime = now.toFormat('h:mm a ZZZZ');
    const title = `📢 NFL ${updateTypeLabel} Update – ${dateStr}, ${formattedTime}`;
    
    // Build comprehensive description with league mode support
    let description = this.buildEnhancedHeaderDescription(nflData, updateType);
    
    return new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(0x013369)
      .setTimestamp();
  }
  
  /**
   * Build enhanced header description with league mode support
   * @param {Object} nflData - NFL data with stats
   * @param {string} updateType - Update type for context
   * @returns {string} Formatted description
   */
  buildEnhancedHeaderDescription(nflData, updateType) {
    const descriptionParts = [];
    
    // Add status indicator if content is unchanged
    if (nflData.isDuplicate) {
      descriptionParts.push('📋 **Status: No new updates since last post** (scheduled update)');
      descriptionParts.push('');  // Add spacing
    }
    
    // League mode header format instead of team processing stats
    if (nflData.apiCallsUsed && nflData.windowUsed) {
      const windowDays = this.extractWindowDays(nflData.windowUsed);
      const scheduleInfo = `📅 Schedule: League mode • Window: ${windowDays} days • API calls: ${nflData.apiCallsUsed}`;
      descriptionParts.push(scheduleInfo);
      descriptionParts.push('Monitored teams: 32');
    } else if (nflData.windowUsed) {
      const windowDays = this.extractWindowDays(nflData.windowUsed);
      const scheduleInfo = `📅 Schedule: League mode • Window: ${windowDays} days`;
      descriptionParts.push(scheduleInfo);
      descriptionParts.push('Monitored teams: 32');
    }
    
    // Enhanced content counters with proper formatting
    const counters = this.buildContentCounters(nflData);
    if (counters) {
      descriptionParts.push(counters);
    }
    
    // Enhanced GPT Status - Make GPT usage OBVIOUS as requested
    const gptStatus = gptSummarizer.getStatus();
    let gptLine = '';
    if (gptStatus.enabled) {
      const tokenInfo = gptStatus.tokenUsage ? 
        ` • ${gptStatus.tokenUsage.totalInputTokens}→${gptStatus.tokenUsage.totalOutputTokens} tokens` : '';
      gptLine = `🤖 AI polish: **ON** (${gptStatus.model}, ${gptStatus.callsUsed}/${gptStatus.callsLimit} calls${tokenInfo})`;
    } else {
      gptLine = '🤖 AI polish: **OFF** (rule-based categorization)';
    }
    descriptionParts.push(gptLine);
    
    // Enhanced schedule window info with lookback details
    const lookbackHours = timeUtils.getLookbackHours(updateType);
    if (nflData.windowUsed) {
      const windowText = nflData.windowExpanded 
        ? `📅 Schedule: ${nflData.windowUsed} (expanded) • ${lookbackHours}h lookback`
        : `📅 Schedule: ${nflData.windowUsed} • ${lookbackHours}h lookback`;
      descriptionParts.push(windowText);
    } else {
      descriptionParts.push(`📅 Lookback: ${lookbackHours}h`);
    }
    
    // Enhanced API efficiency stats
    if (nflData.apiCallsUsed) {
      const callText = textUtils.pluralize(nflData.apiCallsUsed, 'call');
      const efficiency = nflData.apiCallsUsed <= 5 ? ' (League API)' : ' (Team APIs)';
      descriptionParts.push(`📡 API ${callText}: ${nflData.apiCallsUsed}${efficiency}`);
    }
    
    return descriptionParts.length > 0 
      ? descriptionParts.join(' • ')
      : 'Gathering latest NFL updates...';
  }
  
  /**
   * Build content counters for header description
   * @param {Object} nflData - NFL data with content stats
   * @returns {string|null} Formatted counters or null
   */
  buildContentCounters(nflData) {
    const counters = [];
    
    if (nflData.injuries && nflData.injuries.totalCount > 0) {
      counters.push(`${nflData.injuries.totalCount} ${textUtils.pluralize(nflData.injuries.totalCount, 'injury', 'injuries')}`);
    }
    
    if (nflData.roster && nflData.roster.totalCount > 0) {
      counters.push(`${nflData.roster.totalCount} ${textUtils.pluralize(nflData.roster.totalCount, 'move')}`);
    }
    
    if (nflData.breaking && nflData.breaking.totalCount > 0) {
      counters.push(`${nflData.breaking.totalCount} breaking`);
    }
    
    if (nflData.games && nflData.games.totalGames > 0) {
      counters.push(`${nflData.games.totalGames} ${textUtils.pluralize(nflData.games.totalGames, 'game')}`);
    }
    
    return counters.length > 0 ? `📊 Content: ${counters.join(' • ')}` : null;
  }

  /**
   * Create section embed for a specific category with enhanced formatting
   * @param {string} title - Section title
   * @param {Object} categoryData - Category data with items, counts, etc.
   * @param {number} messageIndex - Current message index for pagination
   * @param {number} totalMessages - Total messages for this category
   * @returns {Object} Discord embed
   */
  createEnhancedSectionEmbed(title, categoryData, messageIndex = 1, totalMessages = 1) {
    const { EmbedBuilder } = require('discord.js');
    
    // Enhanced title with counters and pagination
    let enhancedTitle = title;
    
    // Add counters to title
    if (categoryData.totalCount > 0) {
      const counter = textUtils.generateCounter(
        categoryData.items ? categoryData.items.length : 0, 
        categoryData.totalCount,
        this.getCategoryItemType(title)
      );
      enhancedTitle += ` ${counter}`;
    }
    
    // Add pagination info if multiple messages
    if (totalMessages > 1) {
      enhancedTitle += ` [${messageIndex}/${totalMessages}]`;
    }
    
    let content = '';
    
    if (categoryData.items && categoryData.items.length > 0) {
      // Use enhanced bullet formatting
      content = categoryData.items.map(item => textUtils.createBullet(item)).join('\n');
    } else {
      // Empty-section policy implementation as per requirements
      const emptyMode = process.env.EMPTY_SECTION_MODE || 'message';
      
      if (emptyMode === 'skip') {
        return null; // Do not post the section - skip entirely
      }
      
      // Mode is 'message' - post one line with lookback hours
      const lookbackHours = this.getLookbackHoursForSection(title);
      content = textUtils.createBullet(`No updates in the last ${lookbackHours}h`);
    }

    return new EmbedBuilder()
      .setTitle(enhancedTitle)
      .setDescription(content.substring(0, 4096)) // Discord description limit
      .setColor(0x013369);
  }
  
  /**
   * Get the item type for counter generation
   * @param {string} title - Section title
   * @returns {string} Item type for pluralization
   */
  getCategoryItemType(title) {
    if (title.includes('Injuries')) return 'injuries';
    if (title.includes('Roster')) return 'moves';
    if (title.includes('Games')) return 'games';
    if (title.includes('Breaking')) return 'updates';
    return 'items';
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
    try {
      console.log(`📤 [DISCORD] Attempting to send: ${description}`);
      
      const result = await offlineQueue.queuedChannelSend(channel, content, this.client, description);
      
      console.log(`✅ [DISCORD] Successfully sent: ${description}`);
      return result;
      
    } catch (error) {
      console.error(`💥 [DISCORD ERROR] Failed to send: ${description}`);
      console.error(`   ❌ Error: ${error.message}`);
      console.error(`   📍 Code: ${error.code || 'No code'}`);
      console.error(`   🔍 Status: ${error.status || 'No status'}`);
      console.error(`   🌐 Request: ${error.method || ''} ${error.url || ''}`);
      
      // Log Discord-specific error details
      if (error.code >= 10000) {
        console.error(`   🤖 Discord API Error: ${error.code}`);
      }
      
      if (error.code === 50013) {
        console.error(`   🔒 Permission Error: Bot lacks permission to send messages`);
      }
      
      if (error.code === 50001) {
        console.error(`   👻 Access Error: Bot cannot access this channel`);
      }
      
      throw error; // Re-throw to let parent handler catch it
    }
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
  
  /**
   * Get comprehensive status including run logging
   * @returns {Object} Status information
   */
  getEnhancedStatus() {
    const runnerStatus = {
      isRunning: this.isRunning,
      runningSlots: Array.from(this.runningSlots),
      lastRuns: this.lastRuns,
      pendingRuns: Object.fromEntries(this.pendingRuns),
      batchSize: this.batchSize,
      debounceMs: this.debounceMs,
      lastProcessedCount: this.lastProcessedCount || 0,
      lastSuccessfulCount: this.lastSuccessfulCount || 0
    };
    
    const loggingStatus = runLogger.getDiagnostics();
    const gptStatus = gptSummarizer.getStatus();
    
    return {
      runner: runnerStatus,
      logging: loggingStatus,
      gpt: gptStatus,
      recentRuns: runLogger.getRecentRuns(5)
    };
  }
  
  /**
   * Extract number of days from window string (e.g., "7 days" -> 7)
   * @param {string} windowStr - Window string like "7 days" or "14 days"
   * @returns {number} Number of days
   */
  extractWindowDays(windowStr) {
    if (!windowStr) return 7; // Default
    
    const match = windowStr.match(/(\d+)/);
    return match ? parseInt(match[1]) : 7;
  }
  
  /**
   * Get lookback hours for empty section messages
   * @param {string} title - Section title (e.g., "🏥 Injuries")
   * @returns {number} Lookback hours for this section
   */
  getLookbackHoursForSection(title) {
    // Default to morning lookback hours
    let defaultLookback = parseInt(process.env.LOOKBACK_HOURS_MORNING || '24');
    
    // For breaking news, use evening lookback if available
    if (title.includes('Breaking')) {
      defaultLookback = parseInt(process.env.BREAKING_LOOKBACK_EVENING || '36');
    }
    
    // Try to get current update type from context for more accurate lookback
    try {
      // This is a fallback approach - use time-based detection
      const currentTime = timeUtils.now();
      const currentHour = currentTime.hour;
      
      if (currentHour >= 7 && currentHour < 13) {
        // Morning slot (8 AM)
        return parseInt(process.env.LOOKBACK_HOURS_MORNING || '24');
      } else if (currentHour >= 13 && currentHour < 19) {
        // Afternoon slot (2 PM)  
        return parseInt(process.env.LOOKBACK_HOURS_AFTERNOON || '12');
      } else {
        // Evening slot (8 PM)
        if (title.includes('Breaking')) {
          return parseInt(process.env.BREAKING_LOOKBACK_EVENING || '36');
        } else {
          return parseInt(process.env.LOOKBACK_HOURS_EVENING || '24');
        }
      }
    } catch (error) {
      return defaultLookback;
    }
  }
}

module.exports = DailyUpdater;

// Command-line execution
if (require.main === module) {
  const { Client, GatewayIntentBits } = require('discord.js');
  
  const runType = process.argv[2] || 'manual';
  console.log(`\n🚀 Starting ${runType} update run...`);
  
  // Create Discord client
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages
    ]
  });
  
  // Initialize updater
  const updater = new DailyUpdater(client);
  
  // Login and run update
  client.once('ready', async () => {
    console.log(`✅ Discord bot logged in as ${client.user.tag}`);
    
    try {
      // Run the update
      await updater.runScheduledUpdate(runType);
      console.log(`✅ ${runType} update completed successfully`);
      
      // Give time for messages to send
      setTimeout(() => {
        client.destroy();
        process.exit(0);
      }, 5000);
    } catch (error) {
      console.error(`❌ Error running ${runType} update:`, error);
      client.destroy();
      process.exit(1);
    }
  });
  
  // Handle login errors
  client.on('error', (error) => {
    console.error('❌ Discord client error:', error);
  });
  
  // Login to Discord
  client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('❌ Failed to login to Discord:', error);
    process.exit(1);
  });
}