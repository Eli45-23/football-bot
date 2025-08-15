/**
 * Text formatting utilities for NFL Discord Bot
 * Handles proper casing, truncation, and formatting for Discord messages
 */
class TextUtils {
  constructor() {
    // Common NFL abbreviations and special cases
    this.nflAbbreviations = new Set([
      'NFL', 'MVP', 'IR', 'PUP', 'DNP', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF',
      'LB', 'DB', 'CB', 'S', 'DE', 'DT', 'OL', 'OG', 'OT', 'C', 'FB',
      'ST', 'PR', 'KR', 'LS', 'P', 'AFC', 'NFC', 'TD', 'FG', 'PAT',
      'INT', 'SACK', 'TFL', 'PD', 'FF', 'FR', 'FUMBLE', 'YAC', 'QBR',
      'COMP', 'ATT', 'YDS', 'AVG', 'LNG', 'EPA', 'CPOE', 'DYAR', 'DVOA',
      'PFF', 'PFWA', 'AP', 'NFLPA', 'CBA', 'DUI', 'DWI', 'PED', 'COVID',
      'ACL', 'MCL', 'PCL', 'LCL', 'UCL', 'MRI', 'CT', 'NSAID'
    ]);

    // Team name mappings for proper casing
    this.teamNames = {
      'arizona cardinals': 'Arizona Cardinals',
      'atlanta falcons': 'Atlanta Falcons', 
      'baltimore ravens': 'Baltimore Ravens',
      'buffalo bills': 'Buffalo Bills',
      'carolina panthers': 'Carolina Panthers',
      'chicago bears': 'Chicago Bears',
      'cincinnati bengals': 'Cincinnati Bengals',
      'cleveland browns': 'Cleveland Browns',
      'dallas cowboys': 'Dallas Cowboys',
      'denver broncos': 'Denver Broncos',
      'detroit lions': 'Detroit Lions',
      'green bay packers': 'Green Bay Packers',
      'houston texans': 'Houston Texans',
      'indianapolis colts': 'Indianapolis Colts',
      'jacksonville jaguars': 'Jacksonville Jaguars',
      'kansas city chiefs': 'Kansas City Chiefs',
      'las vegas raiders': 'Las Vegas Raiders',
      'los angeles chargers': 'Los Angeles Chargers',
      'los angeles rams': 'Los Angeles Rams',
      'miami dolphins': 'Miami Dolphins',
      'minnesota vikings': 'Minnesota Vikings',
      'new england patriots': 'New England Patriots',
      'new orleans saints': 'New Orleans Saints',
      'new york giants': 'New York Giants',
      'new york jets': 'New York Jets',
      'philadelphia eagles': 'Philadelphia Eagles',
      'pittsburgh steelers': 'Pittsburgh Steelers',
      'san francisco 49ers': 'San Francisco 49ers',
      'seattle seahawks': 'Seattle Seahawks',
      'tampa bay buccaneers': 'Tampa Bay Buccaneers',
      'tennessee titans': 'Tennessee Titans',
      'washington commanders': 'Washington Commanders'
    };

    // Common injury types for proper formatting
    this.injuryTypes = new Set([
      'hamstring', 'ankle', 'knee', 'concussion', 'groin', 'back', 'wrist',
      'shoulder', 'hip', 'elbow', 'finger', 'toe', 'calf', 'quad', 'neck',
      'ribs', 'chest', 'abdomen', 'achilles', 'plantar fasciitis'
    ]);

    console.log('📝 TextUtils initialized for NFL content formatting');
  }

  /**
   * Apply proper case to NFL-related text
   * @param {string} text - Input text
   * @returns {string} Properly cased text
   */
  toProperCase(text) {
    if (!text || typeof text !== 'string') return text;

    return text
      .toLowerCase()
      .split(' ')
      .map(word => {
        // Handle common abbreviations
        const upperWord = word.toUpperCase();
        if (this.nflAbbreviations.has(upperWord)) {
          return upperWord;
        }

        // Handle Roman numerals (e.g., III, Jr., Sr.)
        if (/^(i{1,3}|iv|v|vi{1,3}|ix|x|jr\.?|sr\.?)$/i.test(word)) {
          return word.toUpperCase();
        }

        // Handle contractions and possessives
        if (word.includes("'")) {
          return word.split("'").map((part, idx) => 
            idx === 0 ? this.capitalizeFirst(part) : part.toLowerCase()
          ).join("'");
        }

        // Handle hyphenated words
        if (word.includes('-')) {
          return word.split('-').map(part => this.capitalizeFirst(part)).join('-');
        }

        // Standard capitalization
        return this.capitalizeFirst(word);
      })
      .join(' ');
  }

  /**
   * Capitalize first letter of word
   * @param {string} word - Input word
   * @returns {string} Capitalized word
   */
  capitalizeFirst(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  /**
   * Format team name with proper casing
   * @param {string} teamName - Team name input
   * @returns {string} Properly formatted team name
   */
  formatTeamName(teamName) {
    if (!teamName) return teamName;
    
    const lowercase = teamName.toLowerCase().trim();
    return this.teamNames[lowercase] || this.toProperCase(teamName);
  }

  /**
   * Format player name with proper casing
   * @param {string} playerName - Player name input
   * @returns {string} Properly formatted player name
   */
  formatPlayerName(playerName) {
    if (!playerName) return playerName;

    // Handle special prefixes
    let formatted = playerName.trim();
    
    // Handle "Jr.", "Sr.", "III", etc.
    formatted = formatted.replace(/\b(jr|sr|iii?|iv)\b\.?/gi, (match) => {
      return match.toUpperCase().replace(/([IVX]+)/, (roman) => roman.toUpperCase());
    });

    return this.toProperCase(formatted);
  }

  /**
   * Truncate text at word boundary with ellipsis
   * @param {string} text - Input text
   * @param {number} maxLength - Maximum length
   * @param {string} suffix - Suffix to add (default: '...')
   * @returns {string} Truncated text
   */
  truncateAtWord(text, maxLength, suffix = '...') {
    if (!text || text.length <= maxLength) return text;

    // Find last space within limit
    const truncated = text.substring(0, maxLength - suffix.length);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > 0) {
      return truncated.substring(0, lastSpace) + suffix;
    }
    
    // No spaces found, hard truncate
    return truncated + suffix;
  }

