const Parser = require('rss-parser');
const axios = require('axios');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const pLimit = require('p-limit');
const moment = require('moment-timezone');

/**
 * Full-text RSS service for extracting complete article content
 * Fetches full article text for fact extraction and categorization
 */
class RSSFullTextService {
  constructor() {
    this.parser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'NFL Discord Bot Article Reader'
      }
    });

    // Limit concurrent article fetches to prevent overwhelming servers
    this.fetchLimit = pLimit(parseInt(process.env.MAX_FETCH_CONCURRENCY) || 4);
    this.articleTimeout = parseInt(process.env.ARTICLE_TIMEOUT_MS) || 10000;

    // Default RSS feeds
    this.defaultFeeds = [
      'https://www.espn.com/espn/rss/nfl/news',
      'https://www.nfl.com/rss/rsslanding?searchString=home',
      'https://sports.yahoo.com/nfl/rss.xml',
      'https://www.cbssports.com/rss/headlines/nfl/',
      'https://profootballtalk.nbcsports.com/feed/',
      'https://www.profootballrumors.com/feed'
    ];

    this.feeds = process.env.RSS_FEEDS ? 
      process.env.RSS_FEEDS.split(',').map(f => f.trim()) : 
      this.defaultFeeds;

    console.log(`📰 Full-text RSS service initialized with ${this.feeds.length} feeds, concurrency limit: ${this.fetchLimit.activeCount}/${this.fetchLimit.pendingCount}`);
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
      /^\s*new:/,          // Starts with "NEW:"
      /february \d/,       // February dates (likely stale)
      /\d{4}-02-/,         // February ISO dates
      /january \d/,        // January dates (also stale)
      /december \d/,       // December dates (also stale)
      /march \d/,          // March dates (stale for August)
      /april \d/,          // April dates (stale for August)
      /may \d/,            // May dates (stale for August)  
      /june \d/,           // June dates (potentially stale)
      /february 9/,        // Explicit "February 9" filter
      /feb 9/,             // Explicit "Feb 9" filter
      /last updated february/,  // "Last updated February"
      /last updated feb/        // "Last updated Feb"
    ];
    
    // Reject if matches bad patterns
    const matchedPattern = badPatterns.find(pattern => pattern.test(fullText));
    if (matchedPattern) {
      console.log(`   🗑️ RSS FILTER ACTIVE: "${title.substring(0, 50)}..." matched pattern: ${matchedPattern}`);
      return false;
    }
    
    // For extended lookbacks (>24h), be extra strict
    if (lookbackHours > 24) {
      // Must have substantial content
      if (title.length < 20) return false;
      
      // Must contain meaningful action words
      const meaningfulWords = ['signs', 'agrees', 'announces', 'injury', 'trade', 'release', 'suspend', 'return', 'contract'];
      if (!meaningfulWords.some(word => fullText.includes(word))) {
        console.log(`   🗑️ Filtered non-meaningful RSS content: ${title.substring(0, 50)}...`);
        return false;
      }
    }
    
    return true;
  }

  /**
   * Fetch and process RSS feeds with full article content
   * @param {number} lookbackHours - How far back to look for articles
   * @returns {Promise<Array>} Array of articles with full text content
   */
  async fetchFeeds(lookbackHours = 24) {
    console.log(`📡 Fetching RSS feeds with full text (${lookbackHours}h lookback)...`);
    
    const cutoffTime = moment().subtract(lookbackHours, 'hours');
    
    const feedPromises = this.feeds.map(async (feedUrl) => {
      try {
        const feed = await this.parser.parseURL(feedUrl);
        const sourceName = this.deriveSourceShort(feedUrl);
        
        // Filter recent articles with quality filtering
        const recentItems = feed.items.filter(item => {
          const itemDate = moment(item.isoDate || item.pubDate);
          const isRecent = itemDate.isAfter(cutoffTime);
          
          if (!isRecent) return false;
          
          // Additional quality filtering for breaking news content
          return this.isValidBreakingNewsContent(item, lookbackHours);
        });
        
        console.log(`   📰 ${sourceName}: ${recentItems.length} recent items`);
        
        // Convert to normalized format
        const articles = recentItems.map(item => ({
          title: item.title || '',
          url: this.getCanonicalUrl(item.link || ''),
          date: item.isoDate || item.pubDate || new Date().toISOString(),
          summary: (item.contentSnippet || item.content || '').substring(0, 300),
          source: sourceName,
          feedUrl
        }));
        
        return articles;
        
      } catch (error) {
        const sourceName = this.deriveSourceShort(feedUrl);
        console.log(`   ❌ ${sourceName}: ${error.message}`);
        return [];
      }
    });
    
    const results = await Promise.all(feedPromises);
    const allArticles = results.flat();
    
    // Remove duplicates by URL
    const uniqueArticles = this.deduplicateByUrl(allArticles);
    
    console.log(`📊 Found ${allArticles.length} articles → ${uniqueArticles.length} unique`);
    
    // Fetch full text for each article (with concurrency limit)
    const articlesWithText = await this.fetchAllArticleTexts(uniqueArticles);
    
    console.log(`✅ Successfully extracted text from ${articlesWithText.length} articles`);
    return articlesWithText;
  }

  /**
   * Fetch full text content for multiple articles with concurrency control
   * @param {Array} articles - Articles to fetch text for
   * @returns {Promise<Array>} Articles with text content
   */
  async fetchAllArticleTexts(articles) {
    const fetchPromises = articles.map(article => 
      this.fetchLimit(() => this.fetchArticleWithText(article))
    );
    
    const results = await Promise.all(fetchPromises);
    return results.filter(article => article && article.text);
  }

  /**
   * Fetch full text content for a single article
   * @param {Object} article - Article object with url
   * @returns {Promise<Object|null>} Article with text content or null
   */
  async fetchArticleWithText(article) {
    try {
      console.log(`   🔍 Fetching: ${article.title.substring(0, 50)}...`);
      
      const response = await axios.get(article.url, {
        timeout: this.articleTimeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NFL Discord Bot/1.0)'
        },
        maxRedirects: 5
      });
      
      const dom = new JSDOM(response.data, { url: article.url });
      const document = dom.window.document;
      
      // Try to extract canonical URL from page
      const canonicalLink = document.querySelector('link[rel="canonical"]');
      const ogUrl = document.querySelector('meta[property="og:url"]');
      
      if (canonicalLink && canonicalLink.href) {
        article.canonicalUrl = canonicalLink.href;
      } else if (ogUrl && ogUrl.content) {
        article.canonicalUrl = ogUrl.content;
      } else {
        article.canonicalUrl = article.url;
      }
      
      // Extract article text using Readability
      const reader = new Readability(document);
      const readableContent = reader.parse();
      
      if (readableContent && readableContent.textContent) {
        // Clean the extracted text by removing bylines and boilerplate
        article.text = this.cleanText(readableContent.textContent.trim());
        article.textLength = article.text.length;
        
        // Also get the title from readability if better than RSS title
        if (readableContent.title && readableContent.title.length > article.title.length) {
          article.extractedTitle = readableContent.title;
        }
        
        console.log(`   ✅ ${article.source}: ${article.textLength} chars extracted`);
        return article;
      } else {
        console.log(`   ⚠️ ${article.source}: No readable content found`);
        return null;
      }
      
    } catch (error) {
      console.log(`   ❌ ${article.source}: ${error.message}`);
      return null;
    }
  }

  /**
   * Clean extracted text by removing author bylines and boilerplate content
   * @param {string} text - Raw extracted text
   * @returns {string} Cleaned text
   */
  cleanText(text) {
    if (!text) return '';
    
    // Remove common author byline patterns
    const authorPatterns = [
      /^By [A-Za-z\s]+,?\s*/m,  // "By John Smith"
      /^[A-Za-z\s]+ \| [A-Za-z\s]+ \|/m,  // "John Smith | ESPN |"
      /^[A-Z][a-z]+ [A-Z][a-z]+\s*\n/m,  // "John Smith\n"
      /\b[A-Za-z]+ [A-Za-z]+, [A-Z]{2,} Sports/g,  // "John Smith, ESPN Sports"
      /\b[A-Za-z]+ [A-Za-z]+ \| [A-Z\s]+/g,  // "John Smith | NFL WRITER"
    ];
    
    let cleanedText = text;
    
    authorPatterns.forEach(pattern => {
      cleanedText = cleanedText.replace(pattern, '');
    });
    
    // Remove common boilerplate patterns
    const boilerplatePatterns = [
      /Sign up for .+?newsletter/gi,
      /Subscribe to .+/gi,
      /Read more:/gi,
      /More: .+/gi,
      /Follow .+? on Twitter/gi,
      /Contact .+? at .+@.+/gi,
      /^\s*Advertisement\s*$/gmi,
      /^\s*ADVERTISEMENT\s*$/gmi,
      /Loading.../gi,
      /Click here to .+/gi,
      /Share this article/gi,
    ];
    
    boilerplatePatterns.forEach(pattern => {
      cleanedText = cleanedText.replace(pattern, '');
    });
    
    // Clean up extra whitespace and empty lines
    cleanedText = cleanedText
      .replace(/\n\s*\n\s*\n/g, '\n\n')  // Multiple empty lines → double line break
      .replace(/^\s+|\s+$/g, '')  // Trim start/end
      .replace(/[ \t]+/g, ' ');  // Multiple spaces → single space
    
    return cleanedText;
  }

  /**
   * Get canonical URL, handling common redirect patterns
   * @param {string} url - Original URL
   * @returns {string} Canonical URL
   */
  getCanonicalUrl(url) {
    if (!url) return '';
    
    try {
      const urlObj = new URL(url);
      
      // Remove common tracking parameters
      const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', '_r', 'ref'];
      paramsToRemove.forEach(param => {
        urlObj.searchParams.delete(param);
      });
      
      return urlObj.toString();
    } catch {
      return url;
    }
  }

  /**
   * Derive short source name from URL
   * @param {string} url - Feed URL
   * @returns {string} Short source name
   */
  deriveSourceShort(url) {
    if (url.includes('espn.com')) return 'ESPN';
    if (url.includes('nfl.com')) return 'NFL.com';
    if (url.includes('yahoo.com')) return 'Yahoo';
    if (url.includes('cbssports.com')) return 'CBS';
    if (url.includes('profootballtalk.nbcsports.com')) return 'PFT';
    if (url.includes('profootballrumors.com')) return 'PFR';
    if (url.includes('nbcsports.com')) return 'NBC';
    if (url.includes('bleacherreport.com')) return 'B/R';
    if (url.includes('si.com')) return 'SI';
    
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '').replace('.com', '').toUpperCase();
    } catch {
      return 'Unknown';
    }
  }

  /**
   * Remove duplicate articles by URL
   * @param {Array} articles - Articles to deduplicate
   * @returns {Array} Unique articles
   */
  deduplicateByUrl(articles) {
    const seen = new Set();
    return articles.filter(article => {
      const key = article.canonicalUrl || article.url;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Get service status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      feedCount: this.feeds.length,
      concurrencyLimit: this.fetchLimit.activeCount + '/' + this.fetchLimit.pendingCount,
      articleTimeout: this.articleTimeout,
      defaultFeeds: this.defaultFeeds.length
    };
  }
}

module.exports = new RSSFullTextService();