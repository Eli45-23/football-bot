const espnInjuries = require('../services/espnInjuries');
const pfrTransactions = require('../services/pfrTransactions');
const siteExtractors = require('../services/siteExtractors');
const newsClassifier = require('../services/newsClassifier');
const rssFullText = require('../services/rssFullText');
const { getCache, setCache } = require('../lib/cache');
const gptSummarizer = require('../src/services/gptSummarizer.ts');

/**
 * Enhanced News Aggregation Service with WIDENED LOOKBACK and FALLBACKS
 * Ensures every section has factual content through automatic lookback expansion
 */
class NewsAggregationService {
  constructor() {
    this.cacheKeyPrefix = 'news-aggregate-enhanced:';
    
    // Default lookback hours by run type
    this.DEFAULT_LOOKBACK = {
      morning: 24,
      afternoon: 12,
      evening: 12
    };
    
    // Widened lookback when section is sparse (<2 items)
    this.FALLBACK_LOOKBACK = {
      morning: 48,
      afternoon: 18, // +6h from 12h
      evening: 18    // +6h from 12h
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
      const result = {
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
      
      // (C) BREAKING NEWS: remaining items with fallback
      console.log('📰 Processing breaking news with fallback support...');
      const breakingResult = await this.processBreakingWithFallback(baseLookback, runType);
      result.breaking = breakingResult.data;
      if (breakingResult.fallbackUsed) {
        result.fallbacksUsed.push(`breaking: expanded to ${breakingResult.finalLookback}h`);
      }

      console.log(`✅ Enhanced aggregation complete:`);
      console.log(`   🏥 Injuries: ${result.injuries.totalCount} found → ${result.injuries.bullets.length} used (${result.injuries.source})`);
      console.log(`   🔁 Roster: ${result.roster.totalCount} found → ${result.roster.bullets.length} used (${result.roster.source})`);
      console.log(`   📰 Breaking: ${result.breaking.totalCount} found → ${result.breaking.bullets.length} used (${result.breaking.source})`);
      if (result.fallbacksUsed.length > 0) {
        console.log(`   🔄 Fallbacks: ${result.fallbacksUsed.join(', ')}`);
      }

      return result;

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
   * Process roster changes with automatic fallback expansion
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
    
    // Apply GPT enhancement if enabled
    if (process.env.GPT_ENABLED === 'true') {
      result = await this.enhanceWithGPT(result, 'roster', lookback);
    }
    
    // If sparse (<2 items), expand lookback
    if (result.bullets.length < 2) {
      const fallbackLookback = this.FALLBACK_LOOKBACK[runType] || 48;
      console.log(`   🔄 Roster sparse (${result.bullets.length} items), expanding to ${fallbackLookback}h...`);
      
      const fallbackResult = await this.processRosterChanges(fallbackLookback);
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
      const teamResult = await this.addTeamFeedRoster(result, lookback);
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
   * Process breaking news with automatic fallback expansion
   * @param {number} baseLookback - Base lookback hours
   * @param {string} runType - Run type for fallback calculation
   * @returns {Promise<Object>} Result with fallback info
   */
  async processBreakingWithFallback(baseLookback, runType) {
    let lookback = baseLookback;
    let fallbackUsed = false;
    
    // Try base lookback first
    console.log(`   📡 Trying breaking news with ${lookback}h lookback...`);
    let result = await this.processBreakingNews(lookback);
    
    // Apply GPT enhancement if enabled
    if (process.env.GPT_ENABLED === 'true') {
      result = await this.enhanceWithGPT(result, 'breaking', lookback);
    }
    
    // If sparse (<2 items), expand lookback
    if (result.bullets.length < 2) {
      const fallbackLookback = this.FALLBACK_LOOKBACK[runType] || 48;
      console.log(`   🔄 Breaking sparse (${result.bullets.length} items), expanding to ${fallbackLookback}h...`);
      
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
      let injuriesData = await espnInjuries.fetchInjuries();
      
      // For afternoon/evening runs, filter by lookback window
      if (lookbackHours < 24) {
        const cutoffTime = new Date(Date.now() - (lookbackHours * 60 * 60 * 1000));
        injuriesData = injuriesData.filter(injury => {
          // If injury has timestamp, use it; otherwise include all (recent)
          if (injury.timestamp) {
            return new Date(injury.timestamp) > cutoffTime;
          }
          return true; // Include if no timestamp (recent updates)
        });
      }
      
      // Format ESPN injuries with new bullet format
      for (const injury of injuriesData) {
        const playerKey = `${injury.player}:${injury.teamAbbr || 'UNK'}`;
        if (!seenPlayers.has(playerKey)) {
          const bullet = this.formatInjuryBullet(injury);
          if (bullet) {
            bullets.push(bullet);
            seenPlayers.add(playerKey);
          }
        }
      }

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
          source = bullets.length > injuriesData.length ? 'ESPN table + RSS' : 'ESPN table';
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
      const pfrTrans = await pfrTransactions.fetchTransactions(lookbackHours);
      
      for (const transaction of pfrTrans) {
        if (!seenUrls.has(transaction.url)) {
          bullets.push(transaction.bullet);
          seenUrls.add(transaction.url);
        }
      }

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

        if (bullets.length > pfrTrans.length) {
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
  async enhanceWithGPT(result, category, lookbackHours) {
    try {
      console.log(`   🤖 Enhancing ${category} with GPT...`);
      
      // Policy: Only enhance sparse sections (< 2 bullets) to save GPT calls
      if (result.bullets.length >= 2) {
        console.log(`   ℹ️ ${category} has ${result.bullets.length} bullets, skipping GPT (not sparse)`);
        return result;
      }
      
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
          gptBullets = await gptSummarizer.summarizeBreaking(excerpts, dateISO);
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
      gptEnabled: gptStatus.enabled,
      gptModel: gptStatus.model,
      gptCallsUsed: gptStatus.callsUsed,
      gptCallsLimit: gptStatus.callsLimit
    };
  }
}

module.exports = new NewsAggregationService();