  /**
   * Truncate text at sentence boundary
   * @param {string} text - Input text
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated text
   */
  truncateAtSentence(text, maxLength) {
    if (!text || text.length <= maxLength) return text;

    const sentences = text.split(/(?<=[.!?])\s+/);
    let result = '';
    
    for (const sentence of sentences) {
      const withSentence = result + (result ? ' ' : '') + sentence;
      if (withSentence.length <= maxLength) {
        result = withSentence;
      } else {
        break;
      }
    }
    
    return result || this.truncateAtWord(text, maxLength);
  }

  /**
   * Clean up common text artifacts from RSS feeds and web scraping
   * @param {string} text - Input text
   * @returns {string} Cleaned text
   */
  cleanRSSText(text) {
    if (!text) return text;

    return text
      // Remove common byline patterns
      .replace(/^(By\s+[^\n]+|Staff\s+Report|Associated\s+Press|Reuters)[\n\r]*/i, '')
      // Remove advertisement markers
      .replace(/(Advertisement|ADVERTISEMENT)[\s\S]*?(?=\n\n|$)/gi, '')
      // Remove social media handles and hashtags
      .replace(/@\w+|#\w+/g, '')
      // Remove URLs
      .replace(/https?:\/\/\S+/g, '')
      // Clean up excess whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Format injury status with proper terminology
   * @param {string} status - Raw injury status
   * @returns {string} Formatted injury status
   */
  formatInjuryStatus(status) {
    if (!status) return status;

    // Common injury status mappings
    const statusMap = {
      'out': 'OUT',
      'questionable': 'Questionable',
      'doubtful': 'Doubtful',
      'probable': 'Probable',
      'limited': 'Limited',
      'full': 'Full Practice',
      'dnp': 'Did Not Practice',
      'fp': 'Full Practice',
      'lp': 'Limited Practice',
      'ir': 'Injured Reserve',
      'pup': 'PUP List',
      'covid': 'COVID-19 List',
      'reserve/covid-19': 'COVID-19 List'
    };

    const lowercase = status.toLowerCase().trim();
    return statusMap[lowercase] || this.toProperCase(status);
  }

  /**
   * Format roster transaction type
   * @param {string} transaction - Transaction type
   * @returns {string} Formatted transaction
   */
  formatTransaction(transaction) {
    if (!transaction) return transaction;

    const transactionMap = {
      'signed': 'signed',
      'released': 'released',
      'waived': 'waived',
      'claimed': 'claimed',
      'traded': 'traded',
      'activated': 'activated',
      'placed on ir': 'placed on IR',
      'promoted': 'promoted to active roster',
      'elevated': 'elevated from practice squad',
      'signed to practice squad': 'signed to practice squad',
      're-signed': 're-signed'
    };

    const lowercase = transaction.toLowerCase().trim();
    return transactionMap[lowercase] || transaction;
  }

  /**
   * Generate counter text for pagination
   * @param {number} showing - Number of items showing
   * @param {number} total - Total number of items
   * @param {string} itemType - Type of items (e.g., 'injuries', 'moves')
   * @returns {string} Counter text
   */
  generateCounter(showing, total, itemType = 'items') {
    if (total <= showing) {
      return `(${total} ${itemType})`;
    }
    return `(${showing} of ${total} ${itemType})`;
  }

  /**
   * Create bullet point with consistent formatting
   * @param {string} content - Bullet content
   * @param {string} emoji - Optional emoji prefix
   * @returns {string} Formatted bullet point
   */
  createBullet(content, emoji = '') {
    const prefix = emoji ? `${emoji} ` : '• ';
    return `${prefix}${content}`;
  }

  /**
   * Format time duration (e.g., "2h 30m", "45s")
   * @param {number} ms - Milliseconds
   * @returns {string} Formatted duration
   */
  formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes < 60) {
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  /**
   * Pluralize word based on count
   * @param {number} count - Count
   * @param {string} singular - Singular form
   * @param {string} plural - Plural form (optional, adds 's' by default)
   * @returns {string} Pluralized word
   */
  pluralize(count, singular, plural = null) {
    if (count === 1) return singular;
    return plural || (singular + 's');
  }

  /**
   * Get diagnostic info for text formatting
   * @returns {Object} Text formatting diagnostics
   */
  getDiagnostics() {
    return {
      abbreviationsCount: this.nflAbbreviations.size,
      teamNamesCount: Object.keys(this.teamNames).length,
      injuryTypesCount: this.injuryTypes.size,
      sampleAbbreviations: Array.from(this.nflAbbreviations).slice(0, 10),
      sampleTeams: Object.keys(this.teamNames).slice(0, 5),
      enabledFeatures: {
        properCase: process.env.ROSTER_PROPER_CASE !== 'false',
        cleanRSS: true,
        injuryFormatting: true,
        teamFormatting: true
      }
    };
  }
}

// Export singleton instance
module.exports = new TextUtils();