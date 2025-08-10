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
      
      // Filter for new/changed injuries since last run
      const newOrChangedInjuries = this.filterNewOrChanged(injuries);
      
      console.log(`✅ ESPN injuries: ${injuries.length} total, ${newOrChangedInjuries.length} new/changed`);
      
      this.lastFetchTime = new Date();
      return newOrChangedInjuries.slice(0, 8); // Cap to 8 newest
      
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

    // ESPN table structure: [Player, Position, Status, Comment]
    let player = null;
    let team = null;
    let status = null;
    let note = null;

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

    if (teamAbbr) {
      team = teamMappings.getTeamFullName(teamAbbr) || teamAbbr;
    }

    // Status is usually in the 3rd or 4th cell
    if (cells.length >= 3) {
      status = cells[2].textContent?.trim();
    }

    // Note/comment is usually in the last cell
    if (cells.length >= 4) {
      note = cells[3].textContent?.trim();
    }

    if (!player || !status) return null;

    return {
      player: this.cleanPlayerName(player),
      team: team,
      teamAbbr: teamAbbr,
      status: this.cleanStatus(status),
      note: this.cleanNote(note),
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
   * Filter for new or changed injuries since last run
   * @param {Array} injuries - Current injuries
   * @returns {Array} New or changed injuries
   */
  filterNewOrChanged(injuries) {
    const newOrChanged = [];

    for (const injury of injuries) {
      const key = `${injury.player}:${injury.teamAbbr || 'UNK'}`;
      const lastStatus = this.lastInjuries.get(key);
      
      if (!lastStatus || lastStatus !== injury.status) {
        newOrChanged.push(injury);
        this.lastInjuries.set(key, injury.status);
      }
    }

    return newOrChanged;
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
   * Format injuries as bullet points
   * @param {Array} injuries - Array of injury objects
   * @returns {Array} Array of formatted bullet strings
   */
  formatBullets(injuries) {
    return injuries.map(injury => {
      let bullet = '';
      
      if (injury.player && injury.teamAbbr) {
        bullet = `${injury.player} (${injury.teamAbbr}) — ${injury.status}`;
      } else if (injury.player) {
        bullet = `${injury.player} — ${injury.status}`;
      } else {
        return null;
      }
      
      // Add note if present and adds value
      if (injury.note && injury.note.length > 3) {
        bullet += `; ${injury.note}`;
      }
      
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