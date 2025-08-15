const espnInjuries = require('../services/espnInjuries.js');
const pfrTransactions = require('../services/pfrTransactions.js');
const siteExtractors = require('../services/siteExtractors');
const newsClassifier = require('../services/newsClassifier');
const rssFullText = require('../services/rssFullText');
const { getCache, setCache } = require('../lib/cache');
const gptSummarizer = require('../src/services/gptSummarizer.js');
const contentState = require('../src/state/contentState');

/**
 * Enhanced News Aggregation Service with WIDENED LOOKBACK and FALLBACKS
 * Ensures every section has factual content through automatic lookback expansion
 */
class NewsAggregationService {
  constructor() {
    this.cacheKeyPrefix = 'news-aggregate-enhanced:';
    
    // Default lookback hours by run type - EXTENDED for comprehensive baseline
    this.DEFAULT_LOOKBACK = {
      morning: 72,  // 3 days for comprehensive morning report
      afternoon: 48, // 2 days for comprehensive afternoon update
      evening: 48    // 2 days for comprehensive evening update
    };
    
    // Widened lookback when section is sparse (<2 items)
    this.FALLBACK_LOOKBACK = {
      morning: 168,  // 7 days if still sparse
      afternoon: 120, // 5 days if still sparse
      evening: 120    // 5 days if still sparse
    };
    
    // Category sources (strict allowlists)
    this.CATEGORY_SOURCES = {
      injuries: ['espn.com', 'nfl.com', 'profootballtalk.nbcsports.com', 'yahoo.com', 'cbssports.com'],
      roster: ['profootballrumors.com', 'nfl.com'], // + team feeds if configured
      breaking: ['espn.com', 'nfl.com', 'profootballtalk.nbcsports.com', 'yahoo.com', 'cbssports.com']
    };
    
    console.log('📊 Enhanced news aggregation service initialized with widened lookback');
  }

  /**
   * Get categorized news with WIDENED LOOKBACK and FALLBACKS
   * @param {Array} feedUrls - Not used, sources are predefined
   * @param {number} lookbackHours - Base lookback hours
   * @param {string} runType - morning/afternoon/evening
   * @returns {Promise<Object>} Categorized news with full factual bullets
   */
  async getCategorizedNews(feedUrls = null, lookbackHours = null, runType = 'morning') {
    // Reset GPT call counter at start of each run
    gptSummarizer.resetCallCounter();
    // Determine base lookback hours
    const baseLookback = lookbackHours || this.DEFAULT_LOOKBACK[runType] || 24;
    
    console.log(`📰 Enhanced aggregation starting (${runType} run, ${baseLookback}h base lookback)...`);
    
    try {
      let result = {
        injuries: { bullets: [], totalCount: 0, overflow: 0, source: 'None' },
        roster: { bullets: [], totalCount: 0, overflow: 0, source: 'None' },
        breaking: { bullets: [], totalCount: 0, overflow: 0, source: 'None' },
        runType,
        baseLookback,
        fallbacksUsed: []
      };

      // (A) INJURIES: ESPN table + injury news with fallback
      console.log('🏥 Processing injuries with fallback support...');
      const injuryResult = await this.processInjuriesWithFallback(baseLookback, runType);
      result.injuries = injuryResult.data;
      if (injuryResult.fallbackUsed) {
        result.fallbacksUsed.push(`injuries: expanded to ${injuryResult.finalLookback}h`);
      }
      
      // (B) ROSTER CHANGES: PFR transactions + team feeds with fallback
      console.log('🔁 Processing roster changes with fallback support...');  
      const rosterResult = await this.processRosterWithFallback(baseLookback, runType);
      result.roster = rosterResult.data;
      if (rosterResult.fallbackUsed) {
        result.fallbacksUsed.push(`roster: expanded to ${rosterResult.finalLookback}h`);
      }
      
      // (C) BREAKING NEWS: remaining items with fallback and sparse detection
      console.log('📰 Processing breaking news with fallback support...');
      const otherCategories = {
        injuries: result.injuries,
        roster: result.roster
      };
      const breakingResult = await this.processBreakingWithFallback(baseLookback, runType, otherCategories);
      result.breaking = breakingResult.data;
      if (breakingResult.fallbackUsed) {
        result.fallbacksUsed.push(`breaking: expanded to ${breakingResult.finalLookback}h`);
      }

      // DISABLED: Cross-category deduplication was causing category mixing
      // Categories should remain separate to maintain proper Discord sections
      if (false && process.env.GPT_ENABLED === 'true' && gptSummarizer.canMakeCall()) {
        console.log(`🔄 Running final cross-category GPT deduplication...`);
        result = await this.finalGPTDeduplication(result);
      } else {
        console.log(`🔄 Cross-category GPT deduplication: DISABLED (prevents category mixing)`);
      }

      console.log(`✅ Enhanced aggregation complete:`);
      console.log(`   🏥 Injuries: ${result.injuries.totalCount} found → ${result.injuries.bullets.length} used (${result.injuries.source})`);
      console.log(`   🔁 Roster: ${result.roster.totalCount} found → ${result.roster.bullets.length} used (${result.roster.source})`);
      console.log(`   📰 Breaking: ${result.breaking.totalCount} found → ${result.breaking.bullets.length} used (${result.breaking.source})`);
      if (result.fallbacksUsed.length > 0) {
        console.log(`   🔄 Fallbacks: ${result.fallbacksUsed.join(', ')}`);
      }

      // Apply content state delta tracking for consistent reporting
      const enhancedResult = await this.applyContentDeltas(result, runType);

      return enhancedResult;

    } catch (error) {
      console.error(`❌ Enhanced aggregation failed: ${error.message}`);
      return this.getEmptyResult();
    }
  }

