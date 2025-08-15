const axios = require('axios');
const { JSDOM } = require('jsdom');
const { toTZ, nowTZ, fmtDateShort } = require('../src/utils/time');

const teamMappings = require('../config/nflTeamMappings');

/**
 * ESPN Injuries Table Scraper with proper date filtering and formatting
 * Fetches and parses the official ESPN NFL injuries page
 */

const DEFAULT_TIMEZONE = 'America/New_York';

class ESPNInjuriesService {
  constructor() {
    this.injuriesUrl = 'https://www.espn.com/nfl/injuries';
    this.lastFetchTime = null;
    this.lastInjuries = new Map(); // player+team -> status for deduplication
    
    console.log('📋 ESPN Injuries service initialized');
  }

  /**
   * Fetch current NFL injuries from ESPN with proper lookback filtering
   * @param {number} lookbackHours - Hours to look back (24h morning, 12h afternoon, 24h evening)
   * @returns {Promise<Object>} Formatted injuries with pagination
   */
  async fetchInjuries(lookbackHours = 24) {
    try {
      console.log(`🏥 Fetching ESPN injuries table (${lookbackHours}h lookback)...`);
      
      const response = await axios.get(this.injuriesUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NFL Discord Bot/1.0)'
        }
      });

      const dom = new JSDOM(response.data);
      const document = dom.window.document;
      
      const rawInjuries = this.parseInjuriesTable(document);
      console.log(`   📊 Raw injuries parsed: ${rawInjuries.length}`);
      
      // Filter by lookback window - NO "Feb 9" old entries
      const filteredInjuries = this.filterByLookback(rawInjuries, lookbackHours);
      console.log(`   ⏰ After ${lookbackHours}h filter: ${filteredInjuries.length}`);
      
      // Sort by updated date descending (most recent first)
      const sortedInjuries = this.sortInjuriesByDate(filteredInjuries);
      
      // Deduplicate by player+team combination
      const uniqueInjuries = this.deduplicateInjuries(sortedInjuries);
      console.log(`   🔄 After deduplication: ${uniqueInjuries.length}`);
      
      // Format bullets with exact user requirements
      const formattedBullets = this.formatBulletsExact(uniqueInjuries);
      
      // Cap at 20 MAX and create pages of 8
      const cappedBullets = formattedBullets.slice(0, 20);
      const pages = this.createPages(cappedBullets, 8);
      
      console.log(`✅ ESPN injuries: ${uniqueInjuries.length} found → ${cappedBullets.length} formatted → ${pages.length} pages`);
      
      this.lastFetchTime = new Date();
      
      return {
        bullets: cappedBullets,
        totalCount: uniqueInjuries.length,
        pages: pages,
        source: 'ESPN'
      };
      
    } catch (error) {
      console.log(`❌ ESPN injuries fetch failed: ${error.message}`);
      return {
        bullets: [],
        totalCount: 0,
        pages: [],
        source: 'ESPN (failed)'
      };
    }
  }

  /**
   * Parse the ESPN injuries table from DOM
   */
  parseInjuriesTable(document) {
    const injuries = [];
    
    // Try multiple selectors for ESPN's changing layout
    const tableSelectors = [
      '.Table__TR--sm tbody tr',
      '.injuries tbody tr',
      '[data-module="injuries"] tbody tr',
      '.ResponsiveTable tbody tr'
    ];
    
    let rows = document.querySelectorAll('tr'); // fallback
    for (const selector of tableSelectors) {
      rows = document.querySelectorAll(selector);
      if (rows.length > 0) {
        console.log(`   🎯 Found ${rows.length} injury rows with selector: ${selector}`);
        break;
      }
    }
    
    if (rows.length === 0) {
      console.log('   ⚠️ No injury table rows found');
      return [];
    }

    rows.forEach((row) => {
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
   * Parse a single injury table row with exact field extraction
   * ESPN Table Structure:
   * Col 0: Player name
   * Col 1: Position (DT, WR, etc.)
   * Col 2: Game date (Aug 16, Feb 9) - NOT the update date!
   * Col 3: Status (Questionable, Out, Injured Reserve)
   * Col 4: Note with actual update date prefix (Aug 14: text...)
   */
  parseInjuryRow(row) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 4) return null;

    let player = null;
    let teamAbbr = null;
    let position = null;
    let status = null;
    let note = null;
    let updatedISO = null;

    // Extract player name (first cell)
    const playerCell = cells[0];
    const playerLink = playerCell.querySelector('a');
    if (playerLink) {
      player = playerLink.textContent?.trim() || null;
    } else {
      player = playerCell.textContent?.trim() || null;
    }

    // Extract team abbreviation from player cell
    teamAbbr = this.extractTeamFromCell(playerCell);

    // Position (second cell)
    if (cells.length >= 2) {
      position = cells[1].textContent?.trim() || null;
      // Sometimes team is in position cell
      if (!teamAbbr && position) {
        teamAbbr = this.extractTeamFromCell(cells[1]);
      }
    }

    // Skip game date (third cell) - this is NOT the update date!
    // Status (fourth cell)
    if (cells.length >= 4) {
      status = cells[3].textContent?.trim() || null;
    }

    // Note with update date (fifth cell)
    if (cells.length >= 5) {
      const fullNote = cells[4].textContent?.trim();
      if (fullNote) {
        // Extract date from beginning of note (e.g., "Aug 14: Tomlinson (knee)...")
        const dateMatch = fullNote.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}:/);
        if (dateMatch) {
          const dateStr = dateMatch[0].replace(':', '').trim();
          updatedISO = this.parseUpdatedDateToISO(dateStr);
          // Remove date prefix from note
          note = fullNote.substring(dateMatch[0].length).trim();
        } else {
          note = fullNote;
        }
      }
    }

    // Validate required fields
    if (!player || !status) {
      return null;
    }

    return {
      player: player,
      teamAbbr: teamAbbr || 'UNK',
      position: position,
      status: status,
      note: note || undefined,
      updatedISO: updatedISO || undefined,
      timestamp: updatedISO ? toTZ(updatedISO, DEFAULT_TIMEZONE).toMillis() : Date.now()
    };
  }

  /**
   * Filter injuries by lookback window - drops old entries like "Feb 9"
   */
  filterByLookback(injuries, lookbackHours) {
    // FIXED: Always filter old content, even in preseason mode
    // Old content from February should never appear in Discord
    console.log(`   🎯 Filtering injuries with ${lookbackHours}h lookback (old content will be removed)`);
    
    // First, remove obviously stale content (older than 30 days)
    const thirtyDaysAgo = nowTZ(DEFAULT_TIMEZONE).minus({ days: 30 });
    const recentInjuries = injuries.filter(injury => {
      if (injury.timestamp && injury.timestamp < thirtyDaysAgo.toMillis()) {
        console.log(`   🗑️ Removed stale injury: ${injury.player} - ${injury.updated} (too old)`);
        return false;
      }
      return true;
    });
    
    const cutoffTime = nowTZ(DEFAULT_TIMEZONE).minus({ hours: lookbackHours });
    
    // Apply lookback filtering to the already-filtered recent injuries
    return recentInjuries.filter(injury => {
      if (!injury.timestamp) {
        // If no timestamp, check if updated text contains old dates
        const updatedText = (injury.updated || '').toLowerCase();
        const hasOldDate = /december|october|september|november|january|february|march|april|may|june|july/.test(updatedText);
        if (hasOldDate) {
          console.log(`   🗑️ Dropping injury with old date in text: ${injury.player} - ${injury.updated}`);
          return false;
        }
        return true; // Keep if no old date indicators
      }
      
      const injuryTime = toTZ(injury.timestamp, DEFAULT_TIMEZONE);
      const isWithinLookback = injuryTime >= cutoffTime;
      
      if (!isWithinLookback) {
        const injuryDate = fmtDateShort(injuryTime);
        console.log(`   🗑️ Dropping old injury: ${injury.player} - ${injuryDate} (older than ${lookbackHours}h)`);
      }
      
      return isWithinLookback;
    });
  }

  /**
   * Format bullets with exact user-specified format
   * bullet: `${player} (${team}) — ${status}${note ? " ("+note+")" : ""} · Updated ${updated} (ESPN)`
   */
  formatBulletsExact(injuries) {
    return injuries.map(injury => {
      // Sanitize and normalize fields as specified
      const player = this.titleCaseName(this.sanitizeText(injury.player));
      const team = injury.teamAbbr.toUpperCase();
      const status = this.sentenceCase(this.sanitizeText(injury.status));
      const noteText = injury.note ? ` (${this.sanitizeText(injury.note)})` : '';
      
      // Skip completely malformed entries (likely HTML artifacts)
      if (!player || player.length < 2 || /^(injury|reports?|table|header)$/i.test(player)) {
        console.log(`   🗑️ Skipping malformed injury entry: "${injury.player}"`);
        return null;
      }
      
      // Format updated date
      let updated = 'Recently';
      if (injury.updatedISO) {
        const dt = toTZ(injury.updatedISO, DEFAULT_TIMEZONE);
        updated = fmtDateShort(dt);
      } else if (injury.timestamp) {
        const dt = toTZ(injury.timestamp, DEFAULT_TIMEZONE);
        updated = fmtDateShort(dt);
      }
      
      // Exact format as specified
      return `${player} (${team}) — ${status}${noteText} · Updated ${updated} (ESPN)`;
    }).filter(bullet => bullet !== null && bullet.length > 0);
  }

  /**
   * Create pages of specified size (8 per message)
   */
  createPages(bullets, pageSize) {
    const pages = [];
    
    for (let i = 0; i < bullets.length; i += pageSize) {
      pages.push(bullets.slice(i, i + pageSize));
    }
    
    return pages;
  }

  /**
   * Sort injuries by date descending (most recent first)
   */
  sortInjuriesByDate(injuries) {
    return injuries.sort((a, b) => {
      const aTime = a.timestamp || 0;
      const bTime = b.timestamp || 0;
      return bTime - aTime; // Descending
    });
  }

  /**
   * Deduplicate injuries by player+team combination
   */
  deduplicateInjuries(injuries) {
    const seen = new Set();
    return injuries.filter(injury => {
      const key = `${injury.player}:${injury.teamAbbr}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Extract team abbreviation from a table cell
   */
  extractTeamFromCell(cell) {
    if (!cell) return null;
    
    const text = cell.textContent?.trim() || '';
    
    // Look for team abbreviations in common formats
    const teamMatch = text.match(/\b([A-Z]{2,4})\b/);
    if (teamMatch) {
      return teamMatch[1];
    }
    
    // Try to find team logo or team-specific classes
    const logo = cell.querySelector('[class*="team"], [alt*="logo"], [src*="team"]');
    if (logo) {
      const altText = logo.getAttribute('alt') || '';
      const srcText = logo.getAttribute('src') || '';
      const teamFromAlt = altText.match(/\b([A-Z]{2,4})\b/)?.[1];
      const teamFromSrc = srcText.match(/\/([A-Z]{2,4})[\/.]/)?.[1];
      
      return teamFromAlt || teamFromSrc || null;
    }
    
    return null;
  }

  /**
   * Check if text looks like a date
   */
  isDateLike(text) {
    if (!text) return false;
    
    // Patterns like "Aug 16", "Feb 9", "Recently", "Dec 25"
    return /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}$/.test(text.trim()) ||
           text.trim().toLowerCase() === 'recently';
  }

  /**
   * Parse ESPN date format to ISO string
   */
  parseUpdatedDateToISO(dateText) {
    if (!dateText || dateText.toLowerCase() === 'recently') {
      return nowTZ(DEFAULT_TIMEZONE).toISO();
    }
    
    try {
      // Handle "Aug 16", "Feb 9" format with proper year detection
      const now = nowTZ(DEFAULT_TIMEZONE);
      const currentYear = now.year;
      let fullDate = `${dateText} ${currentYear}`;
      let parsed = new Date(fullDate);
      
      if (!isNaN(parsed.getTime())) {
        const parsedTZ = toTZ(parsed.getTime(), DEFAULT_TIMEZONE);
        
        // CRITICAL FIX: If parsed date is more than 30 days in the future, 
        // it's likely from the previous year (e.g., "December 7" in January)
        const daysDiff = parsedTZ.diff(now, 'days').days;
        
        if (daysDiff > 30) {
          console.log(`   🔧 Date "${dateText}" interpreted as future (${daysDiff} days ahead), adjusting to previous year`);
          fullDate = `${dateText} ${currentYear - 1}`;
          parsed = new Date(fullDate);
          
          if (!isNaN(parsed.getTime())) {
            return toTZ(parsed.getTime(), DEFAULT_TIMEZONE).toISO();
          }
        }
        
        return parsedTZ.toISO();
      }
    } catch (error) {
      // Ignore parsing errors
    }
    
    return null;
  }

  /**
   * Sanitize text by removing HTML/markdown artifacts
   */
  sanitizeText(text) {
    if (!text) return '';
    
    return text
      .replace(/\*+/g, '') // Remove markdown bold/italic asterisks
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace HTML entities
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
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
   * Convert status to sentence case (Questionable, Doubtful, Injured Reserve)
   */
  sentenceCase(status) {
    if (!status) return '';
    
    // Handle multi-word statuses properly
    return status.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      injuriesUrl: this.injuriesUrl,
      lastFetchTime: this.lastFetchTime,
      cachedInjuries: this.lastInjuries.size,
      timezone: DEFAULT_TIMEZONE
    };
  }
}

module.exports = new ESPNInjuriesService();