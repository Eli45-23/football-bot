import axios from 'axios';
import { JSDOM } from 'jsdom';
import { toTZ, nowTZ, fmtDateShort } from '../src/utils/time';

const teamMappings = require('../config/nflTeamMappings');

/**
 * ESPN Injuries Table Scraper with proper date filtering and formatting
 * Fetches and parses the official ESPN NFL injuries page
 */

interface InjuryData {
  player: string;
  teamAbbr: string;
  status: string;
  note?: string;
  updatedISO?: string;
  timestamp?: number;
}

interface FormattedInjuries {
  bullets: string[];
  totalCount: number;
  pages: string[][];
  source: string;
}

const DEFAULT_TIMEZONE = 'America/New_York';

class ESPNInjuriesService {
  private injuriesUrl: string;
  private lastFetchTime: Date | null;
  private lastInjuries: Map<string, any>;

  constructor() {
    this.injuriesUrl = 'https://www.espn.com/nfl/injuries';
    this.lastFetchTime = null;
    this.lastInjuries = new Map(); // player+team -> status for deduplication
    
    console.log('📋 ESPN Injuries service initialized');
  }

  /**
   * Fetch current NFL injuries from ESPN with proper lookback filtering
   * @param lookbackHours - Hours to look back (24h morning, 12h afternoon, 24h evening)
   * @returns Promise<FormattedInjuries> Formatted injuries with pagination
   */
  async fetchInjuries(lookbackHours: number = 24): Promise<FormattedInjuries> {
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
      
    } catch (error: any) {
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
  private parseInjuriesTable(document: Document): InjuryData[] {
    const injuries: InjuryData[] = [];
    
    // Try multiple selectors for ESPN's changing layout
    const tableSelectors = [
      '.Table__TR--sm tbody tr',
      '.injuries tbody tr',
      '[data-module="injuries"] tbody tr',
      '.ResponsiveTable tbody tr'
    ];
    
    let rows: NodeListOf<Element> = document.querySelectorAll('tr'); // fallback
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
        const injury = this.parseInjuryRow(row as Element);
        if (injury) {
          injuries.push(injury);
        }
      } catch (error: any) {
        console.log(`   ❌ Error parsing injury row: ${error.message}`);
      }
    });

    return injuries;
  }

  /**
   * Parse a single injury table row with exact field extraction
   */
  private parseInjuryRow(row: Element): InjuryData | null {
    const cells = row.querySelectorAll('td');
    if (cells.length < 3) return null;

    let player: string | null = null;
    let teamAbbr: string | null = null;
    let status: string | null = null;
    let note: string | null = null;
    let updatedISO: string | null = null;

    // Extract player name (first cell)
    const playerCell = cells[0];
    const playerLink = playerCell.querySelector('a');
    if (playerLink) {
      player = playerLink.textContent?.trim() || null;
    } else {
      player = playerCell.textContent?.trim() || null;
    }

    // Extract team abbreviation from player cell or adjacent cells
    teamAbbr = this.extractTeamFromCell(playerCell) || this.extractTeamFromCell(cells[1]);

    // Status (usually 3rd cell after Player, Position)
    if (cells.length >= 3) {
      status = cells[2].textContent?.trim() || null;
    }

    // Note/comment (usually 4th cell)
    if (cells.length >= 4) {
      const noteText = cells[3].textContent?.trim();
      if (noteText && !this.isDateLike(noteText)) {
        note = noteText;
      }
    }

    // Updated date (last cell or any cell that looks like a date)
    for (let i = cells.length - 1; i >= 0; i--) {
      const cellText = cells[i].textContent?.trim();
      if (cellText && this.isDateLike(cellText)) {
        updatedISO = this.parseUpdatedDateToISO(cellText);
        break;
      }
    }

    // Validate required fields
    if (!player || !status) {
      return null;
    }

    return {
      player: player,
      teamAbbr: teamAbbr || 'UNK',
      status: status,
      note: note || undefined,
      updatedISO: updatedISO || undefined,
      timestamp: updatedISO ? toTZ(updatedISO, DEFAULT_TIMEZONE).toMillis() : Date.now()
    };
  }

  /**
   * Filter injuries by lookback window - drops old entries like "Feb 9"
   */
  private filterByLookback(injuries: InjuryData[], lookbackHours: number): InjuryData[] {
    const cutoffTime = nowTZ(DEFAULT_TIMEZONE).minus({ hours: lookbackHours });
    
    return injuries.filter(injury => {
      if (!injury.timestamp) {
        // If no timestamp, assume recent (keep it)
        return true;
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
  private formatBulletsExact(injuries: InjuryData[]): string[] {
    return injuries.map(injury => {
      // Normalize fields as specified
      const player = this.titleCaseName(injury.player);
      const team = injury.teamAbbr.toUpperCase();
      const status = this.sentenceCase(injury.status);
      const noteText = injury.note ? ` (${injury.note})` : '';
      
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
    }).filter(bullet => bullet.length > 0);
  }

  /**
   * Create pages of specified size (8 per message)
   */
  private createPages(bullets: string[], pageSize: number): string[][] {
    const pages: string[][] = [];
    
    for (let i = 0; i < bullets.length; i += pageSize) {
      pages.push(bullets.slice(i, i + pageSize));
    }
    
    return pages;
  }

  /**
   * Sort injuries by date descending (most recent first)
   */
  private sortInjuriesByDate(injuries: InjuryData[]): InjuryData[] {
    return injuries.sort((a, b) => {
      const aTime = a.timestamp || 0;
      const bTime = b.timestamp || 0;
      return bTime - aTime; // Descending
    });
  }

  /**
   * Deduplicate injuries by player+team combination
   */
  private deduplicateInjuries(injuries: InjuryData[]): InjuryData[] {
    const seen = new Set<string>();
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
  private extractTeamFromCell(cell: Element | null): string | null {
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
      const teamFromSrc = srcText.match(/\/([A-Z]{2,4})[\/\.]/))?.[1];
      
      return teamFromAlt || teamFromSrc || null;
    }
    
    return null;
  }

  /**
   * Check if text looks like a date
   */
  private isDateLike(text: string): boolean {
    if (!text) return false;
    
    // Patterns like "Aug 16", "Feb 9", "Recently", "Dec 25"
    return /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}$/.test(text.trim()) ||
           text.trim().toLowerCase() === 'recently';
  }

  /**
   * Parse ESPN date format to ISO string
   */
  private parseUpdatedDateToISO(dateText: string): string | null {
    if (!dateText || dateText.toLowerCase() === 'recently') {
      return nowTZ(DEFAULT_TIMEZONE).toISO();
    }
    
    try {
      // Handle "Aug 16", "Feb 9" format
      const currentYear = nowTZ(DEFAULT_TIMEZONE).year;
      const fullDate = `${dateText} ${currentYear}`;
      const parsed = new Date(fullDate);
      
      if (!isNaN(parsed.getTime())) {
        return toTZ(parsed.getTime(), DEFAULT_TIMEZONE).toISO();
      }
    } catch (error) {
      // Ignore parsing errors
    }
    
    return null;
  }

  /**
   * Convert name to proper title case (John Doe Jr.)
   */
  private titleCaseName(name: string): string {
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
  private sentenceCase(status: string): string {
    if (!status) return '';
    
    // Handle multi-word statuses properly
    return status.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
  }

  /**
   * Get service status
   */
  getStatus(): Record<string, any> {
    return {
      injuriesUrl: this.injuriesUrl,
      lastFetchTime: this.lastFetchTime,
      cachedInjuries: this.lastInjuries.size,
      timezone: DEFAULT_TIMEZONE
    };
  }
}

export default new ESPNInjuriesService();
module.exports = new ESPNInjuriesService();