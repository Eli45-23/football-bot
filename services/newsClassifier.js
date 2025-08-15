const config = require('../config/config');
const teamMappings = require('../config/nflTeamMappings');

/**
 * News classification and fact extraction service with strict category sourcing
 * GOALS: Clean 1-2 sentence bullets, strict source-based categorization
 */
class NewsClassifierService {
  constructor() {
    // Strict patterns for enhanced matching - FIXED: Removed overlap between injury and roster
    this.INJURY_PATTERNS = /(injur(?:y|ed)|carted off|out for season|out indefinitely|questionable|doubtful|inactive(?:s)?|ruled out|limited practice|did not practice|concussion|hamstring|ankle|knee|groin|back|shoulder|wrist|foot|pup|physically unable)/i;
    
    // Injury-specific activation (separate from general roster activation)
    this.INJURY_IR_PATTERNS = /(placed on ir|activated from ir|designated to return from ir)/i;
    
    this.ROSTER_PATTERNS = /(sign(?:ed|s)?|re[- ]?sign(?:ed|s)?|waive(?:d|s)?|release(?:d|s)?|trade(?:d|s)?|acquire(?:d|s)?|promote(?:d|s)?|elevate(?:d|s)?|claim(?:ed|s)?|activate(?:d|s)?\s+(?!from ir)|agreement|one-year deal|two-year deal|extension)/i;
    
    this.BREAKING_PATTERNS = /(breaking|official|announced|press release|per source|sources|expected to|agrees to|agreed to|returns|sidelined|ruled)/i;

    // STRICT exclusion patterns (must block these)
    this.EXCLUDE_HINTS = /(takeaways|observations|debut|first impression|film review|camp notebook|preseason notes|went \d+-for-\d+|stat line|highlights)/i;

    // Allowed sources by category
    this.INJURY_SOURCES = ['espn.com', 'nfl.com', 'yahoo.com', 'profootballtalk.nbcsports.com'];
    this.ROSTER_SOURCES = ['profootballrumors.com', ...teamMappings.officialTeamDomains];
    this.BREAKING_SOURCES = ['espn.com', 'nfl.com', 'yahoo.com', 'cbssports.com', 'profootballtalk.nbcsports.com', 'profootballrumors.com'];

    // Load NFL teams for entity extraction
    this.nflTeams = this.loadNFLTeams();
    
    console.log(`🔍 News classifier initialized with strict patterns and source routing`);
  }

  /**
   * Load NFL team names and abbreviations
   * @returns {Array} Array of team names and abbreviations
   */
  loadNFLTeams() {
    // Try to load from existing config
    if (config.nflTeams) {
      const teams = config.nflTeams.slice();
      
      // Add common abbreviations and variations
      const teamAbbreviations = [
        'Bills', 'Dolphins', 'Patriots', 'Jets', 'Ravens', 'Bengals', 'Browns', 'Steelers',
        'Texans', 'Colts', 'Jaguars', 'Titans', 'Broncos', 'Chiefs', 'Raiders', 'Chargers',
        'Cowboys', 'Giants', 'Eagles', 'Commanders', 'Bears', 'Lions', 'Packers', 'Vikings',
        'Falcons', 'Panthers', 'Saints', 'Buccaneers', 'Cardinals', 'Rams', '49ers', 'Seahawks',
        'LAR', 'LAC', 'LV', 'TB', 'SF', 'NE', 'NO', 'KC', 'GB'
      ];
      
      return [...teams, ...teamAbbreviations];
    }
    
    // Fallback team list
    return [
      'Buffalo Bills', 'Miami Dolphins', 'New England Patriots', 'New York Jets',
      'Baltimore Ravens', 'Cincinnati Bengals', 'Cleveland Browns', 'Pittsburgh Steelers',
      'Houston Texans', 'Indianapolis Colts', 'Jacksonville Jaguars', 'Tennessee Titans',
      'Denver Broncos', 'Kansas City Chiefs', 'Las Vegas Raiders', 'Los Angeles Chargers',
      'Dallas Cowboys', 'New York Giants', 'Philadelphia Eagles', 'Washington Commanders',
      'Chicago Bears', 'Detroit Lions', 'Green Bay Packers', 'Minnesota Vikings',
      'Atlanta Falcons', 'Carolina Panthers', 'New Orleans Saints', 'Tampa Bay Buccaneers',
      'Arizona Cardinals', 'Los Angeles Rams', 'San Francisco 49ers', 'Seattle Seahawks'
    ];
  }

