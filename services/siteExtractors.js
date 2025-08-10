const axios = require('axios');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');

/**
 * Site-specific content extractors
 * Handles extraction quirks for different sports news sites
 */
class SiteExtractorsService {
  constructor() {
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
      'U.S.', 'N.F.L.', 'ESPN.com', 'NFL.com', 'CBS.com'
    ];
    
    console.log('🔧 Site extractors service initialized');
  }

  /**
   * Extract content from URL using site-specific strategy
   * @param {string} url - URL to extract from
   * @param {Array} patterns - Patterns to look for in content
   * @returns {Promise<Object>} Extraction result
   */
  async extractFromUrl(url, patterns = []) {
    try {
      const domain = this.getDomain(url);
      const extractor = this.extractors[domain] || this.extractGeneric.bind(this);
      
      console.log(`   🔍 Extracting from ${domain}...`);
      
      const result = await extractor(url, patterns);
      
      if (result.sentences && result.sentences.length > 0) {
        console.log(`   ✅ ${domain}: extracted ${result.sentences.length} sentences`);
      } else {
        console.log(`   ⚠️ ${domain}: no sentences extracted`);
      }
      
      return result;
      
    } catch (error) {
      console.log(`   ❌ Extraction failed for ${url}: ${error.message}`);
      return {
        sourceShort: this.getSourceShort(url),
        sentences: [],
        error: error.message
      };
    }
  }

  /**
   * Extract from ESPN with AMP fallback
   * @param {string} url - ESPN URL
   * @param {Array} patterns - Patterns to match
   * @returns {Promise<Object>} Extraction result
   */
  async extractESPN(url, patterns) {
    // Try AMP version first for cleaner content
    let ampUrl = null;
    if (url.includes('/story/_/id/')) {
      ampUrl = url.replace('/story/_/id/', '/story/_/id/') + '?platform=amp';
    }
    
    const urls = ampUrl ? [ampUrl, url] : [url];
    
    for (const tryUrl of urls) {
      try {
        const response = await axios.get(tryUrl, {
          timeout: 8000,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NFL Bot/1.0)' }
        });
        
        const dom = new JSDOM(response.data, { url: tryUrl });
        const document = dom.window.document;
        
        // Try meta description first
        const metaDesc = document.querySelector('meta[property="og:description"]')?.content;
        if (metaDesc && metaDesc.length > 50) {
          const sentences = this.splitSentences(metaDesc);
          const reportSentence = this.chooseReportSentence(sentences, patterns);
          if (reportSentence) {
            return {
              sourceShort: 'ESPN',
              sentences: [reportSentence],
              method: 'meta'
            };
          }
        }
        
        // Fallback to Readability
        const reader = new Readability(document);
        const content = reader.parse();
        
        if (content?.textContent) {
          const cleanText = this.cleanText(content.textContent);
          const sentences = this.splitSentences(cleanText).slice(0, 5);
          return {
            sourceShort: 'ESPN',
            sentences,
            method: 'readability'
          };
        }
        
      } catch (error) {
        console.log(`   ❌ ESPN extraction attempt failed: ${error.message}`);
        continue;
      }
    }
    
    return { sourceShort: 'ESPN', sentences: [] };
  }

  /**
   * Extract from NFL.com with AMP fallback
   * @param {string} url - NFL.com URL
   * @param {Array} patterns - Patterns to match
   * @returns {Promise<Object>} Extraction result
   */
  async extractNFL(url, patterns) {
    // Try AMP version
    const ampUrl = url.includes('/news/') ? url.replace('/news/', '/amp/news/') : null;
    const urls = ampUrl ? [ampUrl, url] : [url];
    
    for (const tryUrl of urls) {
      try {
        const response = await axios.get(tryUrl, {
          timeout: 8000,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NFL Bot/1.0)' }
        });
        
        const dom = new JSDOM(response.data, { url: tryUrl });
        const document = dom.window.document;
        
        // Try meta description
        const metaDesc = document.querySelector('meta[name="description"]')?.content ||
                       document.querySelector('meta[property="og:description"]')?.content;
        
        if (metaDesc && metaDesc.length > 50) {
          const sentences = this.splitSentences(metaDesc);
          return {
            sourceShort: 'NFL.com',
            sentences,
            method: 'meta'
          };
        }
        
        // Try article body
        const articleSelectors = [
          '.nfl-c-article__body',
          '.article-body',
          '[data-module="ArticleBody"]'
        ];
        
        for (const selector of articleSelectors) {
          const article = document.querySelector(selector);
          if (article) {
            const text = this.cleanText(article.textContent);
            const sentences = this.splitSentences(text).slice(0, 5);
            return {
              sourceShort: 'NFL.com',
              sentences,
              method: 'article'
            };
          }
        }
        
      } catch (error) {
        continue;
      }
    }
    
    return { sourceShort: 'NFL.com', sentences: [] };
  }

  /**
   * Extract from CBS Sports
   * @param {string} url - CBS URL
   * @param {Array} patterns - Patterns to match
   * @returns {Promise<Object>} Extraction result
   */
  async extractCBS(url, patterns) {
    try {
      const response = await axios.get(url, {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NFL Bot/1.0)' }
      });
      
      const dom = new JSDOM(response.data, { url });
      const document = dom.window.document;
      
      // Remove ads and clutter
      const removeSelectors = ['.Advertisement', '.SocialShare', '.RelatedContent'];
      removeSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => el.remove());
      });
      
      const reader = new Readability(document);
      const content = reader.parse();
      
      if (content?.textContent) {
        const cleanText = this.cleanText(content.textContent);
        const sentences = this.splitSentences(cleanText).slice(0, 5);
        return {
          sourceShort: 'CBS',
          sentences,
          method: 'readability'
        };
      }
      
    } catch (error) {
      console.log(`   ❌ CBS extraction failed: ${error.message}`);
    }
    
    return { sourceShort: 'CBS', sentences: [] };
  }

  /**
   * Extract from Yahoo Sports - prefer first declarative sentences
   * @param {string} url - Yahoo URL
   * @param {Array} patterns - Patterns to match
   * @returns {Promise<Object>} Extraction result
   */
  async extractYahoo(url, patterns) {
    try {
      const response = await axios.get(url, {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NFL Bot/1.0)' }
      });
      
      const dom = new JSDOM(response.data, { url });
      const document = dom.window.document;
      
      // Try OG description first
      const ogDesc = document.querySelector('meta[property="og:description"]')?.content;
      if (ogDesc && ogDesc.length > 50) {
        const sentences = this.splitSentences(ogDesc);
        // Yahoo OG descriptions are usually good summaries
        return {
          sourceShort: 'Yahoo',
          sentences: sentences.slice(0, 2),
          method: 'og'
        };
      }
      
      // Fallback to article extraction
      const reader = new Readability(document);
      const content = reader.parse();
      
      if (content?.textContent) {
        const cleanText = this.cleanText(content.textContent);
        const sentences = this.splitSentences(cleanText);
        
        // Prefer declarative sentences (not questions)
        const declarative = sentences.filter(s => 
          !s.trim().endsWith('?') && 
          s.length > 20 && 
          s.length < 200
        ).slice(0, 3);
        
        return {
          sourceShort: 'Yahoo',
          sentences: declarative.length > 0 ? declarative : sentences.slice(0, 2),
          method: 'article'
        };
      }
      
    } catch (error) {
      console.log(`   ❌ Yahoo extraction failed: ${error.message}`);
    }
    
    return { sourceShort: 'Yahoo', sentences: [] };
  }

  /**
   * Extract from ProFootballTalk with AMP fallback
   * @param {string} url - PFT URL
   * @param {Array} patterns - Patterns to match
   * @returns {Promise<Object>} Extraction result
   */
  async extractPFT(url, patterns) {
    // Try AMP version
    const ampUrl = url.replace('profootballtalk.nbcsports.com', 'profootballtalk.nbcsports.com/amp');
    const urls = [ampUrl, url];
    
    for (const tryUrl of urls) {
      try {
        const response = await axios.get(tryUrl, {
          timeout: 8000,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NFL Bot/1.0)' }
        });
        
        const dom = new JSDOM(response.data, { url: tryUrl });
        const document = dom.window.document;
        
        const reader = new Readability(document);
        const content = reader.parse();
        
        if (content?.textContent) {
          const cleanText = this.cleanText(content.textContent);
          const sentences = this.splitSentences(cleanText).slice(0, 4);
          return {
            sourceShort: 'PFT',
            sentences,
            method: 'readability'
          };
        }
        
      } catch (error) {
        continue;
      }
    }
    
    return { sourceShort: 'PFT', sentences: [] };
  }

  /**
   * Extract from ProFootballRumors
   * @param {string} url - PFR URL
   * @param {Array} patterns - Patterns to match
   * @returns {Promise<Object>} Extraction result
   */
  async extractPFR(url, patterns) {
    try {
      const response = await axios.get(url, {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NFL Bot/1.0)' }
      });
      
      const dom = new JSDOM(response.data, { url });
      const document = dom.window.document;
      
      // Remove sidebar and ads
      const removeSelectors = ['.sidebar', '.advertisement', '.related-posts'];
      removeSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => el.remove());
      });
      
      const reader = new Readability(document);
      const content = reader.parse();
      
      if (content?.textContent) {
        const cleanText = this.cleanText(content.textContent);
        const sentences = this.splitSentences(cleanText).slice(0, 3);
        return {
          sourceShort: 'PFR',
          sentences,
          method: 'readability'
        };
      }
      
    } catch (error) {
      console.log(`   ❌ PFR extraction failed: ${error.message}`);
    }
    
    return { sourceShort: 'PFR', sentences: [] };
  }

  /**
   * Generic extraction for unknown sites
   * @param {string} url - URL to extract from
   * @param {Array} patterns - Patterns to match
   * @returns {Promise<Object>} Extraction result
   */
  async extractGeneric(url, patterns) {
    try {
      const response = await axios.get(url, {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NFL Bot/1.0)' }
      });
      
      const dom = new JSDOM(response.data, { url });
      const document = dom.window.document;
      
      const reader = new Readability(document);
      const content = reader.parse();
      
      if (content?.textContent) {
        const cleanText = this.cleanText(content.textContent);
        const sentences = this.splitSentences(cleanText).slice(0, 3);
        return {
          sourceShort: this.getSourceShort(url),
          sentences,
          method: 'readability'
        };
      }
      
    } catch (error) {
      console.log(`   ❌ Generic extraction failed: ${error.message}`);
    }
    
    return { sourceShort: this.getSourceShort(url), sentences: [] };
  }

  /**
   * Clean text by removing bylines and boilerplate
   * @param {string} text - Raw text
   * @returns {string} Cleaned text
   */
  cleanText(text) {
    if (!text) return '';
    
    return text
      // Remove author bylines
      .replace(/^By [A-Za-z\s]+,?\s*/m, '')
      .replace(/^[A-Za-z\s]+ \| [A-Za-z\s]+ \|/m, '')
      .replace(/\b[A-Za-z]+ [A-Za-z]+, [A-Z]{2,} Sports/g, '')
      // Remove common boilerplate
      .replace(/Sign up for .+?newsletter/gi, '')
      .replace(/Subscribe to .+/gi, '')
      .replace(/Read more:/gi, '')
      .replace(/More: .+/gi, '')
      .replace(/Follow .+? on Twitter/gi, '')
      .replace(/Contact .+? at .+@.+/gi, '')
      .replace(/^\s*Advertisement\s*$/gmi, '')
      .replace(/Loading.../gi, '')
      .replace(/Click here to .+/gi, '')
      .replace(/Share this article/gi, '')
      // Clean whitespace
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .replace(/^\s+|\s+$/g, '')
      .replace(/[ \t]+/g, ' ');
  }

  /**
   * Split text into sentences while preserving abbreviations
   * @param {string} text - Text to split
   * @returns {Array} Array of sentences
   */
  splitSentences(text) {
    if (!text) return [];
    
    // Replace abbreviations with placeholders
    let processedText = text;
    const placeholders = {};
    this.abbreviations.forEach((abbr, index) => {
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
        // Restore abbreviations
        let restored = sentence;
        Object.entries(placeholders).forEach(([placeholder, original]) => {
          restored = restored.replace(new RegExp(placeholder, 'g'), original);
        });
        return restored.trim();
      })
      .filter(sentence => sentence.length > 10);
    
    return sentences;
  }

  /**
   * Choose the best sentence containing category patterns
   * @param {Array} sentences - Available sentences
   * @param {Array} patterns - Patterns to match
   * @returns {string|null} Best sentence or null
   */
  chooseReportSentence(sentences, patterns) {
    if (!sentences || sentences.length === 0) return null;
    if (!patterns || patterns.length === 0) return sentences[0];
    
    // Find sentences containing patterns
    for (const pattern of patterns) {
      const matching = sentences.find(sentence => 
        pattern.test && pattern.test(sentence)
      );
      if (matching) return matching;
    }
    
    // Fallback to first substantial sentence
    return sentences.find(s => s.length > 20) || sentences[0];
  }

  /**
   * Get domain from URL
   * @param {string} url - URL
   * @returns {string} Domain
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
   * Get short source name from URL
   * @param {string} url - URL
   * @returns {string} Source abbreviation
   */
  getSourceShort(url) {
    const domain = this.getDomain(url);
    
    if (domain.includes('espn.com')) return 'ESPN';
    if (domain.includes('nfl.com')) return 'NFL.com';
    if (domain.includes('yahoo.com')) return 'Yahoo';
    if (domain.includes('cbssports.com')) return 'CBS';
    if (domain.includes('profootballtalk.nbcsports.com')) return 'PFT';
    if (domain.includes('profootballrumors.com')) return 'PFR';
    if (domain.includes('nbcsports.com')) return 'NBC';
    
    return domain.split('.')[0].toUpperCase();
  }
}

module.exports = new SiteExtractorsService();