  /**
   * Process injuries with automatic fallback expansion
   * @param {number} baseLookback - Base lookback hours
   * @param {string} runType - Run type for fallback calculation
   * @returns {Promise<Object>} Result with fallback info
   */
  async processInjuriesWithFallback(baseLookback, runType) {
    let lookback = baseLookback;
    let fallbackUsed = false;
    
    // Try base lookback first
    console.log(`   📋 Trying injuries with ${lookback}h lookback...`);
    let result = await this.processInjuries(lookback);
    
    // Apply GPT enhancement if enabled
    if (process.env.GPT_ENABLED === 'true') {
      result = await this.enhanceWithGPT(result, 'injuries', lookback);
      // Always polish content for better quality
      result = await this.polishWithGPT(result, 'injuries');
    }
    
    // If sparse (<2 items), expand lookback
    if (result.bullets.length < 2) {
      const fallbackLookback = this.FALLBACK_LOOKBACK[runType] || 48;
      console.log(`   🔄 Injuries sparse (${result.bullets.length} items), expanding to ${fallbackLookback}h...`);
      
      const fallbackResult = await this.processInjuries(fallbackLookback);
      if (fallbackResult.bullets.length > result.bullets.length) {
        result = fallbackResult;
        lookback = fallbackLookback;
        fallbackUsed = true;
        console.log(`   ✅ Fallback successful: ${result.bullets.length} items found`);
      }
    }
    
    // Still sparse? Try team feeds if configured
    if (result.bullets.length < 2) {
      console.log(`   🏈 Still sparse, checking team allowlist feeds...`);
      const teamResult = await this.addTeamFeedInjuries(result, lookback);
      if (teamResult.bullets.length > result.bullets.length) {
        result = teamResult;
        console.log(`   ✅ Team feeds added: ${result.bullets.length} total items`);
      }
    }
    
    return {
      data: result,
      fallbackUsed,
      finalLookback: lookback
    };
  }

  /**
   * Process roster changes with GPT sparse trigger logic
   * @param {number} baseLookback - Base lookback hours
   * @param {string} runType - Run type for fallback calculation
   * @returns {Promise<Object>} Result with fallback info
   */
  async processRosterWithFallback(baseLookback, runType) {
    let lookback = baseLookback;
    let fallbackUsed = false;
    
    // Try base lookback first
    console.log(`   📄 Trying roster with ${lookback}h lookback...`);
    let result = await this.processRosterChanges(lookback);
    
    // NEW: GPT Sparse Trigger Logic - widen lookback FIRST if sparse
    if (result.bullets.length < 2) {
      const sparseExpandedLookback = this.getSparseExpandedLookback(runType);
      console.log(`🎯 GPT sparse trigger: roster sparse (${result.bullets.length} items), widening to ${sparseExpandedLookback}h for GPT enhancement`);
      
      // Rebuild excerpts with wider lookback
      const excerpts = await this.prepareArticlesForGPT('roster', sparseExpandedLookback);
      
      if (excerpts.length > 0 && process.env.GPT_ENABLED === 'true') {
        console.log(`🤖 GPT trigger: roster sparse=true excerpts=${excerpts.length} callsUsed=${gptSummarizer.getStatus().callsUsed}`);
        
        const dateISO = new Date().toISOString().split('T')[0];
        const gptBullets = await gptSummarizer.summarizeRoster(excerpts, dateISO);
        
        if (gptBullets.length > 0) {
          // Merge GPT bullets with existing ones
          const mergedBullets = [...gptBullets, ...result.bullets];
          const dedupedBullets = await gptSummarizer.semanticDedupe(mergedBullets);
          
          result.bullets = dedupedBullets.slice(0, 12);
          result.totalCount = dedupedBullets.length;
          result.source = result.source === 'None' ? 'GPT' : `${result.source} + GPT`;
          
          lookback = sparseExpandedLookback;
          fallbackUsed = true;
          console.log(`   ✅ GPT sparse enhancement: ${result.bullets.length} final bullets from widened lookback`);
        }
      }
    } else {
      // Apply normal GPT enhancement if enabled (non-sparse)
      if (process.env.GPT_ENABLED === 'true') {
        result = await this.enhanceWithGPT(result, 'roster', lookback);
        // Always polish content for better quality
        result = await this.polishWithGPT(result, 'roster');
      }
    }
    
    // Fallback expansion if still sparse (original logic as additional backup)
    if (result.bullets.length < 2) {
      const fallbackLookback = this.FALLBACK_LOOKBACK[runType] || 48;
      console.log(`   🔄 Still sparse after GPT (${result.bullets.length} items), trying fallback to ${fallbackLookback}h...`);
      
      const fallbackResult = await this.processRosterChanges(fallbackLookback);
      if (fallbackResult.bullets.length > result.bullets.length) {
        result = fallbackResult;
        lookback = fallbackLookback;
        fallbackUsed = true;
        console.log(`   ✅ Fallback successful: ${result.bullets.length} items found`);
      }
    }
    
    return {
      data: result,
      fallbackUsed,
      finalLookback: lookback
    };
  }

