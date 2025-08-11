const axios = require('axios');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const teamMappings = require('../config/nflTeamMappings');

/**
 * Site-specific full-text extraction service
 * Extracts clean, factual sentences from NFL news sources with rule-based categorization
 */
class SiteExtractorsService {
  constructor() {
    this.timeout = parseInt(process.env.ARTICLE_TIMEOUT_MS) || 10000;
    this.userAgent = 'Mozilla/5.0 (compatible; NFL Discord Bot/2.0)';
    
    // Site-specific extraction strategies
    this.extractors = {
      'espn.com': this.extractESPN.bind(this),
      'nfl.com': this.extractNFL.bind(this),
      'cbssports.com': this.extractCBS.bind(this),
      'yahoo.com': this.extractYahoo.bind(this),
      'profootballtalk.nbcsports.com': this.extractPFT.bind(this),
      'profootballrumors.com': this.extractPFR.bind(this)
    };
    
    // Common abbreviations that shouldn't break sentences
    this.abbreviations = [
      'Jr.', 'Sr.', 'Dr.', 'Mr.', 'Mrs.', 'Ms.', 'Prof.',
      'vs.', 'No.', 'Vol.', 'etc.', 'i.e.', 'e.g.',
      'U.S.', 'N.F.L.', 'ESPN.com', 'NFL.com', 'CBS.com', 'PFT.com'
    ];
    
    // Enhanced pattern matching for strict categorization
    this.INJURY_PATTERNS = /(injur(?:y|ed)|carted off|out for season|out indefinitely|questionable|doubtful|inactive(?:s)?|ruled out|limited practice|did not practice|concussion|hamstring|ankle|knee|groin|back|shoulder|wrist|foot|pup|physically unable|placed on ir|activated from ir|designated to return)/i;
    
    this.ROSTER_PATTERNS = /(sign(?:ed|s)?|re[- ]?sign(?:ed|s)?|waive(?:d|s)?|release(?:d|s)?|trade(?:d|s)?|acquire(?:d|s)?|promote(?:d|s)?|elevate(?:d|s)?|claim(?:ed|s)?|activate(?:d|s)?|place(?:d)? on ir|designate(?:d)? to return|agreement|one-year deal|two-year deal|extension)/i;
    
    this.BREAKING_PATTERNS = /(breaking|official|announced|press release|per source|sources|expected to|returns|ruled|statement|league announces|suspension|discipline)/i;
    
    // Strict exclusion patterns
    this.EXCLUDE_PATTERNS = /(takeaways|observations|film review|debut|first impression|went \\d+-for-\\d+|stat line|highlights|preseason notes|camp notebook|power rankings)/i;
    
    console.log('📰 Site extractors service initialized with enhanced rule-based extraction');
  }

  /**
   * Extract full-text content from article URL with category detection
   * @param {string} url - URL to extract from
   * @param {string} title - Article title
   * @param {string} category - Target category (injury/roster/breaking)
   * @returns {Promise<Object>} Extraction result with factual sentences
   */
  async extractFromUrl(url, title = '', category = null) {
    if (!url) return null;

    try {
      const domain = this.getDomain(url);
      const extractor = this.extractors[domain] || this.extractGeneric.bind(this);
      
      console.log(`   🔍 Extracting ${category || 'general'} from ${domain}: ${title.substring(0, 50)}...`);
      
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: { 'User-Agent': this.userAgent },
        maxRedirects: 3
      });

      const result = await extractor(response.data, url, title, category);
      
      if (result && result.sentences && result.sentences.length > 0) {
        console.log(`   ✅ ${domain}: extracted ${result.sentences.length} sentences`);
      } else {
        console.log(`   ⚠️ ${domain}: no sentences extracted`);
      }
      
