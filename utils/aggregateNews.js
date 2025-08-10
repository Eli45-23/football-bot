const espnInjuries = require('../services/espnInjuries');
const pfrTransactions = require('../services/pfrTransactions');
const rssFullText = require('../services/rssFullText');
const newsClassifier = require('../services/newsClassifier');
const { getCache, setCache } = require('../lib/cache');

/**
 * News aggregation service with STRICT source routing
 * GOALS: Build categories in order with source-specific extraction
 * 
 * Order: (a) Injuries: ESPN table + injury news (b) Roster: PFR + teams (c) Breaking: remaining
 */
class NewsAggregationService {
  constructor() {
    this.cacheKeyPrefix = 'news-aggregate:';
    this.seenUrlsCacheKey = 'news-aggregate:seen-urls';
    
    console.log('📊 News aggregation service initialized with source routing');
  }

  /**
   * Get categorized news using STRICT source routing
   * @param {Array} feedUrls - Not used, sources are predefined
   * @param {number} lookbackHours - Hours to look back
   * @param {Object} caps - Category caps {injuries: 8, roster: 8, breaking: 6}
   * @returns {Promise<Object>} Categorized news with clean bullets
   */
  async getCategorizedNews(feedUrls = null, lookbackHours = 24, cap = 5) {
    // Use new caps structure but maintain backward compatibility
    const categoryCaps = typeof cap === 'object' ? cap : { injuries: 8, roster: 8, breaking: 6 };
    
    console.log(`📰 Aggregating with source routing (${lookbackHours}h lookback)...`);
    console.log(`   🎯 Caps: ${categoryCaps.injuries} injuries, ${categoryCaps.roster} roster, ${categoryCaps.breaking} breaking`);
    
    try {
      const result = {
        injuries: { bullets: [], totalCount: 0, overflow: 0 },
        roster: { bullets: [], totalCount: 0, overflow: 0 },
        breaking: { bullets: [], totalCount: 0, overflow: 0 }
      };

      // (A) INJURIES: ESPN injuries table + injury-marked news from allowed sources
      console.log('🏥 Processing injuries...');
      const injuryBullets = await this.processInjuries(lookbackHours, categoryCaps.injuries);
      result.injuries = {
        bullets: injuryBullets.slice(0, categoryCaps.injuries),
        totalCount: injuryBullets.length,
        overflow: Math.max(0, injuryBullets.length - categoryCaps.injuries)
      };
      
      // (B) ROSTER CHANGES: PFR transactions + team press releases
      console.log('🔁 Processing roster changes...');  
      const rosterBullets = await this.processRosterChanges(lookbackHours, categoryCaps.roster);
      result.roster = {
        bullets: rosterBullets.slice(0, categoryCaps.roster),
        totalCount: rosterBullets.length,
        overflow: Math.max(0, rosterBullets.length - categoryCaps.roster)
      };
      
      // (C) BREAKING NEWS: remaining classified items not in above categories
      console.log('📰 Processing breaking news...');
      const breakingBullets = await this.processBreakingNews(lookbackHours, categoryCaps.breaking);
      result.breaking = {
        bullets: breakingBullets.slice(0, categoryCaps.breaking),
        totalCount: breakingBullets.length,
        overflow: Math.max(0, breakingBullets.length - categoryCaps.breaking)
      };

      console.log(`✅ Source routing complete:`);
      console.log(`   🏥 Injuries: ${result.injuries.totalCount} found → ${result.injuries.bullets.length} used`);
      console.log(`   🔁 Roster: ${result.roster.totalCount} found → ${result.roster.bullets.length} used`);
      console.log(`   📰 Breaking: ${result.breaking.totalCount} found → ${result.breaking.bullets.length} used`);

      return result;

    } catch (error) {
      console.error(`❌ News aggregation failed: ${error.message}`);
      return this.getEmptyResult();
    }
  }

  /**
   * Process injuries: ESPN table + injury-marked news
   * @param {number} lookbackHours - Hours to look back
   * @param {number} cap - Maximum bullets to return
   * @returns {Promise<Array>} Array of injury bullet strings
   */
  async processInjuries(lookbackHours, cap) {
    const bullets = [];
    const seenPlayers = new Set(); // Dedupe by player

    try {
      // Primary: ESPN injuries table
      console.log('   📋 Fetching ESPN injuries table...');
      const injuriesData = await espnInjuries.fetchInjuries();
      
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

      console.log(`   📋 ESPN injuries table: ${bullets.length} bullets`);

      // Secondary: Injury news from RSS feeds (allowed sources only)
      if (bullets.length < cap) {
        console.log('   📰 Supplementing with injury news...');
        const injuryNews = await this.fetchInjuryNews(lookbackHours);
        
        for (const article of injuryNews) {
          if (bullets.length >= cap) break;
          
          const classified = newsClassifier.classify(article);
          if (classified && classified.category === 'injury') {
            // Check for player duplication
            const player = this.extractPlayerFromBullet(classified.factBullet);
            if (player) {
              const playerKey = `${player}:UNK`;
              if (!seenPlayers.has(playerKey)) {
                bullets.push(classified.factBullet);
                seenPlayers.add(playerKey);
              }
            } else {
              bullets.push(classified.factBullet);
            }
          }
        }

        console.log(`   📰 After news supplement: ${bullets.length} total bullets`);
      }

    } catch (error) {
      console.log(`   ❌ Injury processing error: ${error.message}`);
    }

    return bullets;
  }