  /**
   * Process breaking news with GPT sparse trigger logic
   * @param {number} baseLookback - Base lookback hours
   * @param {string} runType - Run type for fallback calculation
   * @param {Object} otherCategories - Other category data for sparse detection
   * @returns {Promise<Object>} Result with fallback info
   */
  async processBreakingWithFallback(baseLookback, runType, otherCategories = {}) {
    let lookback = baseLookback;
    let fallbackUsed = false;
    
    // Try base lookback first
    console.log(`   📡 Trying breaking news with ${lookback}h lookback...`);
    let result = await this.processBreakingNews(lookback);
    
    // ALWAYS try GPT enhancement for breaking news (especially if empty)
    if (process.env.GPT_ENABLED === 'true') {
      console.log(`   🎯 Breaking news GPT enhancement (${result.bullets.length} current bullets)...`);
      result = await this.enhanceWithGPT(result, 'breaking', lookback, otherCategories);
      result = await this.polishWithGPT(result, 'breaking');
    }
    
    // NEW: GPT Sparse Trigger Logic - widen lookback FIRST if still sparse
    if (result.bullets.length < 2) {
      const sparseExpandedLookback = this.getSparseExpandedLookback(runType);
      console.log(`🎯 GPT sparse trigger: breaking sparse (${result.bullets.length} items), widening to ${sparseExpandedLookback}h for GPT enhancement`);
      
      // Rebuild excerpts with wider lookback
      const excerpts = await this.prepareArticlesForGPT('breaking', sparseExpandedLookback);
      
      if (excerpts.length > 0 && process.env.GPT_ENABLED === 'true') {
        console.log(`🤖 GPT trigger: breaking sparse=true excerpts=${excerpts.length} callsUsed=${gptSummarizer.getStatus().callsUsed}`);
        
        const dateISO = new Date().toISOString().split('T')[0];
        const gptBullets = await gptSummarizer.summarizeBreaking(excerpts, dateISO, otherCategories);
        
        if (gptBullets.length > 0) {
          // Merge GPT bullets with existing ones
          const mergedBullets = [...gptBullets, ...result.bullets];
          const dedupedBullets = await gptSummarizer.semanticDedupe(mergedBullets);
          
          result.bullets = dedupedBullets.slice(0, 10);
          result.totalCount = dedupedBullets.length;
          result.source = result.source === 'None' ? 'GPT' : `${result.source} + GPT`;
          
          lookback = sparseExpandedLookback;
          fallbackUsed = true;
          console.log(`   ✅ GPT sparse enhancement: ${result.bullets.length} final bullets from widened lookback`);
        }
      }
    } else {
      // Apply normal GPT enhancement if enabled with sparse detection (non-sparse)
      if (process.env.GPT_ENABLED === 'true') {
        result = await this.enhanceWithGPT(result, 'breaking', lookback, otherCategories);
        // Always polish content for better quality
        result = await this.polishWithGPT(result, 'breaking');
      }
    }
    
    // Fallback expansion if still sparse (original logic as additional backup)
    if (result.bullets.length < 2) {
      const fallbackLookback = this.FALLBACK_LOOKBACK[runType] || 48;
      console.log(`   🔄 Still sparse after GPT (${result.bullets.length} items), trying fallback to ${fallbackLookback}h...`);
      
      const fallbackResult = await this.processBreakingNews(fallbackLookback);
      if (fallbackResult.bullets.length > result.bullets.length) {
        result = fallbackResult;
        lookback = fallbackLookback;
        fallbackUsed = true;
        console.log(`   ✅ Fallback successful: ${result.bullets.length} items found`);
      }
    }
    
    return {
      data: result,
      fallbackUsed,
      finalLookback: lookback
    };
  }

  /**
   * Process injuries: ESPN table + injury-marked news with lookback filtering
   * @param {number} lookbackHours - Hours to look back
   * @returns {Promise<Object>} Formatted injury data
   */
  async processInjuries(lookbackHours) {
    const bullets = [];
    const seenPlayers = new Set();
    let source = 'None';

    try {
      // Primary: ESPN injuries table (filter by lookback for non-morning runs)
      console.log('   📋 Fetching ESPN injuries table...');
      const espnResult = await espnInjuries.fetchInjuries(lookbackHours);
      let injuriesData = espnResult.bullets || [];
      
      // The ESPN service already handles lookback filtering
      console.log(`   📋 ESPN returned: ${injuriesData.length} injury bullets`);
      
      // Add ESPN bullets directly (they're already formatted)
      bullets.push(...injuriesData);

      if (bullets.length > 0) source = 'ESPN table';
      console.log(`   📋 ESPN injuries: ${bullets.length} bullets from table`);

      // Secondary: Injury news from allowed RSS sources
      const maxInjuries = 20; // Cap at 20 MAX
      if (bullets.length < maxInjuries) {
        console.log('   📰 Supplementing with injury news from RSS...');
        const injuryNews = await this.fetchCategorizedNews(lookbackHours, 'injury');
        
        for (const article of injuryNews) {
          if (bullets.length >= maxInjuries) break;
          
          // Extract factual sentence using site extractors
          const extracted = await siteExtractors.extractFromUrl(article.url, article.title, 'injury');
          if (extracted && extracted.sentences && extracted.sentences.length > 0) {
            const bullet = `${extracted.sentences[0]} (${extracted.sourceShort})`;
            bullets.push(bullet);
          }
        }

        if (injuryNews.length > 0) {
          const espnBulletCount = injuriesData.length;
          source = bullets.length > espnBulletCount ? 'ESPN table + RSS' : 'ESPN table';
        }
        console.log(`   📰 After RSS supplement: ${bullets.length} total bullets`);
      }

    } catch (error) {
      console.log(`   ❌ Injury processing error: ${error.message}`);
    }

    return {
      bullets: bullets.slice(0, 20), // Cap at 20 MAX
      totalCount: bullets.length,
      overflow: Math.max(0, bullets.length - 20),
      source
    };
  }

