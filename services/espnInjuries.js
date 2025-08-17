const axios = require('axios');
const { JSDOM } = require('jsdom');
const { toTZ, nowTZ, fmtDateShort } = require('../src/utils/time');

const teamMappings = require('../config/nflTeamMappings');
const playerTeamMapping = require('./playerTeamMapping');
const { getManualTeamOverride } = require('../config/manualTeamOverrides');

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

    // Third cell often contains team info - try it too
    if (!teamAbbr && cells.length >= 3) {
      teamAbbr = this.extractTeamFromCell(cells[2]);
    }

    // Try to extract team from injury notes (mentions like "Cardinals", "Patriots")
    if (!teamAbbr && cells.length >= 5) {
      const noteText = cells[4].textContent || '';
      teamAbbr = this.extractTeamFromNotes(noteText);
    }

    // Try to extract team from player URL
    if (!teamAbbr) {
      const playerLink = playerCell.querySelector('a');
      if (playerLink) {
        const href = playerLink.getAttribute('href') || '';
        teamAbbr = this.extractTeamFromPlayerURL(href, player);
      }
    }

    // Fallback: look for team in the entire row text
    if (!teamAbbr) {
      const rowText = row.textContent || '';
      teamAbbr = this.extractTeamFromText(rowText);
    }

    // Manual team override (highest priority for edge cases)
    if (player) {
      const manualOverride = getManualTeamOverride(player);
      if (manualOverride) {
        teamAbbr = manualOverride;
      }
    }

    // Final fallback: use player-to-team mapping service
    if (!teamAbbr && player) {
      teamAbbr = playerTeamMapping.getTeamForPlayer(player);
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
   * Format bullets with enhanced format including position, team, and return timeline
   * Format: 🆕 NEW: Player (TEAM, POS) — Status (detailed note with return info) · Updated Date (ESPN)
   */
  formatBulletsExact(injuries) {
    return injuries.map(injury => {
      // Sanitize and normalize fields as specified
      const player = this.titleCaseName(this.sanitizeText(injury.player));
      const team = injury.teamAbbr.toUpperCase();
      const position = injury.position ? injury.position.toUpperCase() : null;
      const status = this.sentenceCase(this.sanitizeText(injury.status));
      
      // Skip completely malformed entries (likely HTML artifacts)
      if (!player || player.length < 2 || /^(injury|reports?|table|header)$/i.test(player)) {
        console.log(`   🗑️ Skipping malformed injury entry: "${injury.player}"`);
        return null;
      }
      
      // Determine if this is a "NEW" injury (within 6 hours)
      const isNew = this.isNewInjury(injury);
      const newIndicator = isNew ? '🆕 NEW: ' : '';
      
      // Build team and position info
      let teamPositionInfo = `(${team}`;
      if (position) {
        teamPositionInfo += `, ${position}`;
      }
      teamPositionInfo += ')';
      
      // Enhanced note with return timeline
      const enhancedNote = this.buildEnhancedNote(injury.note);
      
      // Format updated date
      let updated = 'Recently';
      if (injury.updatedISO) {
        const dt = toTZ(injury.updatedISO, DEFAULT_TIMEZONE);
        updated = fmtDateShort(dt);
      } else if (injury.timestamp) {
        const dt = toTZ(injury.timestamp, DEFAULT_TIMEZONE);
        updated = fmtDateShort(dt);
      }
      
      // Enhanced format with all details
      return `${newIndicator}${player} ${teamPositionInfo} — ${status}${enhancedNote} · Updated ${updated} (ESPN)`;
    }).filter(bullet => bullet !== null && bullet.length > 0);
  }

  /**
   * Determine if an injury is "new" (within 6 hours)
   */
  isNewInjury(injury) {
    const sixHoursAgo = nowTZ(DEFAULT_TIMEZONE).minus({ hours: 6 });
    
    if (injury.updatedISO) {
      const injuryTime = toTZ(injury.updatedISO, DEFAULT_TIMEZONE);
      return injuryTime >= sixHoursAgo;
    } else if (injury.timestamp) {
      const injuryTime = toTZ(injury.timestamp, DEFAULT_TIMEZONE);
      return injuryTime >= sixHoursAgo;
    }
    
    return false; // Default to not new if no timestamp
  }

  /**
   * Build enhanced note with return timeline information
   */
  buildEnhancedNote(note) {
    if (!note) return '';
    
    const cleanNote = this.sanitizeText(note);
    const returnInfo = this.parseReturnTimeline(cleanNote);
    
    let enhancedNote = ` (${cleanNote}`;
    if (returnInfo) {
      enhancedNote += `. ${returnInfo}`;
    }
    enhancedNote += ')';
    
    return enhancedNote;
  }

  /**
   * Parse return timeline from injury notes
   */
  parseReturnTimeline(note) {
    if (!note) return null;
    
    const lowerNote = note.toLowerCase();
    
    // Look for specific return timeline patterns
    const patterns = [
      // Week-specific returns
      { pattern: /week (\d+)/i, format: (match) => `Expected back: Week ${match[1]}` },
      { pattern: /(\d+)-(\d+) weeks?/i, format: (match) => `Expected back: ${match[1]}-${match[2]} weeks` },
      
      // Season-ending
      { pattern: /(season.?ending|out for.?season|done for.?season)/i, format: () => 'Out for season' },
      
      // Short-term status
      { pattern: /(day.?to.?day)/i, format: () => 'Day-to-day' },
      { pattern: /(week.?to.?week)/i, format: () => 'Week-to-week' },
      
      // Game-specific
      { pattern: /(will not return|ruled out).*(game|today|tonight)/i, format: () => 'Will not return to game' },
      { pattern: /(questionable|doubtful).*(next|upcoming).*(game|week)/i, format: () => 'Status for next game uncertain' },
      
      // Targeting return
      { pattern: /targeting.*(week \d+|return)/i, format: (match) => `Targeting return: ${match[0]}` },
    ];
    
    for (const { pattern, format } of patterns) {
      const match = note.match(pattern);
      if (match) {
        return format(match);
      }
    }
    
    return null; // No timeline found
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
    
    // NFL positions to exclude from team matching
    const nflPositions = [
      'QB', 'RB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C', 'G', 'OL',
      'DE', 'DT', 'NT', 'OLB', 'ILB', 'MLB', 'LB', 'CB', 'FS', 'SS', 'S',
      'K', 'P', 'LS', 'KR', 'PR', 'ST'
    ];
    
    // Look for team abbreviations, but exclude NFL positions
    const teamMatch = text.match(/\b([A-Z]{2,4})\b/);
    if (teamMatch && !nflPositions.includes(teamMatch[1])) {
      return teamMatch[1];
    }
    
    // Try to find team logo or team-specific classes
    const logo = cell.querySelector('[class*="team"], [alt*="logo"], [src*="team"]');
    if (logo) {
      const altText = logo.getAttribute('alt') || '';
      const srcText = logo.getAttribute('src') || '';
      const teamFromAlt = altText.match(/\b([A-Z]{2,4})\b/)?.[1];
      const teamFromSrc = srcText.match(/\/([A-Z]{2,4})[\/.]/)?.[1];
      
      if (teamFromAlt && !nflPositions.includes(teamFromAlt)) {
        return teamFromAlt;
      }
      if (teamFromSrc && !nflPositions.includes(teamFromSrc)) {
        return teamFromSrc;
      }
    }
    
    return null;
  }

  /**
   * Extract team abbreviation from raw text
   */
  extractTeamFromText(text) {
    if (!text) return null;
    
    // Common NFL team abbreviations
    const nflTeams = [
      'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN',
      'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC', 'LV', 'LAC', 'LAR', 'MIA',
      'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SF', 'SEA', 'TB',
      'TEN', 'WAS'
    ];
    
    // Look for any NFL team abbreviation in the text
    for (const team of nflTeams) {
      const regex = new RegExp(`\\b${team}\\b`, 'i');
      if (regex.test(text)) {
        return team;
      }
    }
    
    return null;
  }

  /**
   * Extract team from injury notes by looking for team name mentions
   * ENHANCED: Better pattern matching for ESPN injury note formats
   */
  extractTeamFromNotes(noteText) {
    if (!noteText) return null;
    
    console.log(`   🔍 TEAM EXTRACTION DEBUG: Processing note: "${noteText.substring(0, 100)}..."`);
    
    // Map team names to abbreviations (comprehensive)
    const teamNameMap = {
      // Team names and possessive forms
      'cardinals': 'ARI', 'cardinal': 'ARI',
      'falcons': 'ATL', 'falcon': 'ATL',
      'ravens': 'BAL', 'raven': 'BAL',
      'bills': 'BUF', 'bill': 'BUF',
      'panthers': 'CAR', 'panther': 'CAR',
      'bears': 'CHI', 'bear': 'CHI',
      'bengals': 'CIN', 'bengal': 'CIN',
      'browns': 'CLE', 'brown': 'CLE',
      'cowboys': 'DAL', 'cowboy': 'DAL',
      'broncos': 'DEN', 'bronco': 'DEN',
      'lions': 'DET', 'lion': 'DET',
      'packers': 'GB', 'packer': 'GB',
      'texans': 'HOU', 'texan': 'HOU',
      'colts': 'IND', 'colt': 'IND',
      'jaguars': 'JAX', 'jaguar': 'JAX',
      'chiefs': 'KC', 'chief': 'KC',
      'raiders': 'LV', 'raider': 'LV',
      'chargers': 'LAC', 'charger': 'LAC',
      'rams': 'LAR', 'ram': 'LAR',
      'dolphins': 'MIA', 'dolphin': 'MIA',
      'vikings': 'MIN', 'viking': 'MIN',
      'patriots': 'NE', 'patriot': 'NE',
      'saints': 'NO', 'saint': 'NO',
      'giants': 'NYG', 'giant': 'NYG',
      'jets': 'NYJ', 'jet': 'NYJ',
      'eagles': 'PHI', 'eagle': 'PHI',
      'steelers': 'PIT', 'steeler': 'PIT',
      '49ers': 'SF', 'niners': 'SF',
      'seahawks': 'SEA', 'seahawk': 'SEA',
      'buccaneers': 'TB', 'buccaneer': 'TB', 'bucs': 'TB',
      'titans': 'TEN', 'titan': 'TEN',
      'commanders': 'WAS', 'commander': 'WAS'
    };
    
    const lowerText = noteText.toLowerCase();
    
    // Enhanced pattern matching for ESPN-specific formats
    const patterns = [
      // Possessive forms: "Cardinals' official site", "Patriots' coach"
      /(cardinals?|falcons?|ravens?|bills?|panthers?|bears?|bengals?|browns?|cowboys?|broncos?|lions?|packers?|texans?|colts?|jaguars?|chiefs?|raiders?|chargers?|rams?|dolphins?|vikings?|patriots?|saints?|giants?|jets?|eagles?|steelers?|49ers?|niners?|seahawks?|buccaneers?|bucs?|titans?|commanders?)['']s?\s+(official\s+site|coach|reporter|beat\s+writer|sources?|website|staff)/i,
      
      // "According to [Team]" format
      /according\s+to\s+(?:the\s+)?(cardinals?|falcons?|ravens?|bills?|panthers?|bears?|bengals?|browns?|cowboys?|broncos?|lions?|packers?|texans?|colts?|jaguars?|chiefs?|raiders?|chargers?|rams?|dolphins?|vikings?|patriots?|saints?|giants?|jets?|eagles?|steelers?|49ers?|niners?|seahawks?|buccaneers?|bucs?|titans?|commanders?)/i,
      
      // Reporter attribution: "of [Team].com reports", "of ESPN.com reports"
      /of\s+(?:the\s+)?(cardinals?|falcons?|ravens?|bills?|panthers?|bears?|bengals?|browns?|cowboys?|broncos?|lions?|packers?|texans?|colts?|jaguars?|chiefs?|raiders?|chargers?|rams?|dolphins?|vikings?|patriots?|saints?|giants?|jets?|eagles?|steelers?|49ers?|niners?|seahawks?|buccaneers?|bucs?|titans?|commanders?)(?:\.com|s?\s+official)/i,
      
      // Direct team mentions in context
      /(?:the\s+)?(cardinals?|falcons?|ravens?|bills?|panthers?|bears?|bengals?|browns?|cowboys?|broncos?|lions?|packers?|texans?|colts?|jaguars?|chiefs?|raiders?|chargers?|rams?|dolphins?|vikings?|patriots?|saints?|giants?|jets?|eagles?|steelers?|49ers?|niners?|seahawks?|buccaneers?|bucs?|titans?|commanders?)\s+(have|will|coach|said|announced|confirmed|placed|activated)/i
    ];
    
    // Try each pattern
    for (const pattern of patterns) {
      const match = lowerText.match(pattern);
      if (match) {
        const teamName = match[1].toLowerCase();
        const abbr = teamNameMap[teamName];
        if (abbr) {
          console.log(`   ✅ TEAM FOUND via pattern: "${teamName}" → ${abbr}`);
          return abbr;
        }
      }
    }
    
    // Fallback: simple team name search
    for (const [teamName, abbr] of Object.entries(teamNameMap)) {
      const regex = new RegExp(`\\b${teamName}\\b`, 'i');
      if (regex.test(lowerText)) {
        console.log(`   ✅ TEAM FOUND via fallback: "${teamName}" → ${abbr}`);
        return abbr;
      }
    }
    
    // Also check for abbreviations that might be in the notes
    const abbrResult = this.extractTeamFromText(noteText);
    if (abbrResult) {
      console.log(`   ✅ TEAM FOUND via abbreviation: ${abbrResult}`);
      return abbrResult;
    }
    
    console.log(`   ❌ NO TEAM FOUND in note`);
    return null;
  }

  /**
   * Extract team from player profile URL or use basic player-to-team mapping
   * Since ESPN URLs don't contain team info, we'll create a basic mapping approach
   */
  extractTeamFromPlayerURL(playerURL, playerName) {
    // For now, we can't reliably extract team from ESPN player URLs
    // They follow pattern: /nfl/player/_/id/PLAYERID/player-name
    // This would require an additional API call to get team info
    
    // Return null for now - we'll rely on other extraction methods
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