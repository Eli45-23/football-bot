const axios = require('axios');
const { JSDOM } = require('jsdom');
const teamMappings = require('../config/nflTeamMappings');

/**
 * ESPN Injuries Table Scraper
 * Fetches and parses the official ESPN NFL injuries page
 */
class ESPNInjuriesService {
  constructor() {
    this.injuriesUrl = 'https://www.espn.com/nfl/injuries';
    this.lastFetchTime = null;
    this.lastInjuries = new Map(); // player+team -> status for deduplication
    
    console.log('📋 ESPN Injuries service initialized');
  }

  /**
   * Fetch current NFL injuries from ESPN injuries page
   * @returns {Promise<Array>} Array of injury objects
   */
  async fetchInjuries() {
    try {
      console.log('🏥 Fetching ESPN injuries table...');
      
      const response = await axios.get(this.injuriesUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NFL Discord Bot/1.0)'
        }
      });

      const dom = new JSDOM(response.data);
      const document = dom.window.document;
      
      const injuries = this.parseInjuriesTable(document);
      
      // Sort by updated date descending (most recent first)
      const sortedInjuries = this.sortInjuriesByDate(injuries);
      
      // Deduplicate by player+status+note combination
      const uniqueInjuries = this.deduplicateInjuries(sortedInjuries);
      
      console.log(`✅ ESPN injuries: ${injuries.length} total → ${sortedInjuries.length} sorted → ${uniqueInjuries.length} unique`);
      
      this.lastFetchTime = new Date();
      // Cap to 20 MAX (no "+N more" text)
      return uniqueInjuries.slice(0, 20);
      
    } catch (error) {
      console.log(`❌ ESPN injuries fetch failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Parse the ESPN injuries table from DOM
   * @param {Document} document - JSDOM document
   * @returns {Array} Array of injury objects
   */
  parseInjuriesTable(document) {
    const injuries = [];
    
    // Try multiple selectors for ESPN's changing layout
    const tableSelectors = [
      '.Table__TR--sm tbody tr', // Standard injuries table
      '.injuries tbody tr',      // Alternative layout
      '[data-module="injuries"] tbody tr', // Module-based layout
      '.ResponsiveTable tbody tr' // Responsive table
    ];
    
    let rows = [];
    for (const selector of tableSelectors) {
      rows = document.querySelectorAll(selector);
      if (rows.length > 0) {
        console.log(`   🎯 Found ${rows.length} injury rows with selector: ${selector}`);
        break;
      }
    }
    
    if (rows.length === 0) {
      console.log('   ⚠️ No injury table rows found, trying alternative parsing...');
      return this.parseAlternativeFormat(document);
    }

    rows.forEach(row => {
      try {
        const injury = this.parseInjuryRow(row);
        if (injury) {
          injuries.push(injury);
        }
      } catch (error) {
        console.log(`   ❌ Error parsing injury row: ${error.message}`);
      }
    });

    return injuries;
  }

  /**
   * Parse a single injury table row
   * @param {Element} row - Table row element
   * @returns {Object|null} Injury object or null
   */
  parseInjuryRow(row) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 3) return null;

    // ESPN table structure: [Player, Position, Status, Comment, Date] (Date may be in last column)
    let player = null;
    let team = null;
    let status = null;
    let injuryNote = null;
    let updatedDate = null;

    // Extract player name (usually in first cell)
    const playerCell = cells[0];
    const playerLink = playerCell.querySelector('a');
    if (playerLink) {
      player = playerLink.textContent?.trim();
    } else {
      player = playerCell.textContent?.trim();
    }

    // Try to extract team from player cell or adjacent cells
    const teamAbbr = this.extractTeamFromCell(playerCell) || 
                     this.extractTeamFromCell(cells[1]);

    // Status is usually in the 3rd cell (after Player, Position)
    if (cells.length >= 3) {
      status = cells[2].textContent?.trim();
    }

    // Note/comment is usually in the 4th cell
    if (cells.length >= 4) {
      injuryNote = cells[3].textContent?.trim();
    }

    // Updated date might be in the last cell (5th or later)
    if (cells.length >= 5) {
      const dateCell = cells[cells.length - 1];
      const dateText = dateCell.textContent?.trim();
      if (dateText && this.isDateLike(dateText)) {
        updatedDate = this.parseUpdatedDate(dateText);
      }
    } else if (cells.length >= 4) {
      // Sometimes date might be in the 4th cell instead of injury note
      const possibleDate = cells[3].textContent?.trim();
      if (possibleDate && this.isDateLike(possibleDate)) {
        updatedDate = this.parseUpdatedDate(possibleDate);
        injuryNote = null; // No separate injury note
      }
    }

    // Validate we have essential data
    if (!player) return null;
    if (!status && !injuryNote) return null;

    // Use "Status not specified" if status missing but note exists
    if (!status && injuryNote) {
      status = 'Status not specified';
    }

    return {
      player: this.cleanPlayerName(player),
      team: teamMappings.getTeamFullName(teamAbbr) || teamAbbr,
      teamAbbr: teamAbbr,
      status: this.cleanStatus(status),
      injuryNote: this.cleanNote(injuryNote),
      updatedDate: updatedDate || 'Recently', // Fallback if no date found
      source: 'ESPN',
      timestamp: new Date()
    };
  }

  /**
   * Extract team abbreviation from table cell
   * @param {Element} cell - Table cell element
   * @returns {string|null} Team abbreviation or null
   */
  extractTeamFromCell(cell) {
    if (!cell) return null;
    
    // Look for team logo images with alt text
    const teamImg = cell.querySelector('img[alt]');
    if (teamImg) {
      const alt = teamImg.alt;
      const teamAbbr = teamMappings.getTeamAbbr(alt);
      if (teamAbbr) return teamAbbr;
    }

    // Look for team abbreviations in text content
    const text = cell.textContent?.trim();
    if (text) {
      // Match common ESPN formats like "DAL", "QB - DAL", etc.
      const abbrMatch = text.match(/\b([A-Z]{2,3})\b/);
      if (abbrMatch && teamMappings.getTeamFullName(abbrMatch[1])) {
        return abbrMatch[1];
      }
    }

    return null;
  }

  /**
   * Parse alternative injury format when table structure differs
   * @param {Document} document - JSDOM document  
   * @returns {Array} Array of injury objects
   */
  parseAlternativeFormat(document) {
    const injuries = [];
    
    // Look for injury cards or list items
    const injuryElements = document.querySelectorAll([
      '.injury-report .player-card',
      '.injuries .player-item',
      '[data-player-name]'
    ].join(', '));

    injuryElements.forEach(element => {
      try {
        const player = element.getAttribute('data-player-name') ||
                      element.querySelector('.player-name')?.textContent?.trim();
        
        const status = element.querySelector('.injury-status')?.textContent?.trim() ||
                      element.querySelector('.status')?.textContent?.trim();

        if (player && status) {
          injuries.push({
            player: this.cleanPlayerName(player),
            team: null, // Will need to extract separately
            teamAbbr: null,
            status: this.cleanStatus(status),
            note: null,
            source: 'ESPN',
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.log(`   ❌ Error parsing alternative injury format: ${error.message}`);
      }
    });

    return injuries;
  }

  /**
   * Sort injuries by updated date descending (most recent first)
   * @param {Array} injuries - Array of injury objects
   * @returns {Array} Sorted injuries
   */
  sortInjuriesByDate(injuries) {
    return injuries.sort((a, b) => {
      // Handle 'Recently' as most recent
      if (a.updatedDate === 'Recently' && b.updatedDate !== 'Recently') return -1;
      if (b.updatedDate === 'Recently' && a.updatedDate !== 'Recently') return 1;
      if (a.updatedDate === 'Recently' && b.updatedDate === 'Recently') return 0;
      
      // Convert dates for comparison (simple string comparison works for "Mon DD" format)
      const dateA = a.updatedDate || 'Jan 1';
      const dateB = b.updatedDate || 'Jan 1';
      
      // For same month-day format, newer entries are likely more recent
      // This is a simplified approach - for exact sorting we'd need year info
      return dateB.localeCompare(dateA);
    });
  }

  /**
   * Deduplicate injuries by player+status+note combination
   * @param {Array} injuries - Array of injury objects
   * @returns {Array} Unique injuries
   */
  deduplicateInjuries(injuries) {
    const seen = new Set();
    const unique = [];
    
    for (const injury of injuries) {
      const key = `${injury.player}:${injury.teamAbbr || 'UNK'}:${injury.status}:${injury.injuryNote || 'none'}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(injury);
      }
    }
    
    return unique;
  }

  /**
   * Clean player name removing extra formatting
   * @param {string} name - Raw player name
   * @returns {string} Cleaned player name
   */
  cleanPlayerName(name) {
    if (!name) return '';
    
    return name
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/^\W+|\W+$/g, '') // Remove leading/trailing non-word chars
      .trim();
  }

  /**
   * Clean injury status
   * @param {string} status - Raw status
   * @returns {string} Cleaned status
   */
  cleanStatus(status) {
    if (!status) return '';
    
    return status
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      // Normalize common status terms
      .replace(/^out$/i, 'out')
      .replace(/^questionable$/i, 'questionable')
      .replace(/^doubtful$/i, 'doubtful')
      .replace(/^probable$/i, 'probable');
  }

  /**
   * Clean injury note/comment
   * @param {string} note - Raw note
   * @returns {string|null} Cleaned note or null
   */
  cleanNote(note) {
    if (!note || note.trim() === '') return null;
    
    const cleaned = note
      .replace(/\s+/g, ' ')
      .trim();
    
    return cleaned.length > 3 ? cleaned : null;
  }

  /**
   * Check if text looks like a date
   * @param {string} text - Text to check
   * @returns {boolean} True if looks like a date
   */
  isDateLike(text) {
    if (!text) return false;
    
    // Common ESPN date patterns: "Aug 16", "Feb 9", "12/25", etc.
    const datePatterns = [
      /^[A-Za-z]{3}\s+\d{1,2}$/,  // "Aug 16"
      /^\d{1,2}\/\d{1,2}$/,       // "8/16" 
      /^\d{1,2}-\d{1,2}$/,        // "8-16"
      /^[A-Za-z]{3}\s+\d{1,2},?\s+\d{4}$/  // "Aug 16, 2025"
    ];
    
    return datePatterns.some(pattern => pattern.test(text.trim()));
  }

  /**
   * Parse updated date from ESPN format
   * @param {string} dateText - Raw date text
   * @returns {string} Formatted date
   */
  parseUpdatedDate(dateText) {
    if (!dateText) return 'Recently';
    
    const cleaned = dateText.trim();
    
    // Handle different ESPN date formats
    if (/^[A-Za-z]{3}\s+\d{1,2}$/.test(cleaned)) {
      // "Aug 16" format - most common
      return cleaned;
    } else if (/^\d{1,2}\/\d{1,2}$/.test(cleaned)) {
      // "8/16" format - convert to month name
      const [month, day] = cleaned.split('/');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                         'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthName = monthNames[parseInt(month) - 1];
      return monthName ? `${monthName} ${day}` : cleaned;
    } else if (/^[A-Za-z]{3}\s+\d{1,2},?\s+\d{4}$/.test(cleaned)) {
      // "Aug 16, 2025" format - extract month and day
      const match = cleaned.match(/^([A-Za-z]{3})\s+(\d{1,2})/);
      return match ? `${match[1]} ${match[2]}` : cleaned;
    }
    
    return cleaned;
  }

  /**
   * Format injuries as bullet points using new format
   * @param {Array} injuries - Array of injury objects
   * @returns {Array} Array of formatted bullet strings
   */
  formatBullets(injuries) {
    return injuries.map(injury => {
      // New format: "Player (TEAM) — Status (injuryNote) · Updated Mon DD (ESPN)"
      if (!injury.player) return null;
      
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
      bullet += ` · Updated ${injury.updatedDate}`;
      
      // Add source attribution
      bullet += ` (${injury.source})`;
      
      // Ensure proper length and formatting
      if (bullet.length > 320) {
        const truncated = bullet.substring(0, 317) + '...';
        bullet = truncated;
      }
      
      // Ensure proper capitalization
      bullet = bullet.charAt(0).toUpperCase() + bullet.slice(1);
      
      return bullet;
    }).filter(Boolean);
  }

  /**
   * Get service status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      injuriesUrl: this.injuriesUrl,
      lastFetchTime: this.lastFetchTime,
      cachedInjuries: this.lastInjuries.size
    };
  }
}

module.exports = new ESPNInjuriesService();