  /**
   * Classify and extract facts from an article with STRICT category sourcing
   * @param {Object} article - Article with title and text content
   * @returns {Object|null} Classified article with extracted facts or null if filtered out
   */
  classify(article) {
    const text = `${article.title} ${article.text || article.summary}`;
    const textLower = text.toLowerCase();
    
    // PRESEASON MODE: Be much more inclusive when GPT_FORCE_MODE is on
    if (process.env.GPT_FORCE_MODE === 'true') {
      // Accept ANY NFL-related content for demonstration
      if (textLower.includes('nfl') || textLower.includes('football') || textLower.includes('preseason') || 
          textLower.includes('training camp') || textLower.includes('quarterback') || textLower.includes('touchdown') ||
          textLower.includes('cowboys') || textLower.includes('patriots') || textLower.includes('chiefs')) {
        console.log(`   🎯 PRESEASON MODE: Accepting NFL content: ${article.title.substring(0, 60)}...`);
        return {
          category: 'breaking',
          confidence: 0.9,
          source: article.url || 'RSS',
          reason: 'PRESEASON_MODE'
        };
      }
    }
    
    // STRICT exclusion first (must block) - only in non-force mode
    if (process.env.GPT_FORCE_MODE !== 'true' && this.EXCLUDE_HINTS.test(textLower)) {
      console.log(`   🗑️ Blocked by strict exclusion: ${article.title.substring(0, 60)}...`);
      return null;
    }
    
    // Check source domain for category eligibility
    const sourceDomain = this.getSourceDomain(article.url || article.feedUrl);
    
    // Test patterns and source eligibility - FIXED: Use combined injury patterns
    const hasInjuryPattern = this.INJURY_PATTERNS.test(textLower) || this.INJURY_IR_PATTERNS.test(textLower);
    const hasRosterPattern = this.ROSTER_PATTERNS.test(textLower);
    const hasBreakingPattern = this.BREAKING_PATTERNS.test(textLower);
    
    const isInjurySource = this.INJURY_SOURCES.some(source => sourceDomain.includes(source));
    const isRosterSource = this.ROSTER_SOURCES.some(source => sourceDomain.includes(source));
    const isBreakingSource = this.BREAKING_SOURCES.some(source => sourceDomain.includes(source));
    
    // STRICT category rules with source validation
    let category = null;
    let factBullet = null;
    
    // Injuries: ESPN table + injury-marked news from allowed sources (prioritize IR patterns)
    if (hasInjuryPattern && isInjurySource) {
      category = 'injury';
      const injuryPattern = this.INJURY_IR_PATTERNS.test(textLower) ? this.INJURY_IR_PATTERNS : this.INJURY_PATTERNS;
      factBullet = this.extractCleanFact(article, injuryPattern, 'injury');
    }
    // Roster: PFR transactions + official team domains only  
    else if (hasRosterPattern && isRosterSource) {
      // REJECT Yahoo/CBS feature pieces even if they have roster keywords
      if (sourceDomain.includes('yahoo.com') || sourceDomain.includes('cbssports.com')) {
        console.log(`   🗑️ Rejected feature piece from ${sourceDomain}: ${article.title.substring(0, 60)}...`);
        return null;
      }
      category = 'roster';
      factBullet = this.extractCleanFact(article, this.ROSTER_PATTERNS, 'roster');
    }
    // Breaking: major announcements not captured above
    else if (hasBreakingPattern && isBreakingSource && !hasInjuryPattern && !hasRosterPattern) {
      category = 'breaking';  
      factBullet = this.extractCleanFact(article, this.BREAKING_PATTERNS, 'breaking');
    }
    
    if (!category || !factBullet) {
      console.log(`   ❓ No valid category/fact: ${article.title.substring(0, 60)}...`);
      return null;
    }
    
    // Validate bullet quality
    if (!this.validateBulletQuality(factBullet)) {
      console.log(`   🗑️ Poor bullet quality: ${factBullet.substring(0, 50)}...`);
      return null;
    }
    
    return {
      ...article,
      category,
      factBullet,
      sourceDomain
    };
  }

