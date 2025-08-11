const { setCache, getCache, CacheKeys } = require('../lib/cache');

/**
 * Article deduplication and caching service
 * Manages seen article links and provides 24-hour deduplication
 */
class ArticleCacheService {
  constructor() {
    this.seenArticlesKey = 'rss:seen-articles';
    this.lastRunKey = 'rss:last-run-timestamp';
  }

  /**
   * Get list of recently seen article links
   * @returns {Promise<Set>} Set of seen article links
   */
  async getSeen() {
    try {
      const seenArray = await getCache(this.seenArticlesKey);
      return new Set(seenArray || []);
    } catch (error) {
      console.error('❌ Error getting seen articles:', error);
      return new Set();
    }
  }

  /**
   * Add article links to seen list
   * @param {Array|string} links - Article link(s) to mark as seen
   */
  async addSeen(links) {
    try {
      const linksArray = Array.isArray(links) ? links : [links];
      const currentSeen = await this.getSeen();
      
      linksArray.forEach(link => currentSeen.add(link));
      
      // Store as array for 24 hours
      await setCache(this.seenArticlesKey, Array.from(currentSeen), 1440); // 24 hours
      
      console.log(`📝 Added ${linksArray.length} articles to seen list (${currentSeen.size} total)`);
    } catch (error) {
      console.error('❌ Error adding seen articles:', error);
    }
  }

  /**
   * Filter out articles that have been seen recently
   * @param {Array} articles - Articles to filter
   * @returns {Promise<Array>} Filtered articles
   */
  async filterUnseen(articles) {
    try {
      const seen = await this.getSeen();
      const unseen = articles.filter(article => !seen.has(article.link));
      
      const filteredCount = articles.length - unseen.length;
      if (filteredCount > 0) {
        console.log(`🔍 Filtered out ${filteredCount} previously seen articles`);
      }
      
      return unseen;
    } catch (error) {
      console.error('❌ Error filtering articles:', error);
      return articles; // Return all articles if filtering fails
    }
  }

  /**
   * Mark articles as seen after processing
   * @param {Array} articles - Articles to mark as seen
   */
  async markAsSeen(articles) {
    if (!articles || articles.length === 0) return;
    
    const links = articles.map(article => article.link).filter(Boolean);
    if (links.length > 0) {
      await this.addSeen(links);
    }
  }

  /**
   * Get timestamp of last RSS run
   * @returns {Promise<Date|null>} Last run timestamp or null
   */
  async getLastRun() {
    try {
      const timestamp = await getCache(this.lastRunKey);
      return timestamp ? new Date(timestamp) : null;
    } catch (error) {
      console.error('❌ Error getting last run timestamp:', error);
      return null;
    }
  }

  /**
   * Update last RSS run timestamp
   */
  async updateLastRun() {
    try {
      const now = new Date().toISOString();
      await setCache(this.lastRunKey, now, 1440); // 24 hours
      console.log(`⏰ Updated last RSS run: ${now}`);
    } catch (error) {
      console.error('❌ Error updating last run timestamp:', error);
    }
  }

  /**
   * Get articles since last run (if available)
   * @param {Array} articles - All articles
   * @returns {Promise<Array>} Articles since last run
   */
  async filterSinceLastRun(articles) {
    try {
      const lastRun = await this.getLastRun();
      if (!lastRun) {
        console.log('📅 No previous run found, using all articles');
        return articles;
      }

      const filtered = articles.filter(article => {
        try {
          const articleDate = new Date(article.isoDate);
          return articleDate > lastRun;
        } catch {
          return true; // Include articles with invalid dates
        }
      });

      const filteredCount = articles.length - filtered.length;
      console.log(`📅 Filtered to ${filtered.length} articles since last run (${filteredCount} older)`);
      
      return filtered;
    } catch (error) {
      console.error('❌ Error filtering articles since last run:', error);
      return articles;
    }
  }

  /**
   * Full deduplication process for articles
   * @param {Array} articles - Raw articles from RSS
   * @returns {Promise<Array>} Deduplicated articles
   */
  async deduplicateArticles(articles) {
    try {
      // Filter by last run timestamp
      let filtered = await this.filterSinceLastRun(articles);
      
      // Filter by seen links
      filtered = await this.filterUnseen(filtered);
      
      // Mark as seen for next time
      await this.markAsSeen(filtered);
      
      // Update last run timestamp
      await this.updateLastRun();
      
      return filtered;
    } catch (error) {
      console.error('❌ Error in deduplication process:', error);
      return articles; // Return original articles if deduplication fails
    }
  }

  /**
   * Get cache status
   * @returns {Promise<Object>} Cache status information
   */
  async getStatus() {
    try {
      const seen = await this.getSeen();
      const lastRun = await this.getLastRun();
      
      return {
        seenArticleCount: seen.size,
        lastRun: lastRun ? lastRun.toISOString() : null,
        lastRunAge: lastRun ? Date.now() - lastRun.getTime() : null
      };
    } catch (error) {
      console.error('❌ Error getting cache status:', error);
      return {
        seenArticleCount: 0,
        lastRun: null,
        lastRunAge: null
      };
    }
  }

  /**
   * Clear all cached data (for testing)
   */
  async clear() {
    try {
      const { deleteCache } = require('../lib/cache');
      await deleteCache(this.seenArticlesKey);
      await deleteCache(this.lastRunKey);
      console.log('🧹 Cleared all article cache data');
    } catch (error) {
      console.error('❌ Error clearing article cache:', error);
    }
  }
}

module.exports = new ArticleCacheService();