const Parser = require('rss-parser');
const axios = require('axios');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const teamMappings = require('../config/nflTeamMappings');

/**
 * ProFootballRumors Transactions Service
 * Fetches and processes NFL roster transactions from PFR
 */
class PFRTransactionsService {
  constructor() {
    this.parser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'NFL Discord Bot Transaction Reader'
      }
    });

    this.transactionsFeedUrl = 'https://www.profootballrumors.com/category/transactions/feed';
    this.seenUrls = new Set();
    
    // Roster action patterns for extraction
    this.ROSTER_PATTERNS = /(sign(?:ed|s)?|re[- ]?sign(?:ed|s)?|waive(?:d|s)?|release(?:d|s)?|trade(?:d|s)?|acquire(?:d|s)?|promote(?:d|s)?|elevate(?:d|s)?|claim(?:ed|s)?|activate(?:d|s)?|place(?:d)? on ir|designate(?:d)? to return|agreement|one-year deal|two-year deal|extension)/i;
    
    console.log('📄 PFR Transactions service initialized');
  }

  /**
   * Fetch recent transactions from ProFootballRumors
   * @param {number} lookbackHours - Hours to look back
   * @returns {Promise<Array>} Array of transaction objects
   */
  async fetchTransactions(lookbackHours = 24) {
    try {
      console.log('🔁 Fetching PFR transactions feed...');
      
      const feed = await this.parser.parseURL(this.transactionsFeedUrl);
      const cutoffTime = new Date(Date.now() - (lookbackHours * 60 * 60 * 1000));
      
      // Filter recent items
      const recentItems = feed.items.filter(item => {
        const itemDate = new Date(item.isoDate || item.pubDate);
        return itemDate > cutoffTime;
      });
      
      console.log(`   📰 PFR: ${recentItems.length} recent transaction items`);
      
      // Process each item to extract transaction details
      const transactions = [];
      
      for (const item of recentItems.slice(0, 15)) { // Limit to prevent overwhelming
        try {
          const transaction = await this.processTransactionItem(item);
          if (transaction) {
            transactions.push(transaction);
          }
        } catch (error) {
          console.log(`   ❌ Error processing PFR item: ${error.message}`);
        }
      }
      
      // Deduplicate by canonical URL
      const uniqueTransactions = this.deduplicateTransactions(transactions);
      
      console.log(`✅ PFR transactions: ${transactions.length} processed → ${uniqueTransactions.length} unique`);
      
      return uniqueTransactions.slice(0, 12); // Cap to 12 most recent
      
    } catch (error) {
      console.log(`❌ PFR transactions fetch failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Process a single transaction RSS item
   * @param {Object} item - RSS item
   * @returns {Promise<Object|null>} Transaction object or null
   */
  async processTransactionItem(item) {
    const canonicalUrl = this.getCanonicalUrl(item.link);
    
    // Skip if already seen
    if (this.seenUrls.has(canonicalUrl)) {
      return null;
    }
    
    console.log(`   🔍 Processing: ${item.title?.substring(0, 60)}...`);
    
    // Extract basic info from title first
    const titleInfo = this.extractFromTitle(item.title);
    if (!titleInfo.hasRosterAction) {
      console.log(`   🗑️ No roster action in title: ${item.title}`);
      return null;
    }
    
    // Fetch full article for detailed extraction
    let fullText = null;
    try {
      const response = await axios.get(canonicalUrl, {
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NFL Discord Bot/1.0)'
        }
      });
      
      fullText = this.extractArticleText(response.data, canonicalUrl);
    } catch (error) {
      console.log(`   ⚠️ Could not fetch full article: ${error.message}`);
      // Fall back to title/summary only
    }
    
    // Build transaction object
    const transaction = this.buildTransaction(item, titleInfo, fullText, canonicalUrl);
    
    if (transaction) {
      this.seenUrls.add(canonicalUrl);
      return transaction;
    }
    
    return null;
  }

  /**
   * Extract roster action info from article title
   * @param {string} title - Article title
   * @returns {Object} Title analysis
   */
  extractFromTitle(title) {
    if (!title) return { hasRosterAction: false };
    
    const titleLower = title.toLowerCase();
    const hasRosterAction = this.ROSTER_PATTERNS.test(titleLower);
    
    // Extract team and player mentions
    let team = null;
    let player = null;
    
    // Common PFR title formats:
    // "Cowboys Sign RB Tony Pollard To Extension"
    // "Patriots Release WR Nelson Agholor"
    // "Ravens Claim LB Roquan Smith"
    
    // Extract team (usually first word that's a team name)
    const words = title.split(' ');
    for (let i = 0; i < Math.min(3, words.length); i++) {
      const teamAbbr = teamMappings.getTeamAbbr(words[i]);
      if (teamAbbr) {
        team = teamAbbr;
        break;
      }
    }
    
    // Extract player (look for name patterns after position)
    const nameMatch = title.match(/\b(?:QB|RB|WR|TE|K|DEF|OL|DL|LB|CB|S)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
    if (nameMatch) {
      player = nameMatch[1];
    }
    
    return {
      hasRosterAction,
      team,
      player,
      rawTitle: title
    };
  }

  /**
   * Extract article text using Readability
   * @param {string} html - Article HTML
   * @param {string} url - Article URL
   * @returns {string|null} Extracted text or null
   */
  extractArticleText(html, url) {
    try {
      const dom = new JSDOM(html, { url });
      const document = dom.window.document;
      
      // Remove ads and navigation
      const selectorsToRemove = [
        '.advertisement', '.ads', '.sidebar', '.nav', '.header', '.footer',
        '.related-posts', '.comments', '.social-share'
      ];
      
      selectorsToRemove.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => el.remove());
      });
      
      const reader = new Readability(document);
      const readableContent = reader.parse();
      
      if (readableContent?.textContent) {
        return this.cleanArticleText(readableContent.textContent);
      }
      
      return null;
    } catch (error) {
      console.log(`   ❌ Text extraction failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Clean extracted article text
   * @param {string} text - Raw text
   * @returns {string} Cleaned text
   */
  cleanArticleText(text) {
    if (!text) return '';
    
    return text
      // Remove author bylines
      .replace(/^By [A-Za-z\s]+,?\s*/m, '')
      .replace(/^[A-Za-z\s]+ \| [A-Za-z\s]+ \|/m, '')
      // Remove common boilerplate
      .replace(/Follow .+ on Twitter/gi, '')
      .replace(/Subscribe to .+/gi, '')
      .replace(/More: .+/gi, '')
      // Clean whitespace
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .replace(/^\s+|\s+$/g, '')
      .replace(/[ \t]+/g, ' ');
  }

  /**
   * Build transaction object from extracted data
   * @param {Object} item - RSS item
   * @param {Object} titleInfo - Extracted title info
   * @param {string} fullText - Full article text
   * @param {string} canonicalUrl - Canonical URL
   * @returns {Object|null} Transaction object or null
   */
  buildTransaction(item, titleInfo, fullText, canonicalUrl) {
    // Determine the roster action and build bullet
    const actionPhrase = this.extractActionPhrase(titleInfo.rawTitle, fullText);
    if (!actionPhrase) return null;
    
    const team = titleInfo.team || this.extractTeamFromText(fullText);
    const player = titleInfo.player || this.extractPlayerFromText(fullText);
    
    // Build the bullet in format: "TEAM — action PLAYER (details) (PFR)"
    let bullet = '';
    if (team && actionPhrase) {
      bullet = `${team} — ${actionPhrase}`;
    } else if (actionPhrase) {
      bullet = actionPhrase;
    } else {
      return null;
    }
    
    // Add PFR source
    bullet += ' (PFR)';
    
    // Format properly
    bullet = this.formatBullet(bullet);
    
    if (!bullet || bullet.length < 10) return null;
    
    return {
      title: item.title,
      url: canonicalUrl,
      date: item.isoDate || item.pubDate,
      team,
      player,
      actionPhrase,
      bullet,
      source: 'PFR',
      category: 'roster'
    };
  }

  /**
   * Extract action phrase from title/text
   * @param {string} title - Article title
   * @param {string} fullText - Full article text
   * @returns {string|null} Action phrase or null
   */
  extractActionPhrase(title, fullText) {
    // Try title first (usually contains the action)
    const titlePhrase = this.findActionPhrase(title);
    if (titlePhrase) return titlePhrase;
    
    // Try first few sentences of article
    if (fullText) {
      const sentences = fullText.split(/[.!?]+/).slice(0, 3);
      for (const sentence of sentences) {
        const phrase = this.findActionPhrase(sentence);
        if (phrase) return phrase;
      }
    }
    
    return null;
  }

  /**
   * Find action phrase in text
   * @param {string} text - Text to search
   * @returns {string|null} Action phrase or null
   */
  findActionPhrase(text) {
    if (!text) return null;
    
    const textLower = text.toLowerCase();
    
    // Common PFR patterns
    const patterns = [
      /\b(sign(?:ed)?|signed)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
      /\b(waive(?:d)?|waived)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
      /\b(release(?:d)?|released)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
      /\b(trade(?:d)?|traded)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
      /\b(claim(?:ed)?|claimed)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
      /\b(activate(?:d)?|activated)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
      /\b(place(?:d)?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+on\s+ir/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const action = match[1];
        const player = match[2];
        return `${action} ${player}`.toLowerCase();
      }
    }
    
    // Fallback: just return first sentence if it has roster keywords
    if (this.ROSTER_PATTERNS.test(textLower)) {
      const firstSentence = text.split(/[.!?]/)[0].trim();
      return firstSentence.length > 10 ? firstSentence : null;
    }
    
    return null;
  }

  /**
   * Extract team from text
   * @param {string} text - Text to search
   * @returns {string|null} Team abbreviation or null
   */
  extractTeamFromText(text) {
    if (!text) return null;
    
    const words = text.split(/\s+/).slice(0, 20); // Check first 20 words
    for (const word of words) {
      const teamAbbr = teamMappings.getTeamAbbr(word);
      if (teamAbbr) return teamAbbr;
    }
    
    return null;
  }

  /**
   * Extract player from text
   * @param {string} text - Text to search
   * @returns {string|null} Player name or null
   */
  extractPlayerFromText(text) {
    if (!text) return null;
    
    // Look for name patterns
    const namePattern = /\b([A-Z][a-z]+'?\s+[A-Z][a-z]+)\b/g;
    const matches = text.match(namePattern);
    
    if (matches && matches.length > 0) {
      // Return first name that's not a team name
      for (const match of matches) {
        if (!teamMappings.getTeamAbbr(match)) {
          return match;
        }
      }
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
    
    // Truncate if too long
    if (formatted.length > 320) {
      const truncated = formatted.substring(0, 317);
      const lastSpace = truncated.lastIndexOf(' ');
      formatted = (lastSpace > 250 ? truncated.substring(0, lastSpace) : truncated) + '...';
    }
    
    // Ensure it doesn't end mid-word
    if (!formatted.match(/[.!?)\]]$/)) {
      if (formatted.match(/\([A-Z]+\)$/)) {
        // Ends with source citation, that's fine
      } else {
        formatted += '.';
      }
    }
    
    return formatted;
  }

  /**
   * Deduplicate transactions by canonical URL
   * @param {Array} transactions - Array of transactions
   * @returns {Array} Unique transactions
   */
  deduplicateTransactions(transactions) {
    const seen = new Set();
    return transactions.filter(transaction => {
      const key = transaction.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Get canonical URL
   * @param {string} url - Original URL
   * @returns {string} Canonical URL
   */
  getCanonicalUrl(url) {
    if (!url) return '';
    
    try {
      const urlObj = new URL(url);
      // Remove tracking parameters
      const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign'];
      paramsToRemove.forEach(param => urlObj.searchParams.delete(param));
      return urlObj.toString();
    } catch {
      return url;
    }
  }

  /**
   * Get service status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      transactionsFeedUrl: this.transactionsFeedUrl,
      seenUrls: this.seenUrls.size,
      patterns: {
        roster: this.ROSTER_PATTERNS.toString()
      }
    };
  }
}

module.exports = new PFRTransactionsService();