      return result;
      
    } catch (error) {
      console.log(`   ❌ Extraction failed for ${url}: ${error.message}`);
      return {
        sourceShort: this.deriveSourceShort(url),
        sentences: [],
        error: error.message
      };
    }
  }

  /**
   * Extract from ESPN with enhanced content detection
   */
  async extractESPN(html, url, title, category) {
    const dom = new JSDOM(html, { url });
    const document = dom.window.document;
    
    // Try meta description first for crisp summaries
    const metaDesc = document.querySelector('meta[property="og:description"]')?.content;
    if (metaDesc && metaDesc.length > 50) {
      const sentences = this.splitSentences(metaDesc);
      const reportSentence = this.chooseReportSentence(sentences, category);
      if (reportSentence) {
        return {
          sourceShort: 'ESPN',
          sentences: [reportSentence],
          method: 'meta',
          text: metaDesc
        };
      }
    }
    
    return { sourceShort: 'ESPN', sentences: [], text: '' };
  }

  /**
   * Extract from NFL.com with enhanced content detection
   */
  async extractNFL(html, url, title, category) {
    const dom = new JSDOM(html, { url });
    const document = dom.window.document;
    
    // Try meta description first
    const metaDesc = document.querySelector('meta[name="description"]')?.content ||
                   document.querySelector('meta[property="og:description"]')?.content;
    
    if (metaDesc && metaDesc.length > 50) {
      const sentences = this.splitSentences(metaDesc);
      const reportSentence = this.chooseReportSentence(sentences, category);
      if (reportSentence) {
        return {
          sourceShort: 'NFL.com',
          sentences: [reportSentence],
          method: 'meta',
          text: metaDesc
        };
      }
    }
    
    return { sourceShort: 'NFL.com', sentences: [], text: '' };
  }

  /**
   * Extract from CBS Sports
   */
  async extractCBS(html, url, title, category) {
    return { sourceShort: 'CBS', sentences: [], text: '' };
  }

  /**
   * Extract from Yahoo Sports
   */
  async extractYahoo(html, url, title, category) {
    return { sourceShort: 'Yahoo', sentences: [], text: '' };
  }

  /**
   * Extract from ProFootballTalk
   */
  async extractPFT(html, url, title, category) {
    return { sourceShort: 'PFT', sentences: [], text: '' };
  }

  /**
   * Extract from ProFootballRumors
   */
  async extractPFR(html, url, title, category) {
    return { sourceShort: 'PFR', sentences: [], text: '' };
  }

  /**
   * Generic extraction using Readability
   */
  async extractGeneric(html, url, title, category) {
    return { sourceShort: this.deriveSourceShort(url), sentences: [], text: '' };
  }

  /**
   * Enhanced text cleaning for factual extraction
   */
  cleanText(text) {
    if (!text) return '';
    
    return text
      .replace(/^By [A-Za-z\\s]+,?\\s*/gmi, '')
      .replace(/^[A-Za-z\\s]+ \\| [A-Za-z\\s]+ \\|/gm, '')
      .replace(/Follow .+ on Twitter/gi, '')
      .replace(/Subscribe to .+/gi, '')
      .replace(/\\s+/g, ' ')
      .trim();
  }

  /**
   * Split text into sentences with abbreviation handling
   */
  splitSentences(text) {
    if (!text) return [];
    
    // Handle abbreviations
    let processedText = text;
    const placeholders = {};
    
    this.abbreviations.forEach((abbr, index) => {
      const placeholder = `__ABBR${index}__`;
      if (processedText.includes(abbr)) {
        placeholders[placeholder] = abbr;
        processedText = processedText.replace(new RegExp(abbr.replace('.', '\\\\.'), 'g'), placeholder);
      }
    });
    
    // Split on sentence boundaries
    const sentences = processedText
      .split(/[.!?]+\\s+(?=[A-Z])/)
      .map(sentence => {
        let restored = sentence.trim();
        Object.entries(placeholders).forEach(([placeholder, original]) => {
          restored = restored.replace(new RegExp(placeholder, 'g'), original);
        });
        return restored;
      })
      .filter(s => s.length > 15 && /[a-zA-Z]/.test(s));
    
    return sentences;
  }

  /**
   * Choose best report sentence for category with 1-2 sentence rule
   */
  chooseReportSentence(sentences, category) {
    if (!sentences || sentences.length === 0) return null;
    
    // Get appropriate pattern for category
    let pattern = null;
    if (category === 'injury') pattern = this.INJURY_PATTERNS;
    else if (category === 'roster') pattern = this.ROSTER_PATTERNS;
    else if (category === 'breaking') pattern = this.BREAKING_PATTERNS;
    
    if (!pattern) {
      // No category specified, return first substantial sentence
      return sentences.find(s => s.length > 20 && s.length <= 320) || null;
    }
    
    // Find first sentence matching the pattern
    const primarySentence = sentences.find(sentence => 
      pattern.test(sentence.toLowerCase()) && sentence.length <= 320
    );
    
    return primarySentence || null;
  }

  /**
   * Get domain from URL
   */
  getDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return 'unknown';
    }
  }

  /**
   * Derive short source name from URL
   */
  deriveSourceShort(url) {
    const domain = this.getDomain(url);
    
    const sourceMap = {
      'espn.com': 'ESPN',
      'nfl.com': 'NFL.com',
      'profootballtalk.nbcsports.com': 'PFT',
      'yahoo.com': 'Yahoo',
      'cbssports.com': 'CBS',
      'profootballrumors.com': 'PFR'
    };
    
    return sourceMap[domain] || domain.split('.')[0].toUpperCase();
  }

  /**
   * Get short source name from URL (backward compatibility)
   */
  getSourceShort(url) {
    return this.deriveSourceShort(url);
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      timeout: this.timeout,
      supportedSites: Object.keys(this.extractors),
      patterns: {
        injury: this.INJURY_PATTERNS.toString(),
        roster: this.ROSTER_PATTERNS.toString(),
        breaking: this.BREAKING_PATTERNS.toString(),
        exclusions: this.EXCLUDE_PATTERNS.toString()
      }
    };
  }
}

module.exports = new SiteExtractorsService();