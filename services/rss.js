const Parser = require('rss-parser');
const moment = require('moment-timezone');
const config = require('../config/config');

/**
 * RSS News Service for NFL Discord Bot
 * Fetches from multiple reliable RSS sources and categorizes content
 */
class RSSService {
  constructor() {
    this.parser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'NFL Discord Bot RSS Reader'
      }
    });

    // High-quality RSS sources as specified
    this.feeds = process.env.RSS_FEEDS ? 
      process.env.RSS_FEEDS.split(',') : 
      [
        'https://www.espn.com/espn/rss/nfl/news',
        'https://www.nfl.com/rss/rsslanding?searchString=home',
        'https://sports.yahoo.com/nfl/rss.xml',
        'https://www.cbssports.com/rss/headlines/nfl/',
        'https://www.nbcsports.com/profootballtalk.rss'
      ];

    // Keyword categorization rules (case-insensitive)
    this.injuryKeywords = [
      'injury', 'injured', 'out for season', 'questionable', 'doubtful', 
      'inactive', 'inactives', 'ir', 'injured reserve', 'pup', 
      'physically unable', 'did not practice', 'limited practice', 'dnp',
      'ruled out', 'hamstring', 'ankle', 'knee', 'concussion', 'groin', 
      'back', 'wrist', 'shoulder'
    ];

    this.rosterKeywords = [
      'sign', 'signed', 're-sign', 'resign', 'waive', 'waived', 
      'release', 'released', 'trade', 'traded', 'acquire', 'acquired',
      'promote', 'promoted', 'elevate', 'elevated', 'claim', 'claimed',
      'activate', 'activated', 'place on ir', 'placed on ir', 
      'designate to return', 'extend', 'extension'
    ];

    this.breakingKeywords = [
      'breaking', 'sources', 'per source', 'expected to', 'ruled', 
      'announced', 'agrees to', 'agreed', 'extension', 'out indefinitely',
      'returns', 'returning', 'sidelined', 'season-ending', 'retires', 
      'retirement', 'suspended', 'suspension', 'charged', 'arrested',
      'surgery', 'named', 'confirmed', 'decision', 'announces',
      'starts', 'starting', 'benched', 'replaced', 'cleared',
      'expects', 'ready', 'won\'t face', 'will play', 'won\'t play',
      'need', 'changes his mind', 'loses', 'Hall of Fame'
    ];
  }

  /**
   * Fetch and normalize articles from all RSS feeds
   * @param {number} lookbackHours - Hours to look back (default 24)
   * @returns {Promise<Array>} Array of normalized articles
   */
  async fetchAllNews(lookbackHours = 24) {
    console.log(`📰 Fetching RSS from ${this.feeds.length} sources (${lookbackHours}h lookback)...`);
    
    const fetchPromises = this.feeds.map(async (feedUrl) => {
      try {
        const feed = await this.parser.parseURL(feedUrl);
        const sourceName = this.getSourceName(feedUrl);
        
        const articles = feed.items
          .filter(item => this.isWithinHours(item.isoDate || item.pubDate, lookbackHours))
          .filter(item => this.isValidBreakingNewsContent(item, lookbackHours)) // Additional filtering for quality
          .map(item => ({
            title: item.title || '',
            link: item.link || '',
            isoDate: item.isoDate || item.pubDate || new Date().toISOString(),
            contentSnippet: (item.contentSnippet || item.content || '').substring(0, 200),
            source: sourceName
          }));

        console.log(`   ✅ ${sourceName}: ${articles.length} recent articles`);
        return articles;

      } catch (error) {
        const sourceName = this.getSourceName(feedUrl);
        console.log(`   ❌ ${sourceName}: ${error.message}`);
        return [];
      }
    });

    const results = await Promise.all(fetchPromises);
    const allArticles = results.flat();
    
    // Remove duplicates by link
    const uniqueArticles = this.removeDuplicates(allArticles);
    
    console.log(`📊 Total articles: ${allArticles.length} → ${uniqueArticles.length} unique`);
    return uniqueArticles;
  }

  /**
   * Categorize news articles into sections
   * @param {Array} articles - Array of normalized articles
   * @returns {Object} Categorized articles with counts
   */
  async categorizeNews(articles) {
    const categories = {
      injuries: [],
      roster: [],
      breaking: [],
      uncategorized: []
    };

    articles.forEach(article => {
      const text = `${article.title} ${article.contentSnippet}`.toLowerCase();
      
      if (this.matchesKeywords(text, this.injuryKeywords)) {
        categories.injuries.push(article);
      } else if (this.matchesKeywords(text, this.rosterKeywords)) {
        categories.roster.push(article);
      } else if (this.matchesKeywords(text, this.breakingKeywords)) {
        categories.breaking.push(article);
      } else {
        // Keep high-quality uncategorized articles as fallback
        categories.uncategorized.push(article);
      }
    });

    // If breaking news is limited (< 3 items), supplement with general news
    if (categories.breaking.length < 3 && categories.uncategorized.length > 0) {
      const fallbackNeeded = Math.min(3 - categories.breaking.length, categories.uncategorized.length);
      const fallbackItems = categories.uncategorized.slice(0, fallbackNeeded);
      categories.breaking.push(...fallbackItems);
      console.log(`📈 Breaking news supplemented with ${fallbackNeeded} general NFL articles`);
    }

    // Apply caps and calculate truncated counts
    const result = {};
    Object.keys(categories).forEach(category => {
      if (category === 'uncategorized') return; // Don't include in final result
      
      const items = categories[category];
      result[category] = {
        items: items.slice(0, 5),
        truncatedCount: Math.max(0, items.length - 5),
        totalCount: items.length
      };
    });

    console.log(`🏥 Injuries: ${result.injuries.totalCount} (showing ${result.injuries.items.length})`);
    console.log(`🔁 Roster: ${result.roster.totalCount} (showing ${result.roster.items.length})`);
    console.log(`📰 Breaking: ${result.breaking.totalCount} (showing ${result.breaking.items.length})`);

    return result;
  }

  /**
   * Check if article matches any keywords
   * @param {string} text - Text to search in
   * @param {Array} keywords - Keywords to match
   * @returns {boolean} True if matches
   */
  matchesKeywords(text, keywords) {
    return keywords.some(keyword => text.includes(keyword.toLowerCase()));
  }

  /**
   * Check if article is recent (last 24 hours)
   * @param {string} dateStr - ISO date string
   * @returns {boolean} True if recent
   */
  isRecent(dateStr) {
    return this.isWithinHours(dateStr, 24);
  }

  /**
   * Check if article is within specified hours (parameterized version)
   * @param {string} dateStr - ISO date string
   * @param {number} hours - Hours to look back (default 24)
   * @returns {boolean} True if within timeframe
   */
  isWithinHours(dateStr, hours = 24) {
    if (!dateStr) return false;
    
    try {
      const articleDate = moment(dateStr);
      const hoursAgo = moment().diff(articleDate, 'hours');
      
      // Additional filtering for breaking news quality
      if (hours > 24) {
        // For extended lookbacks, be more strict about content quality
        return hoursAgo <= hours && hoursAgo >= 0; // Must be valid future time
      }
      
      return hoursAgo <= hours && hoursAgo >= 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate breaking news content quality - filter out poor/stale content
   * @param {Object} item - RSS feed item
   * @param {number} lookbackHours - Current lookback period
   * @returns {boolean} True if valid content
   */
  isValidBreakingNewsContent(item, lookbackHours) {
    if (!item || !item.title) return false;
    
    const title = item.title.toLowerCase();
    const content = (item.contentSnippet || item.content || '').toLowerCase();
    const fullText = `${title} ${content}`;
    
    // Filter out poor quality content patterns
    const badPatterns = [
      /last updated/,
      /^updated:/,
      /^\s*-\s*last/,
      /unfortunately, he is out/,
      /sadly, he is out/,
      /he is out for now/,
      /he is out as well/,
      /he is currently out/,
      /source: espn\)$/,
      /\(source: [^)]+\)\s*$/,
      /^[^a-zA-Z]*\d+\./,  // Starts with numbers (list items)
      /^\s*new:/           // Starts with "NEW:"
    ];
    
    // Reject if matches bad patterns
    if (badPatterns.some(pattern => pattern.test(fullText))) {
      console.log(`   🗑️ Filtered low-quality content: ${title.substring(0, 50)}...`);
      return false;
    }
    
    // For extended lookbacks (>24h), be extra strict
    if (lookbackHours > 24) {
      // Must have substantial content
      if (title.length < 20) return false;
      
      // Must contain meaningful action words
      const meaningfulWords = ['signs', 'agrees', 'announces', 'injury', 'trade', 'release', 'suspend', 'return', 'contract'];
      if (!meaningfulWords.some(word => fullText.includes(word))) {
        console.log(`   🗑️ Filtered non-meaningful content: ${title.substring(0, 50)}...`);
        return false;
      }
    }
    
    return true;
  }

  /**
   * Remove duplicate articles by link
   * @param {Array} articles - Articles to deduplicate
   * @returns {Array} Unique articles
   */
  removeDuplicates(articles) {
    const seen = new Set();
    return articles.filter(article => {
      if (seen.has(article.link)) {
        return false;
      }
      seen.add(article.link);
      return true;
    });
  }

  /**
   * Extract source name from feed URL
   * @param {string} feedUrl - Feed URL
   * @returns {string} Source name
   */
  getSourceName(feedUrl) {
    if (feedUrl.includes('espn.com')) return 'ESPN';
    if (feedUrl.includes('nfl.com')) return 'NFL.com';
    if (feedUrl.includes('yahoo.com')) return 'Yahoo';
    if (feedUrl.includes('cbssports.com')) return 'CBS';
    if (feedUrl.includes('profootballtalk') || feedUrl.includes('nbcsports.com/profootballtalk')) return 'PFT';
    
    try {
      const url = new URL(feedUrl);
      return url.hostname.replace('www.', '');
    } catch {
      return 'Unknown';
    }
  }

  /**
   * Format article for Discord display
   * @param {Object} article - Article object
   * @returns {string} Formatted string
   */
  formatArticle(article) {
    const title = article.title.length > 80 ? 
      article.title.substring(0, 80) + '...' : 
      article.title;
    return `${title} (${article.source}) – ${article.link}`;
  }

  /**
   * Get sources line for footer
   * @returns {string} Sources string
   */
  getSourcesLine() {
    return '🗂 Sources: TheSportsDB • ESPN • NFL.com • Yahoo • CBS Sports • ProFootballTalk';
  }
}

module.exports = new RSSService();