  /**
   * Process roster changes: PFR transactions + team press releases with lookback
   * @param {number} lookbackHours - Hours to look back  
   * @returns {Promise<Object>} Formatted roster data
   */
  async processRosterChanges(lookbackHours) {
    const bullets = [];
    const seenUrls = new Set();
    let source = 'None';

    try {
      // Primary: ProFootballRumors transactions with enhanced sentences
      console.log('   📄 Fetching PFR transactions...');
      const pfrResult = await pfrTransactions.fetchTransactions(lookbackHours);
      const pfrBullets = pfrResult.bullets || [];
      
      console.log(`   📄 PFR returned: ${pfrBullets.length} transaction bullets`);
      bullets.push(...pfrBullets);

      if (bullets.length > 0) source = 'PFR';
      console.log(`   📄 PFR transactions: ${bullets.length} bullets`);

      // Secondary: NFL.com roster items with roster patterns
      const maxRoster = 12; // Cap at 12
      if (bullets.length < maxRoster) {
        console.log('   🏈 Supplementing with NFL.com roster news...');
        const rosterNews = await this.fetchCategorizedNews(lookbackHours, 'roster');
        
        for (const article of rosterNews) {
          if (bullets.length >= maxRoster) break;
          
          // Only include NFL.com for roster supplement
          if (article.url.includes('nfl.com')) {
            const extracted = await siteExtractors.extractFromUrl(article.url, article.title, 'roster');
            if (extracted && extracted.sentences && extracted.sentences.length > 0) {
              const bullet = `${extracted.sentences[0]} (${extracted.sourceShort})`;
              bullets.push(bullet);
              seenUrls.add(article.url);
            }
          }
        }

        if (bullets.length > pfrBullets.length) {
          source = 'PFR + NFL.com';
        }
        console.log(`   🏈 After NFL.com supplement: ${bullets.length} total bullets`);
      }

    } catch (error) {
      console.log(`   ❌ Roster processing error: ${error.message}`);
    }

    return {
      bullets: bullets.slice(0, 12), // Cap at 12
      totalCount: bullets.length,
      overflow: Math.max(0, bullets.length - 12),
      source
    };
  }

  /**
   * Process breaking news: major announcements not in injury/roster
   * @param {number} lookbackHours - Hours to look back
   * @returns {Promise<Object>} Formatted breaking data
   */
  async processBreakingNews(lookbackHours) {
    const bullets = [];
    const seenUrls = new Set();
    let source = 'None';
    
    try {
      console.log('   📡 Fetching breaking news articles...');
      const articles = await this.fetchCategorizedNews(lookbackHours, 'breaking');
      
      const maxBreaking = 10; // Cap at 10
      for (const article of articles) {
        if (bullets.length >= maxBreaking) break;
        
        if (!seenUrls.has(article.url)) {
          const extracted = await siteExtractors.extractFromUrl(article.url, article.title, 'breaking');
          if (extracted && extracted.sentences && extracted.sentences.length > 0) {
            const bullet = `${extracted.sentences[0]} (${extracted.sourceShort})`;
            bullets.push(bullet);
            seenUrls.add(article.url);
          }
        }
      }

      if (bullets.length > 0) source = 'RSS';
      console.log(`   📡 Breaking news: ${bullets.length} bullets`);

    } catch (error) {
      console.log(`   ❌ Breaking news processing error: ${error.message}`);
    }

    return {
      bullets: bullets.slice(0, 10), // Cap at 10
      totalCount: bullets.length,
      overflow: Math.max(0, bullets.length - 10),
      source
    };
  }