  /**
   * Extract injury-related fact from article
   * @param {Object} article - Article object
   * @returns {string|null} Formatted injury fact bullet
   */
  extractInjuryFact(article) {
    const fullText = `${article.title} ${article.text || article.summary}`;
    
    // Find player name
    const player = this.extractPlayerName(fullText);
    const team = this.extractTeamName(fullText);
    
    // Find injury-related status phrase
    const injuryStatus = this.extractStatusPhrase(fullText, this.INJURY_KEYWORDS);
    
    if (!injuryStatus) {
      return null;
    }
    
    // Build fact bullet
    let bullet = '';
    if (player && team) {
      bullet = `${player} (${team}) – ${injuryStatus}`;
    } else if (player) {
      bullet = `${player} – ${injuryStatus}`;
    } else if (team) {
      bullet = `${team} – ${injuryStatus}`;
    } else {
      bullet = injuryStatus;
    }
    
    // Add source and format as complete sentence
    bullet = `${bullet} (${article.source})`;
    return this.formatBullet(bullet, 280);
  }

  /**
   * Extract roster transaction fact from article
   * @param {Object} article - Article object  
   * @returns {string|null} Formatted roster fact bullet
   */
  extractRosterFact(article) {
    const fullText = `${article.title} ${article.text || article.summary}`;
    
    const player = this.extractPlayerName(fullText);
    const team = this.extractTeamName(fullText);
    const rosterStatus = this.extractStatusPhrase(fullText, this.ROSTER_KEYWORDS);
    
    if (!rosterStatus) {
      return null;
    }
    
    let bullet = '';
    if (player && team) {
      bullet = `${player} (${team}) – ${rosterStatus}`;
    } else if (team) {
      bullet = `${team} – ${rosterStatus}`;
    } else {
      bullet = rosterStatus;
    }
    
    bullet = `${bullet} (${article.source})`;
    return this.formatBullet(bullet, 280);
  }

  /**
   * Extract breaking news fact from article
   * @param {Object} article - Article object
   * @returns {string|null} Formatted breaking news fact bullet  
   */
  extractBreakingFact(article) {
    const fullText = `${article.title} ${article.text || article.summary}`;
    
    const player = this.extractPlayerName(fullText);
    const team = this.extractTeamName(fullText);
    const newsStatus = this.extractStatusPhrase(fullText, this.BREAKING_KEYWORDS);
    
    if (!newsStatus) {
      // Fall back to using the article title if no specific status found
      const cleanTitle = article.title.replace(/^\w+:\s*/, ''); // Remove "NFL:" etc prefixes
      return `${cleanTitle} (${article.source})`.length > 120 ? 
        `${cleanTitle.substring(0, 110)}... (${article.source})` : 
        `${cleanTitle} (${article.source})`;
    }
    
    let bullet = '';
    if (player && team) {
      bullet = `${player} (${team}) – ${newsStatus}`;
    } else if (team) {
      bullet = `${team} – ${newsStatus}`;
    } else {
      bullet = newsStatus;
    }
    
    bullet = `${bullet} (${article.source})`;
    return this.formatBullet(bullet, 280);
  }

  /**
   * Extract likely player name from text
   * @param {string} text - Full text to search
   * @returns {string|null} Player name or null
   */
  extractPlayerName(text) {
    // Look for capitalized name patterns (First Last, First Middle Last)
    const namePatterns = [
      /\b([A-Z][a-z]+'?\s+[A-Z][a-z]+'?\s+[A-Z][a-z]+)\b/g, // First Middle Last
      /\b([A-Z][a-z]+'?\s+[A-Z][a-z]+)\b/g, // First Last
      /\b([A-Z]\.\s*[A-Z][a-z]+)\b/g // J. Smith pattern
    ];
    
    for (const pattern of namePatterns) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        // Return the first name found, clean it up
        const name = matches[0].trim();
        
        // Skip common false positives
        const skipWords = ['New York', 'New England', 'New Orleans', 'Las Vegas', 'Los Angeles', 
                          'San Francisco', 'Green Bay', 'Kansas City', 'Tampa Bay'];
        if (skipWords.some(skip => name.includes(skip))) {
          continue;
        }
        
        return name;
      }
    }
    
