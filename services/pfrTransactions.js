const Parser = require('rss-parser');
const axios = require('axios');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');

const teamMappings = require('../config/nflTeamMappings');

/**
 * ProFootballRumors Transactions Service with exact formatting
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
   * Fetch recent transactions from ProFootballRumors with exact formatting
   * @param {number} lookbackHours - Hours to look back
   * @returns {Promise<Object>} Formatted transactions with pagination
   */
  async fetchTransactions(lookbackHours = 24) {
    try {
      console.log(`🔁 Fetching PFR transactions feed (${lookbackHours}h lookback)...`);
      
      const feed = await this.parser.parseURL(this.transactionsFeedUrl);
      const cutoffTime = new Date(Date.now() - (lookbackHours * 60 * 60 * 1000));
      
      // PRESEASON MODE: When GPT_FORCE_MODE is on, keep ALL items for content demonstration
      let recentItems;
      if (process.env.GPT_FORCE_MODE === 'true') {
        console.log(`   🎯 PRESEASON MODE: Keeping ALL ${feed.items.length} PFR transactions for GPT processing`);
        recentItems = feed.items.slice(0, 15); // Take first 15 for processing
      } else {
        // Filter recent items
        recentItems = feed.items.filter(item => {
          const itemDate = new Date(item.isoDate || item.pubDate || '');
          return itemDate > cutoffTime;
        });
      }
      
      console.log(`   📰 PFR: ${recentItems.length} recent transaction items`);
      
      // Process each transaction
      const transactions = [];
      
      for (const item of recentItems.slice(0, 15)) { // Limit to 15 items for performance
        try {
          const transaction = await this.processTransactionItem(item);
          if (transaction) {
            transactions.push(transaction);
          }
        } catch (error) {
          console.log(`   ❌ Error processing transaction: ${error.message}`);
        }
      }
      
      // Deduplicate by URL
      const uniqueTransactions = this.deduplicateTransactions(transactions);
      console.log(`   🔄 After deduplication: ${uniqueTransactions.length}`);
      
      // Format bullets with exact user requirements
      const formattedBullets = this.formatBulletsExact(uniqueTransactions);
      
      // Cap at 12 MAX and create pages
      const cappedBullets = formattedBullets.slice(0, 12);
      const pages = this.createPages(cappedBullets, 12); // All on one page for roster
      
      console.log(`✅ PFR transactions: ${uniqueTransactions.length} found → ${cappedBullets.length} formatted`);
      
      return {
        bullets: cappedBullets,
        totalCount: uniqueTransactions.length,
        pages: pages,
        source: 'PFR'
      };
      
    } catch (error) {
      console.log(`❌ PFR transactions fetch failed: ${error.message}`);
      return {
        bullets: [],
        totalCount: 0,
        pages: [],
        source: 'PFR (failed)'
      };
    }
  }

  /**
   * Process a single transaction item
   */
  async processTransactionItem(item) {
    const title = item.title || '';
    const url = this.getCanonicalUrl(item.link || item.url || '');
    
    if (this.seenUrls.has(url)) {
      return null; // Skip duplicates
    }
    this.seenUrls.add(url);
    
    // Extract basic info from title
    const player = this.extractPlayerName(title);
    const team = this.extractTeamName(title);
    const action = this.extractAction(title);
    
    if (!player || !team || !action) {
      return null; // Skip if missing required info
    }
    
    // Try to get additional details from article content
    let extra = undefined;
    try {
      const articleContent = await this.fetchArticleContent(url);
      extra = this.extractExtraDetails(articleContent, player, team, action);
    } catch (error) {
      // Continue without extra details if article fetch fails
    }
    
    return {
      title: title,
      url: url,
      date: item.isoDate || item.pubDate || '',
      team: team,
      player: player,
      action: action,
      extra: extra,
      bullet: '', // Will be formatted later
      source: 'PFR',
      category: 'roster'
    };
  }

  /**
   * Format bullets with exact user-specified format
   * bullet: `${TEAM} — ${Action} ${Player}${extra ? "; "+extra : ""} (PFR)`
   */
  formatBulletsExact(transactions) {
    return transactions.map(transaction => {
      // Normalize fields as specified
      const TEAM = transaction.team.toUpperCase();
      const Action = this.sentenceCase(transaction.action);
      const Player = this.titleCaseName(transaction.player);
      const extraText = transaction.extra ? `; ${transaction.extra}` : '';
      
      // Exact format as specified
      return `${TEAM} — ${Action} ${Player}${extraText} (PFR)`;
    }).filter(bullet => bullet.length > 0);
  }

  /**
   * Extract player name from title
   */
  extractPlayerName(title) {
    // First, exclude team names from being detected as player names
    const teamWords = /^(bills|chargers|browns|eagles|saints|dolphins|texans|titans|jets|chiefs|raiders|steelers|cowboys|packers|patriots|49ers|rams|seahawks|cardinals|panthers|falcons|bucs|jaguars|colts|bengals|lions|bears|vikings|commanders|giants)\s/i;
    
    // Enhanced patterns for better name extraction
    const namePatterns = [
      // Specific extraction from context (avoid team names)
      /(?:sign|signed|agrees?|traded?|claimed?|waived?|released?|activated?|placed?)\s+(?:free\s+agent\s+)?(?:rb|qb|wr|te|lb|de|dt|cb|s|ol|k|p)?\s*([A-Z][a-z]+\s+[A-Z][a-z]+)(?!\s+(?:lose|sign|place|agree))/i,
      
      // Comma-separated format: "Bills, James Cook Agree"
      /[a-zA-Z]+,\s+([A-Z][a-z]+\s+[A-Z][a-z]+)(?:\s+(?:Agree|sign|extend))/i,
      
      // Position-specific: "Eagles LG Landon Dickerson"  
      /[a-zA-Z]+\s+(?:RB|QB|LG|OL|WR|TE|DE|LB|CB|S|K|P)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
      
      // Age-based context: "33-Year-Old Veteran John Smith"
      /\d{2}-year-old\s+(?:veteran\s+)?([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
      
      // Contract context: "Player Name signs $X million deal"
      /^([A-Z][a-z]+\s+[A-Z][a-z]+)(?:\s+signs?\s+|\s+agrees?\s+to\s+|\s+gets?\s+)/i,
      
      // Standard names that don't start with team words
      /\b([A-Z][a-z]+\s+[A-Z][a-z]+)(?:\s+(?:Jr|Sr|III|IV))?\b/
    ];
    
    for (const pattern of namePatterns) {
      const match = title.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        
        // Validate it's not a team name or common word
        if (name.length > 2 && 
            !teamWords.test(name) &&
            !/^(player|veteran|free|agent|linebacker|running|back|wide|receiver|defensive|offensive)$/i.test(name.split(' ')[0]) &&
            !/^(contract|extension|injury|deal|million|dollar|year)$/i.test(name.split(' ')[1] || '')) {
          return name;
        }
      }
    }
    
    // Enhanced fallback: Try to extract from broader context
    const fallbackMatch = title.match(/([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,})/);
    if (fallbackMatch && !teamWords.test(fallbackMatch[1])) {
      return fallbackMatch[1];
    }
    
    // If no specific name found, return generic placeholder  
    return 'Player';
  }

  /**
   * Extract team name/abbreviation from title
   */
  extractTeamName(title) {
    // Look for team abbreviations or full names
    const teamPattern = /\b(Cardinals|Falcons|Ravens|Bills|Panthers|Bears|Bengals|Browns|Cowboys|Broncos|Lions|Packers|Texans|Colts|Jaguars|Chiefs|Dolphins|Vikings|Patriots|Saints|Giants|Jets|Eagles|Steelers|Chargers|49ers|Seahawks|Rams|Bucs|Titans|Commanders|Raiders|WAS|NYG|NYJ|NE|BUF|MIA|BAL|PIT|CIN|CLE|HOU|IND|JAX|TEN|DEN|KC|LV|LAC|LAR|SEA|SF|AZ|GB|MIN|CHI|DET|CAR|NO|ATL|TB|PHI|DAL)\b/i;
    
    const match = title.match(teamPattern);
    if (match) {
      const team = match[1];
      // Convert full names to abbreviations if needed
      const abbr = this.getTeamAbbreviation(team);
      return abbr || team;
    }
    
    return null;
  }

  /**
   * Extract action from title
   */
  extractAction(title) {
    const match = title.match(this.ROSTER_PATTERNS);
    if (match) {
      let action = match[1].toLowerCase();
      
      // Normalize common variations
      if (action.includes('sign')) {
        action = action.includes('re') ? 'Re-signed' : 'Signed';
      } else if (action.includes('waive')) {
        action = 'Waived';
      } else if (action.includes('release')) {
        action = 'Released';
      } else if (action.includes('trade')) {
        action = 'Traded';
      } else if (action.includes('claim')) {
        action = 'Claimed';
      } else if (action.includes('promote')) {
        action = 'Promoted';
      } else if (action.includes('elevate')) {
        action = 'Elevated';
      } else if (action.includes('activate')) {
        action = 'Activated';
      } else if (action.includes('ir')) {
        action = 'Placed on IR';
      } else if (action.includes('return')) {
        action = 'Designated to return';
      }
      
      return action;
    }
    
    return 'Roster move';
  }

  /**
   * Fetch article content for additional details
   */
  async fetchArticleContent(url) {
    const response = await axios.get(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NFL Discord Bot/1.0)'
      }
    });
    
    const dom = new JSDOM(response.data, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    
    return article?.textContent || '';
  }

  /**
   * Extract additional details from article content
   */
  extractExtraDetails(content, player, team, action) {
    if (!content) return undefined;
    
    // Look for contract details, conditions, etc.
    const detailPatterns = [
      /\$[\d,]+(?:\.\d+)?\s*(?:million|M)/i,
      /\d+[- ]year/i,
      /practice squad/i,
      /injured reserve/i,
      /futures contract/i,
      /conditional/i,
      /pending physical/i
    ];
    
    for (const pattern of detailPatterns) {
      const match = content.match(pattern);
      if (match) {
        return match[0];
      }
    }
    
    return undefined;
  }

  /**
   * Get team abbreviation from full name
   */
  getTeamAbbreviation(teamName) {
    const mapping = {
      'Cardinals': 'AZ', 'Falcons': 'ATL', 'Ravens': 'BAL', 'Bills': 'BUF',
      'Panthers': 'CAR', 'Bears': 'CHI', 'Bengals': 'CIN', 'Browns': 'CLE',
      'Cowboys': 'DAL', 'Broncos': 'DEN', 'Lions': 'DET', 'Packers': 'GB',
      'Texans': 'HOU', 'Colts': 'IND', 'Jaguars': 'JAX', 'Chiefs': 'KC',
      'Dolphins': 'MIA', 'Vikings': 'MIN', 'Patriots': 'NE', 'Saints': 'NO',
      'Giants': 'NYG', 'Jets': 'NYJ', 'Eagles': 'PHI', 'Steelers': 'PIT',
      'Chargers': 'LAC', '49ers': 'SF', 'Seahawks': 'SEA', 'Rams': 'LAR',
      'Bucs': 'TB', 'Titans': 'TEN', 'Commanders': 'WAS', 'Raiders': 'LV'
    };
    
    return mapping[teamName] || null;
  }

  /**
   * Create pages of transactions
   */
  createPages(bullets, pageSize) {
    const pages = [];
    
    for (let i = 0; i < bullets.length; i += pageSize) {
      pages.push(bullets.slice(i, i + pageSize));
    }
    
    return pages;
  }

  /**
   * Deduplicate transactions by URL
   */
  deduplicateTransactions(transactions) {
    const seen = new Set();
    return transactions.filter(transaction => {
      if (seen.has(transaction.url)) {
        return false;
      }
      seen.add(transaction.url);
      return true;
    });
  }

  /**
   * Get canonical URL (remove tracking params)
   */
  getCanonicalUrl(url) {
    if (!url) return '';
    
    try {
      const urlObj = new URL(url);
      // Remove tracking parameters
      const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign'];
      paramsToRemove.forEach(param => urlObj.searchParams.delete(param));
      return urlObj.toString();
    } catch (error) {
      return url;
    }
  }

  /**
   * Convert name to proper title case (John Doe Jr.)
   */
  titleCaseName(name) {
    if (!name) return '';
    
    return name.toLowerCase().replace(/\b\w+/g, (word) => {
      // Handle special cases like Jr., Sr., III
      if (['jr', 'sr', 'iii', 'iv'].includes(word.toLowerCase())) {
        return word.toUpperCase();
      }
      
      return word.charAt(0).toUpperCase() + word.slice(1);
    });
  }

  /**
   * Convert action to sentence case
   */
  sentenceCase(action) {
    if (!action) return '';
    
    return action.charAt(0).toUpperCase() + action.slice(1).toLowerCase();
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      transactionsFeedUrl: this.transactionsFeedUrl,
      seenUrls: this.seenUrls.size,
      source: 'PFR'
    };
  }
}

module.exports = new PFRTransactionsService();