  /**
   * Process roster changes: PFR transactions + team press releases  
   * @param {number} lookbackHours - Hours to look back
   * @param {number} cap - Maximum bullets to return
   * @returns {Promise<Array>} Array of roster bullet strings
   */
  async processRosterChanges(lookbackHours, cap) {
    const bullets = [];
    const seenUrls = new Set(); // Dedupe by URL

    try {
      // Primary: ProFootballRumors transactions
      console.log('   📄 Fetching PFR transactions...');
      const pfrTrans = await pfrTransactions.fetchTransactions(lookbackHours);
      
      for (const transaction of pfrTrans) {
        if (bullets.length >= cap) break;
        
        if (!seenUrls.has(transaction.url)) {
          bullets.push(transaction.bullet);
          seenUrls.add(transaction.url);
        }
      }

      console.log(`   📄 PFR transactions: ${bullets.length} bullets`);

      // Secondary: Team press releases (if configured)
      // TODO: Add team RSS feeds when more team feeds are configured
      if (bullets.length < cap) {
        console.log('   🏈 Team press releases: not implemented yet');
        // This would fetch from teamMappings.teamRSSFeeds
      }

    } catch (error) {
      console.log(`   ❌ Roster processing error: ${error.message}`);
    }

    return bullets;
  }

  /**
   * Process breaking news: major announcements not in injury/roster
   * @param {number} lookbackHours - Hours to look back
   * @param {number} cap - Maximum bullets to return
   * @returns {Promise<Array>} Array of breaking news bullet strings
   */
  async processBreakingNews(lookbackHours, cap) {
    const bullets = [];
    
    try {
      // Get general RSS articles
      console.log('   📡 Fetching general news articles...');
      const articles = await rssFullText.fetchFeeds(lookbackHours);
      
      for (const article of articles) {
        if (bullets.length >= cap) break;
        
        const classified = newsClassifier.classify(article);
        if (classified && classified.category === 'breaking') {
          bullets.push(classified.factBullet);
        }
      }

      console.log(`   📡 Breaking news: ${bullets.length} bullets`);

    } catch (error) {
      console.log(`   ❌ Breaking news processing error: ${error.message}`);
    }

    return bullets;
  }

  /**
   * Fetch injury-specific news from allowed RSS sources
   * @param {number} lookbackHours - Hours to look back
   * @returns {Promise<Array>} Array of articles
   */
  async fetchInjuryNews(lookbackHours) {
    try {
      const allArticles = await rssFullText.fetchFeeds(lookbackHours);
      
      // Filter to injury-allowed sources only
      const injurySources = ['espn.com', 'nfl.com', 'yahoo.com', 'profootballtalk.nbcsports.com'];
      
      return allArticles.filter(article => {
        const domain = this.getSourceDomain(article.url || article.feedUrl);
        return injurySources.some(allowed => domain.includes(allowed));
      });
    } catch (error) {
      console.log(`   ❌ Injury news fetch failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Format ESPN injury table entry as bullet
   * @param {Object} injury - ESPN injury object
   * @returns {string|null} Formatted bullet or null
   */
  formatInjuryBullet(injury) {
    if (!injury.player || !injury.status) return null;
    
    let bullet = '';
    
    if (injury.teamAbbr) {
      bullet = `${injury.player} (${injury.teamAbbr}) — ${injury.status}`;
    } else {
      bullet = `${injury.player} — ${injury.status}`;
    }
    
    // Add note if present and valuable
    if (injury.note && injury.note.length > 3) {
      bullet += `; ${injury.note}`;
    }
    
    // Add source
    bullet += ` (${injury.source})`;
    
    // Format properly (320 char soft limit)
    return this.formatBullet(bullet);
  }

  /**
   * Extract player name from bullet (simple heuristic)
   * @param {string} bullet - Bullet text
   * @returns {string|null} Player name or null
   */
  extractPlayerFromBullet(bullet) {
    if (!bullet) return null;
    
    // Look for "Name (TEAM)" or "Name —" patterns
    const patterns = [
      /^([A-Z][a-z]+'?\s+[A-Z][a-z]+)\s+\(/,  // "John Smith ("
      /^([A-Z][a-z]+'?\s+[A-Z][a-z]+)\s+—/    // "John Smith —"
    ];
    
    for (const pattern of patterns) {
      const match = bullet.match(pattern);
      if (match) return match[1];
    }
    
    return null;
  }

  /**
   * Format bullet with proper length and punctuation
   * @param {string} bullet - Raw bullet
   * @returns {string} Formatted bullet
   */
  formatBullet(bullet) {
    if (!bullet) return '';
    
    let formatted = bullet.trim();
    
    // Ensure proper capitalization
    formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    
    // Soft limit 320 chars, truncate at word boundary
    if (formatted.length > 320) {
      const truncated = formatted.substring(0, 317);
      const lastSpace = truncated.lastIndexOf(' ');
      formatted = (lastSpace > 250 ? truncated.substring(0, lastSpace) : truncated) + '...';
    }
    
    // Ensure proper ending
    if (!formatted.match(/[.!?)\]]$/)) {
      if (formatted.match(/\([A-Z]+\)$/)) {
        // Ends with source citation
      } else {
        formatted += '.';
      }
    }
    
    return formatted;
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
      injuries: { bullets: [], totalCount: 0, overflow: 0 },
      roster: { bullets: [], totalCount: 0, overflow: 0 },
      breaking: { bullets: [], totalCount: 0, overflow: 0 }
    };
  }

  /**
   * Get service status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      cacheKeyPrefix: this.cacheKeyPrefix,
      sourceRouting: 'strict',
      categories: {
        injuries: 'ESPN table + injury news',
        roster: 'PFR transactions + team releases',
        breaking: 'remaining classified items'
      }
    };
  }
}

module.exports = new NewsAggregationService();