    return null;
  }

  /**
   * Extract team name from text
   * @param {string} text - Full text to search
   * @returns {string|null} Team name or null
   */
  extractTeamName(text) {
    // Look for team mentions
    for (const team of this.nflTeams) {
      const teamLower = team.toLowerCase();
      if (text.toLowerCase().includes(teamLower)) {
        // Return a short version for common teams
        const shortNames = {
          'buffalo bills': 'BUF',
          'miami dolphins': 'MIA', 
          'new england patriots': 'NE',
          'new york jets': 'NYJ',
          'baltimore ravens': 'BAL',
          'cincinnati bengals': 'CIN',
          'cleveland browns': 'CLE',
          'pittsburgh steelers': 'PIT',
          'houston texans': 'HOU',
          'indianapolis colts': 'IND',
          'jacksonville jaguars': 'JAX',
          'tennessee titans': 'TEN',
          'denver broncos': 'DEN',
          'kansas city chiefs': 'KC',
          'las vegas raiders': 'LV',
          'los angeles chargers': 'LAC',
          'dallas cowboys': 'DAL',
          'new york giants': 'NYG',
          'philadelphia eagles': 'PHI',
          'washington commanders': 'WAS',
          'chicago bears': 'CHI',
          'detroit lions': 'DET',
          'green bay packers': 'GB',
          'minnesota vikings': 'MIN',
          'atlanta falcons': 'ATL',
          'carolina panthers': 'CAR',
          'new orleans saints': 'NO',
          'tampa bay buccaneers': 'TB',
          'arizona cardinals': 'ARI',
          'los angeles rams': 'LAR',
          'san francisco 49ers': 'SF',
          'seattle seahawks': 'SEA'
        };
        
        return shortNames[teamLower] || team;
      }
    }
    
    return null;
  }

  /**
   * Extract status phrase around keywords
   * @param {string} text - Full text to search
   * @param {Array} keywords - Keywords to search around
   * @returns {string|null} Status phrase or null
   */
  extractStatusPhrase(text, keywords) {
    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase();
      const textLower = text.toLowerCase();
      const keywordIndex = textLower.indexOf(keywordLower);
      
      if (keywordIndex !== -1) {
        // Extract ±80 characters around the keyword
        const start = Math.max(0, keywordIndex - 80);
        const end = Math.min(text.length, keywordIndex + keywordLower.length + 80);
        const phrase = text.substring(start, end).trim();
        
        // Clean up the phrase
        const cleanedPhrase = phrase
          .replace(/^[^A-Za-z]*/, '') // Remove leading non-letters
          .replace(/[^A-Za-z0-9\s.,!?-]*$/, '') // Remove trailing non-letters
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim();
        
        if (cleanedPhrase.length > 10) {
          // Try to find a complete sentence or phrase, avoiding abbreviation splits
          const completeSentence = this.extractCompleteSentence(cleanedPhrase, keywordLower);
          
          if (completeSentence && completeSentence.length > 5) {
            return completeSentence;
          }
          
          return cleanedPhrase.length > 120 ? 
            cleanedPhrase.substring(0, 120) + '...' : 
            cleanedPhrase;
        }
      }
    }
    
    return null;
  }

  /**
   * Format bullet point as complete sentence with proper length and punctuation
   * @param {string} bullet - Raw bullet text
   * @param {number} maxLength - Maximum length (default 280)
   * @returns {string} Formatted bullet
   */
  formatBullet(bullet, maxLength = 280) {
    if (!bullet) return '';
    
    let formatted = bullet.trim();
    
    // If too long, truncate at word boundary
    if (formatted.length > maxLength) {
      const truncated = formatted.substring(0, maxLength - 3);
      const lastSpace = truncated.lastIndexOf(' ');
      if (lastSpace > maxLength * 0.8) {
        formatted = truncated.substring(0, lastSpace) + '...';
      } else {
        formatted = truncated + '...';
      }
    }
    
    // Ensure proper capitalization
    if (formatted.length > 0) {
      formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }
    
    // Ensure proper ending punctuation (if not already there)
    if (formatted && !formatted.match(/[.!?)\]]$/)) {
      // Check if it ends with a source citation pattern
      if (formatted.match(/\([A-Z]+\)$/)) {
        // It ends with source citation, that's fine
      } else {
        formatted += '.';
      }
    }
    
    return formatted;
  }

  /**
   * Check if text contains any keywords using improved regex matching
   * @param {string} text - Text to search in (lowercase)
   * @param {Array} keywords - Array of keywords to search for
   * @returns {boolean} True if any keyword matches
   */
  hasKeywordMatch(text, keywords) {
    return keywords.some(keyword => {
      // Handle multi-word keywords
      if (keyword.includes(' ')) {
        return text.includes(keyword.toLowerCase());
      }
      
      // Single word - use word boundary regex for better accuracy
      const pattern = new RegExp(`\\b${keyword.toLowerCase()}\\w*\\b`, 'i');
      return pattern.test(text);
    });
  }

  /**
   * Extract a complete sentence containing the keyword, avoiding abbreviation splits
   * @param {string} text - Text to search in
   * @param {string} keyword - Keyword that must be included
   * @returns {string|null} Complete sentence or null
   */
  extractCompleteSentence(text, keyword) {
    // Common abbreviations that shouldn't trigger sentence breaks
    const abbreviations = [
      'Jr.', 'Sr.', 'Dr.', 'Mr.', 'Mrs.', 'Ms.', 'Prof.',
      'vs.', 'No.', 'Vol.', 'etc.', 'i.e.', 'e.g.',
      'U.S.', 'N.F.L.', 'ESPN.com', 'NFL.com'
    ];
    
    // Replace abbreviations with placeholders to avoid incorrect splits
    let processedText = text;
    const placeholders = {};
    abbreviations.forEach((abbr, index) => {
      const placeholder = `__ABBR${index}__`;
      if (processedText.includes(abbr)) {
        placeholders[placeholder] = abbr;
        processedText = processedText.replace(new RegExp(abbr.replace('.', '\\.'), 'g'), placeholder);
      }
    });
    
    // Split on sentence-ending punctuation followed by space and capital letter
    const sentences = processedText.split(/[.!?]+\s+(?=[A-Z])/);
    
    // Find the sentence containing the keyword
    const keywordSentence = sentences.find(sentence => 
      sentence.toLowerCase().includes(keyword.toLowerCase())
    );
    
    if (keywordSentence) {
      // Restore abbreviations
      let restoredSentence = keywordSentence;
      Object.entries(placeholders).forEach(([placeholder, original]) => {
        restoredSentence = restoredSentence.replace(new RegExp(placeholder, 'g'), original);
      });
      
      // Clean up and ensure it ends properly
      restoredSentence = restoredSentence.trim();
      if (restoredSentence && !restoredSentence.match(/[.!?]$/)) {
        // If it doesn't end with punctuation, try to find natural ending
        const words = restoredSentence.split(' ');
        if (words.length > 8) {
          // Truncate to reasonable length and add punctuation if needed
          restoredSentence = words.slice(0, 15).join(' ');
          if (!restoredSentence.match(/[.!?]$/)) {
            restoredSentence += '.';
          }
        }
      }
      
      return restoredSentence;
    }
    
    return null;
  }

  /**
   * Get source domain from article
   * @param {string} url - Article URL
   * @returns {string} Domain name
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
   * Extract clean fact using new 1-2 sentence approach
   * @param {Object} article - Article object
   * @param {RegExp} pattern - Pattern to match
   * @param {string} category - Category type
   * @returns {string|null} Clean fact bullet or null
   */
  extractCleanFact(article, pattern, category) {
    const fullText = `${article.title} ${article.text || article.summary}`;
    
    // Find the key sentence containing the pattern
    const sentences = this.splitIntoSentences(fullText);
    const keySentence = this.findPatternSentence(sentences, pattern);
    
    if (!keySentence) return null;
    
    // Extract entities
    const player = this.extractPlayerName(keySentence);
    const team = this.extractTeamName(keySentence);
    
    // Build clean bullet based on category
    return this.buildCleanBullet(keySentence, player, team, article.source, category);
  }

  /**
   * Split text into clean sentences
   * @param {string} text - Text to split
   * @returns {Array} Array of sentences
   */
  splitIntoSentences(text) {
    if (!text) return [];
    
    // Handle abbreviations
    const abbreviations = ['Jr.', 'Sr.', 'Dr.', 'Mr.', 'Mrs.', 'Ms.', 'U.S.', 'N.F.L.', 'ESPN.com', 'NFL.com'];
    let processedText = text;
    const placeholders = {};
    
    abbreviations.forEach((abbr, index) => {
      const placeholder = `__ABBR${index}__`;
      if (processedText.includes(abbr)) {
        placeholders[placeholder] = abbr;
        processedText = processedText.replace(new RegExp(abbr.replace('.', '\\.'), 'g'), placeholder);
      }
    });
    
    // Split on sentence boundaries  
    const sentences = processedText
      .split(/[.!?]+\s+(?=[A-Z])/)
      .map(sentence => {
        let restored = sentence.trim();
        Object.entries(placeholders).forEach(([placeholder, original]) => {
          restored = restored.replace(new RegExp(placeholder, 'g'), original);
        });
        return restored;
      })
      .filter(s => s.length > 15);
    
    return sentences;
  }

  /**
   * Find sentence containing the pattern
   * @param {Array} sentences - Available sentences
   * @param {RegExp} pattern - Pattern to find
   * @returns {string|null} Matching sentence or null
   */
  findPatternSentence(sentences, pattern) {
    return sentences.find(sentence => pattern.test(sentence.toLowerCase())) || null;
  }

  /**
   * Build clean bullet in proper format
   * @param {string} sentence - Key sentence
   * @param {string} player - Player name
   * @param {string} team - Team abbreviation  
   * @param {string} source - Source name
   * @param {string} category - Category type
   * @returns {string} Clean bullet
   */
  buildCleanBullet(sentence, player, team, source, category) {
    let bullet = '';
    
    // Clean the sentence first
    const cleanSentence = this.cleanSentenceForBullet(sentence);
    
    // Format based on category preferences
    if (category === 'roster') {
      // Roster: "TEAM — action PLAYER (details)"
      if (team && player) {
        bullet = `${team} — ${cleanSentence.replace(player, player)}`;
      } else if (team) {
        bullet = `${team} — ${cleanSentence}`;
      } else {
        bullet = cleanSentence;
      }
    } else if (category === 'injury') {
      // Injury: "Player (TEAM) — status"
      if (player && team) {
        bullet = `${player} (${team}) — ${cleanSentence.replace(player, '').trim()}`;
      } else if (player) {
        bullet = `${player} — ${cleanSentence}`;
      } else {
        bullet = cleanSentence;
      }
    } else {
      // Breaking: flexible format
      bullet = cleanSentence;
    }
    
    // Add source and format properly
    bullet = `${bullet} (${source})`;
    return this.formatFinalBullet(bullet);
  }

  /**
   * Clean sentence for bullet use
   * @param {string} sentence - Raw sentence
   * @returns {string} Cleaned sentence
   */
  cleanSentenceForBullet(sentence) {
    if (!sentence) return '';
    
    return sentence
      .replace(/^By [A-Za-z\s]+,?\s*/i, '') // Remove bylines
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Format final bullet with proper length and punctuation  
   * @param {string} bullet - Raw bullet
   * @returns {string} Formatted bullet
   */
  formatFinalBullet(bullet) {
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
        // Ends with source citation, that's fine
      } else {
        formatted += '.';
      }
    }
    
    return formatted;
  }

  /**
   * Validate bullet quality before accepting
   * @param {string} bullet - Bullet to validate
   * @returns {boolean} True if acceptable quality
   */
  validateBulletQuality(bullet) {
    if (!bullet || bullet.length < 20) return false;
    
    // Must contain at least one letter and not be all caps
    if (!/[a-zA-Z]/.test(bullet)) return false;
    if (bullet === bullet.toUpperCase()) return false;
    
    // Should not be a fragment
    const words = bullet.split(' ').length;
    if (words < 4) return false;
    
    // Should contain some indication of action/status
    const actionWords = /(is|are|was|were|will|signed|waived|injured|out|questionable|announced)/i;
    if (!actionWords.test(bullet)) return false;
    
    return true;
  }

  /**
   * Get classifier status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      patterns: {
        injury: this.INJURY_PATTERNS.toString(),
        roster: this.ROSTER_PATTERNS.toString(),
        breaking: this.BREAKING_PATTERNS.toString(),
        exclusions: this.EXCLUDE_HINTS.toString()
      },
      sources: {
        injury: this.INJURY_SOURCES.length,
        roster: this.ROSTER_SOURCES.length,
        breaking: this.BREAKING_SOURCES.length
      },
      nflTeams: this.nflTeams.length
    };
  }
}

module.exports = new NewsClassifierService();