  /**
   * Fetch categorized news from RSS feeds
   * @param {number} lookbackHours - Hours to look back
   * @param {string} category - Category to fetch (injury/roster/breaking)
   * @returns {Promise<Array>} Array of articles
   */
  async fetchCategorizedNews(lookbackHours, category) {
    try {
      const allArticles = await rssFullText.fetchFeeds(lookbackHours);
      
      // Filter to category-allowed sources
      const allowedSources = this.CATEGORY_SOURCES[category] || [];
      const filteredArticles = allArticles.filter(article => {
        const domain = this.getSourceDomain(article.url || article.feedUrl);
        return allowedSources.some(allowed => domain.includes(allowed));
      });
      
      // Classify articles using newsClassifier
      const categorized = [];
      for (const article of filteredArticles) {
        const classified = newsClassifier.classify(article);
        if (classified && classified.category === category) {
          categorized.push(article);
        }
      }
      
      return categorized;
    } catch (error) {
      console.log(`   ❌ ${category} news fetch failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Add team allowlist feeds for injuries (if configured)
   * @param {Object} currentResult - Current injury result
   * @param {number} lookbackHours - Hours to look back
   * @returns {Promise<Object>} Enhanced result
   */
  async addTeamFeedInjuries(currentResult, lookbackHours) {
    // Check if TEAM_FEEDS environment variable is configured
    const teamFeeds = process.env.TEAM_FEEDS;
    if (!teamFeeds) {
      console.log('   ⚠️ TEAM_FEEDS not configured, skipping team feeds');
      return currentResult;
    }
    
    console.log('   🏈 Team feeds configured, fetching team injury news...');
    // TODO: Implement team RSS feed processing when configured
    // This would parse the comma-separated TEAM_FEEDS URLs and extract injury news
    
    return currentResult; // For now, return unchanged
  }

  /**
   * Add team allowlist feeds for roster (if configured)
   * @param {Object} currentResult - Current roster result
   * @param {number} lookbackHours - Hours to look back
   * @returns {Promise<Object>} Enhanced result
   */
  async addTeamFeedRoster(currentResult, lookbackHours) {
    // Check if TEAM_FEEDS environment variable is configured
    const teamFeeds = process.env.TEAM_FEEDS;
    if (!teamFeeds) {
      console.log('   ⚠️ TEAM_FEEDS not configured, skipping team feeds');
      return currentResult;
    }
    
    console.log('   🏈 Team feeds configured, fetching team roster news...');
    // TODO: Implement team RSS feed processing when configured
    
    return currentResult; // For now, return unchanged
  }

  /**
   * Format ESPN injury table entry using enhanced format
   * @param {Object} injury - ESPN injury object
   * @returns {string|null} Formatted bullet or null
   */
  formatInjuryBullet(injury) {
    if (!injury.player || !injury.status) return null;
    
    let bullet = '';
    
    // Build base: Player (TEAM) — Status
    if (injury.teamAbbr) {
      bullet = `${injury.player} (${injury.teamAbbr}) — ${injury.status}`;
    } else {
      bullet = `${injury.player} — ${injury.status}`;
    }
    
    // Add injury note in parentheses if present
    if (injury.injuryNote && injury.injuryNote.length > 0) {
      bullet += ` (${injury.injuryNote})`;
    }
    
    // Add updated date with bullet separator
    bullet += ` · Updated ${injury.updatedDate || 'Recently'}`;
    
    // Add source
    bullet += ` (${injury.source})`;
    
    // Format properly with 320 char soft limit
    if (bullet.length > 320) {
      const truncated = bullet.substring(0, 317) + '...';
      bullet = truncated;
    }
    
    return bullet;
  }

  /**
   * Get source domain from URL
   * @param {string} url - URL
   * @returns {string} Domain
   */
  getSourceDomain(url) {
    if (!url) return '';
    
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '').toLowerCase();
    } catch {
      return '';
    }
  }

  /**
   * Final cross-category GPT deduplication to remove overlapping content
   * @param {Object} result - Complete result with all categories
   * @returns {Promise<Object>} Deduplicated result
   */
  async finalGPTDeduplication(result) {
    try {
      // Combine all bullets for cross-category deduplication
      const allBullets = [
        ...result.injuries.bullets,
        ...result.roster.bullets, 
        ...result.breaking.bullets
      ];
      
      if (allBullets.length === 0) {
        return result;
      }
      
      console.log(`   🔄 Cross-category dedupe: ${allBullets.length} total bullets`);
      const dedupedBullets = await gptSummarizer.semanticDedupe(allBullets);
      
      // Redistribute deduplicated bullets back to categories based on content analysis
      const redistributed = this.redistributeBullets(dedupedBullets, result);
      
      console.log(`   ✅ Final deduplication: ${allBullets.length} → ${dedupedBullets.length} bullets`);
      return redistributed;
      
    } catch (error) {
      console.log(`   ❌ Final deduplication failed: ${error.message}`);
      return result;
    }
  }
  
  /**
   * Redistribute deduplicated bullets back to appropriate categories
   * @param {Array} dedupedBullets - Deduplicated bullet array
   * @param {Object} originalResult - Original categorized result
   * @returns {Object} Result with redistributed bullets
   */
  redistributeBullets(dedupedBullets, originalResult) {
    let result = {
      ...originalResult,
      injuries: { ...originalResult.injuries, bullets: [] },
      roster: { ...originalResult.roster, bullets: [] },
      breaking: { ...originalResult.breaking, bullets: [] }
    };
    
    // Simple redistribution based on keywords (can be enhanced with GPT later)
    for (const bullet of dedupedBullets) {
      const lowerBullet = bullet.toLowerCase();
      
      if (lowerBullet.includes('injury') || lowerBullet.includes('injured') || 
          lowerBullet.includes('questionable') || lowerBullet.includes('doubtful') ||
          lowerBullet.includes('ir') || lowerBullet.includes('reserve')) {
        result.injuries.bullets.push(bullet);
      } else if (lowerBullet.includes('sign') || lowerBullet.includes('waive') || 
                 lowerBullet.includes('release') || lowerBullet.includes('trade') ||
                 lowerBullet.includes('claim') || lowerBullet.includes('activate')) {
        result.roster.bullets.push(bullet);
      } else {
        result.breaking.bullets.push(bullet);
      }
    }
    
    // Update counts and sources
    result.injuries.totalCount = result.injuries.bullets.length;
    result.roster.totalCount = result.roster.bullets.length; 
    result.breaking.totalCount = result.breaking.bullets.length;
    
    if (result.injuries.bullets.length > 0) {
      result.injuries.source = result.injuries.source.includes('GPT') ? result.injuries.source : `${result.injuries.source} + GPT Dedupe`;
    }
    if (result.roster.bullets.length > 0) {
      result.roster.source = result.roster.source.includes('GPT') ? result.roster.source : `${result.roster.source} + GPT Dedupe`;
    }
    if (result.breaking.bullets.length > 0) {
      result.breaking.source = result.breaking.source.includes('GPT') ? result.breaking.source : `${result.breaking.source} + GPT Dedupe`;
    }
    
    return result;
  }

  /**
   * Get empty result structure
   * @returns {Object} Empty result
   */
  getEmptyResult() {
    return {
      injuries: { bullets: [], totalCount: 0, overflow: 0, source: 'None' },
      roster: { bullets: [], totalCount: 0, overflow: 0, source: 'None' },
      breaking: { bullets: [], totalCount: 0, overflow: 0, source: 'None' },
      fallbacksUsed: []
    };
  }

  /**
   * Enhance category results with GPT summarization - improved logic
   * @param {Object} result - Current category result with bullets
   * @param {string} category - Category type (injuries/roster/breaking)
   * @param {number} lookbackHours - Hours looked back
   * @returns {Promise<Object>} Enhanced result
   */
  async enhanceWithGPT(result, category, lookbackHours, otherCategories = {}) {
    try {
      const forceMode = process.env.GPT_FORCE_MODE === 'true';
      console.log(`   🤖 Enhancing ${category} with GPT (${result.bullets.length} existing bullets)${forceMode ? ' [FORCE MODE]' : ''}...`);
      
      // Always enhance content - GPT provides intelligence, polish, and deduplication
      // Force mode ensures GPT is used even with good content
      
      // Prepare excerpts for GPT
      const excerpts = await this.prepareArticlesForGPT(category, lookbackHours);
      
      if (excerpts.length === 0) {
        console.log(`   ⚠️ No excerpts available for GPT enhancement`);
        return result;
      }
      
      const dateISO = new Date().toISOString().split('T')[0];
      let gptBullets = [];
      
      // Call appropriate GPT function based on category
      switch(category) {
        case 'injuries':
          gptBullets = await gptSummarizer.summarizeInjuries(excerpts, dateISO);
          break;
        case 'roster':
          gptBullets = await gptSummarizer.summarizeRoster(excerpts, dateISO);
          break;
        case 'breaking':
          gptBullets = await gptSummarizer.summarizeBreaking(excerpts, dateISO, otherCategories);
          break;
      }
      
      if (gptBullets.length > 0) {
        console.log(`   ✅ GPT produced ${gptBullets.length} enhanced bullets`);
        
        // Merge GPT bullets with existing ones (GPT bullets first)
        const mergedBullets = [...gptBullets, ...result.bullets];
        
        // Apply semantic deduplication
        const dedupedBullets = await gptSummarizer.semanticDedupe(mergedBullets);
        
        // Update result
        const maxBullets = category === 'injuries' ? 20 : (category === 'roster' ? 12 : 10);
        result.bullets = dedupedBullets.slice(0, maxBullets);
        result.totalCount = dedupedBullets.length;
        result.overflow = Math.max(0, dedupedBullets.length - maxBullets);
        result.source = result.source === 'None' ? 'GPT' : `${result.source} + GPT`;
        
        console.log(`   ✅ After GPT enhancement: ${result.bullets.length} final bullets`);
      } else {
        console.log(`   ⚠️ GPT produced no bullets, keeping rule-based results`);
      }
      
    } catch (error) {
      console.log(`   ❌ GPT enhancement failed: ${error.message}, keeping rule-based results`);
    }
    
    return result;
  }

  /**
   * Prepare articles for GPT processing - enhanced with better excerpt formatting
   * @param {string} category - Category type
   * @param {number} lookbackHours - Hours to look back
   * @returns {Promise<Array>} Articles formatted as Excerpts for GPT
   */
  async prepareArticlesForGPT(category, lookbackHours) {
    try {
      // Fetch categorized articles
      const articles = await this.fetchCategorizedNews(lookbackHours, category);
      
      // Format as Excerpt objects (500-700 chars per text)
      const excerpts = articles.slice(0, 5).map(article => ({
        source: this.deriveSourceShort(article.url || article.feedUrl),
        url: article.url,
        title: article.title ? article.title.substring(0, 100) : undefined,
        text: this.cleanTextForGPT(article.content || article.description || ''),
        team: this.extractTeamFromArticle(article),
        player: this.extractPlayerFromArticle(article)
      })).filter(excerpt => excerpt.text.length > 50); // Must have meaningful text
      
      return excerpts;
      
    } catch (error) {
      console.log(`   ❌ Failed to prepare excerpts for GPT: ${error.message}`);
      return [];
    }
  }

  /**
   * Polish existing content with GPT for better formatting and quality
   * @param {Object} result - Category result with bullets
   * @param {string} category - Category type (injuries/roster/breaking)  
   * @returns {Promise<Object>} Polished result
   */
  async polishWithGPT(result, category) {
    if (!gptSummarizer.canMakeCall() || result.bullets.length === 0) {
      return result;
    }
    
    try {
      console.log(`   ✨ Polishing ${category} content with GPT (${result.bullets.length} bullets)...`);
      
      // First, enhance the format and readability using GPT
      const enhancedBullets = await this.enhanceExistingBulletsWithGPT(result.bullets, category);
      
      // Then apply semantic deduplication
      const polishedBullets = await gptSummarizer.semanticDedupe(enhancedBullets.length > 0 ? enhancedBullets : result.bullets);
      
      if (polishedBullets.length > 0) {
        result.bullets = polishedBullets;
        result.totalCount = polishedBullets.length;
        result.source = result.source === 'None' ? 'GPT Polish' : `${result.source} + GPT Polish`;
        console.log(`   ✅ Content polished: ${polishedBullets.length} bullets after enhancement and deduplication`);
      }
      
      return result;
      
    } catch (error) {
      console.log(`   ❌ Content polish failed: ${error.message}`);
      return result;
    }
  }

  /**
   * Enhance existing bullets with GPT for better readability
   * @param {Array} bullets - Existing bullets to enhance
   * @param {string} category - Category type
   * @returns {Promise<Array>} Enhanced bullets
   */
  async enhanceExistingBulletsWithGPT(bullets, category) {
    if (!gptSummarizer.canMakeCall() || bullets.length === 0) {
      return bullets;
    }

    try {
      const systemPrompt = `You are an NFL content enhancement assistant. Your job is to clean up and format NFL ${category} updates while preserving ALL specific details like player names, positions, teams, dates, contract amounts, and injury types. DO NOT make content vague or generic. Keep all facts exactly as provided.`;

      let userPrompt = '';
      if (category === 'injuries') {
        userPrompt = `Clean up these injury reports. Keep ALL specific details: player names, positions, teams, injury types, dates, and sources. DO NOT use generic terms like "a player" or vague descriptions. Format consistently. IMPORTANT: Return each complete injury report as a single line item, not broken into separate fields.

Original bullets:
${bullets.map((b, i) => `${i + 1}. ${b}`).join('\n')}`;
      } else if (category === 'roster') {
        userPrompt = `Clean up these roster moves. Keep ALL specific details: player names, positions, teams, contract amounts, transaction types, and dates. DO NOT use vague terms like "a player" or "made a move". Be specific. Return each complete roster move as a single line item.

Original bullets:
${bullets.map((b, i) => `${i + 1}. ${b}`).join('\n')}`;
      } else {
        userPrompt = `Clean up these breaking news items. Keep ALL specific details: names, teams, amounts, dates, and facts. DO NOT create generic summaries. Preserve all factual information.

Original bullets:
${bullets.map((b, i) => `${i + 1}. ${b}`).join('\n')}`;
      }

      const enhancedContent = await gptSummarizer.makeGPTCall(systemPrompt, userPrompt);
      
      if (enhancedContent.length > 0) {
        console.log(`   ✨ Enhanced ${enhancedContent.length} ${category} bullets for readability`);
        return enhancedContent;
      }
      
      return bullets; // Return original if enhancement fails
      
    } catch (error) {
      console.log(`   ❌ Bullet enhancement failed: ${error.message}`);
      return bullets;
    }
  }

  /**
   * Clean text for GPT processing - remove bylines, ads, URLs
   * @param {string} text - Raw text content
   * @returns {string} Cleaned text (500-700 chars target)
   */
  cleanTextForGPT(text) {
    if (!text) return '';
    
    // Remove bylines and author info
    text = text.replace(/^(By\s+[^\n]+|Staff\s+Report|Associated\s+Press|Reuters)[\n\r]*/i, '');
    
    // Remove URLs and social media handles
    text = text.replace(/https?:\/\/\S+/g, '').replace(/@\w+|#\w+/g, '');
    
    // Remove advertisement patterns
    text = text.replace(/(Advertisement|ADVERTISEMENT)[\s\S]*?(?=\n\n|$)/gi, '');
    
    // Clean whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    // Trim to 500-700 chars at sentence boundary if possible
    if (text.length > 700) {
      const sentences = text.split(/(?<=[.!?])\s+/);
      let result = '';
      for (const sentence of sentences) {
        if ((result + sentence).length <= 700) {
          result += (result ? ' ' : '') + sentence;
        } else {
          break;
        }
      }
      text = result || text.substring(0, 697) + '...';
    }
    
    return text;
  }

  /**
   * Extract team name from article content
   * @param {Object} article - Article object
   * @returns {string|undefined} Team name if found
   */
  extractTeamFromArticle(article) {
    const text = (article.title + ' ' + article.content).toLowerCase();
    const teamKeywords = [
      'cowboys', 'patriots', 'steelers', 'packers', 'chiefs', 'bills',
      'dolphins', 'jets', 'ravens', 'bengals', 'browns', 'texans',
      'colts', 'jaguars', 'titans', 'broncos', 'chargers', 'raiders',
      'eagles', 'giants', 'washington', 'bears', 'lions', 'packers',
      'vikings', 'falcons', 'panthers', 'saints', 'bucs', 'cardinals',
      '49ers', 'seahawks', 'rams'
    ];
    
    for (const team of teamKeywords) {
      if (text.includes(team)) {
        return team;
      }
    }
    return undefined;
  }

  /**
   * Extract player name from article content
   * @param {Object} article - Article object
   * @returns {string|undefined} Player name if found
   */
  extractPlayerFromArticle(article) {
    // Simple heuristic: look for capitalized names in title
    const title = article.title || '';
    const nameMatch = title.match(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/);
    return nameMatch ? nameMatch[0] : undefined;
  }

  /**
   * Derive short source name from URL
   * @param {string} url - URL
   * @returns {string} Short source name
   */
  deriveSourceShort(url) {
    if (!url) return 'Unknown';
    
    const domain = this.getSourceDomain(url);
    const sourceMap = {
      'espn.com': 'ESPN',
      'nfl.com': 'NFL.com',
      'profootballtalk.nbcsports.com': 'PFT',
      'yahoo.com': 'Yahoo',
      'cbssports.com': 'CBS',
      'profootballrumors.com': 'PFR'
    };
    
    return sourceMap[domain] || domain.split('.')[0].toUpperCase();
  }

  /**
   * Get expanded lookback hours for GPT sparse trigger
   * @param {string} runType - morning|afternoon|evening
   * @returns {number} Expanded lookback hours
   */
  getSparseExpandedLookback(runType) {
    const sparseExpandedLookback = {
      morning: 24,    // Morning: 24h
      afternoon: 12,  // Afternoon: 12h  
      evening: 36     // Evening: 36h (expanded for breaking news)
    };
    
    return sparseExpandedLookback[runType] || 24;
  }

  /**
   * Apply content deltas for consistent reporting
   * @param {Object} result - Current aggregation result
   * @param {string} runType - Type of run for context
   * @returns {Object} Enhanced result with delta indicators
   */
  async applyContentDeltas(result, runType) {
    try {
      console.log('🔄 Applying content state deltas for consistent reporting...');
      
      // Prepare content for delta processing
      const currentContent = {
        injuries: {
          items: result.injuries.bullets || [],
          source: result.injuries.source
        },
        roster: {
          items: result.roster.bullets || [],
          source: result.roster.source
        },
        breaking: {
          items: result.breaking.bullets || [],
          source: result.breaking.source
        }
      };

      // Process deltas and get enhanced content
      const enhancedContent = await contentState.processContentDeltas(currentContent);

      // Update result with enhanced content
      const enhancedResult = {
        ...result,
        injuries: {
          bullets: enhancedContent.injuries.items,
          totalCount: enhancedContent.injuries.totalCount,
          newCount: enhancedContent.injuries.newCount,
          baselineCount: enhancedContent.injuries.baselineCount,
          overflow: 0,
          source: enhancedContent.injuries.source + ' + Delta'
        },
        roster: {
          bullets: enhancedContent.roster.items,
          totalCount: enhancedContent.roster.totalCount,
          newCount: enhancedContent.roster.newCount,
          baselineCount: enhancedContent.roster.baselineCount,
          overflow: 0,
          source: enhancedContent.roster.source + ' + Delta'
        },
        breaking: {
          bullets: enhancedContent.breaking.items,
          totalCount: enhancedContent.breaking.totalCount,
          newCount: enhancedContent.breaking.newCount,
          baselineCount: enhancedContent.breaking.baselineCount,
          overflow: 0,
          source: enhancedContent.breaking.source + ' + Delta'
        },
        deltaApplied: true,
        runType
      };

      console.log(`✅ Content deltas applied successfully:`);
      console.log(`   🏥 Injuries: ${enhancedResult.injuries.totalCount} total (${enhancedResult.injuries.newCount} new)`);
      console.log(`   🔁 Roster: ${enhancedResult.roster.totalCount} total (${enhancedResult.roster.newCount} new)`);
      console.log(`   📰 Breaking: ${enhancedResult.breaking.totalCount} total (${enhancedResult.breaking.newCount} new)`);

      return enhancedResult;

    } catch (error) {
      console.error(`❌ Delta application failed: ${error.message}`);
      return result; // Return original result if delta processing fails
    }
  }

  /**
   * Get service status
   * @returns {Object} Status information
   */
  getStatus() {
    const gptStatus = gptSummarizer.getStatus();
    
    return {
      cacheKeyPrefix: this.cacheKeyPrefix,
      defaultLookback: this.DEFAULT_LOOKBACK,
      fallbackLookback: this.FALLBACK_LOOKBACK,
      categorySources: this.CATEGORY_SOURCES,
      widened: true,
      fallbacksEnabled: true,
      deltaTrackingEnabled: true,
      gptEnabled: gptStatus.enabled,
      gptModel: gptStatus.model,
      gptCallsUsed: gptStatus.callsUsed,
      gptCallsLimit: gptStatus.callsLimit
    };
  }
}

module.exports = new NewsAggregationService();