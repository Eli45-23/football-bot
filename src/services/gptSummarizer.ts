const OpenAI = require('openai');

/**
 * Type definitions for GPT Summarizer
 */

/**
 * @typedef {Object} Excerpt
 * @property {string} source - Short source name (e.g., "ESPN", "PFT")
 * @property {string} [url] - Optional URL
 * @property {string} [title] - Optional article title
 * @property {string} text - Main text content (500-700 chars recommended)
 * @property {string} [team] - Optional team name
 * @property {string} [player] - Optional player name
 */

/**
 * GPT-based fact extraction and summarization service for NFL RSS content
 * Uses OpenAI GPT-4o-mini to extract, categorize, and polish factual NFL updates
 * NEVER invents facts - only extracts from provided source material
 * 
 * Main functions:
 * - summarizeInjuries(excerpts: Excerpt[], dateISO: string): Promise<string[]>
 * - summarizeRoster(excerpts: Excerpt[], dateISO: string): Promise<string[]>
 * - summarizeBreaking(excerpts: Excerpt[], dateISO: string): Promise<string[]>
 * - semanticDedupe(bullets: string[]): Promise<string[]>
 */
class GPTSummarizerService {
  constructor() {
    // Check if GPT is enabled
    this.enabled = process.env.GPT_ENABLED === 'true';
    this.callsUsed = 0;
    
    // Track token usage for detailed logging
    this.tokenUsage = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCalls: 0,
      lastResetTime: Date.now()
    };
    
    if (this.enabled) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      
      this.model = process.env.GPT_MODEL || 'gpt-4o-mini';
      this.temperature = Number(process.env.GPT_TEMPERATURE || 0.1);
      this.maxInputTokens = parseInt(process.env.GPT_MAX_INPUT_TOKENS || '3000');
      this.maxOutputTokens = parseInt(process.env.GPT_MAX_OUTPUT_TOKENS || '600');
      this.runsPerUpdate = parseInt(process.env.GPT_RUNS_PER_UPDATE || '3');
      this.timeoutMs = parseInt(process.env.GPT_TIMEOUT_MS || '12000');
      
      console.log(`🤖 GPT Summarizer initialized: model=${this.model}, temp=${this.temperature}, max calls=${this.runsPerUpdate}`);
    } else {
      console.log('🔌 GPT Summarizer disabled (GPT_ENABLED !== true)');
    }
  }

  /**
   * Reset call counter and token usage (should be called at start of each update run)
   */
  resetCallCounter() {
    this.callsUsed = 0;
    this.tokenUsage = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCalls: 0,
      lastResetTime: Date.now()
    };
    console.log('🔄 GPT metrics reset for new update run');
  }

  /**
   * Check if we can make another GPT call
   * @returns {boolean}
   */
  canMakeCall() {
    return this.enabled && this.callsUsed < this.runsPerUpdate;
  }

  /**
   * Make a GPT call with timeout protection
   * @param {string} systemPrompt - System prompt
   * @param {string} userPrompt - User prompt with data
   * @returns {Promise<string[]>} Array of bullets
   */
  async makeGPTCall(systemPrompt, userPrompt) {
    if (!this.canMakeCall()) {
      console.log(`⚠️ GPT call limit reached (${this.callsUsed}/${this.runsPerUpdate})`);
      return [];
    }

    try {
      this.callsUsed++;
      
      // Create promise for GPT call
      const gptPromise = this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: this.temperature,
        max_tokens: this.maxOutputTokens
      });

      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('GPT call timeout')), this.timeoutMs);
      });

      // Race between GPT call and timeout
      const response = await Promise.race([gptPromise, timeoutPromise]);
      
      const content = response.choices[0]?.message?.content || '';
      
      // Track token usage for detailed logging
      const usage = response.usage;
      if (usage) {
        this.tokenUsage.totalInputTokens += usage.prompt_tokens || 0;
        this.tokenUsage.totalOutputTokens += usage.completion_tokens || 0;
        this.tokenUsage.totalCalls += 1;
      }
      
      // Parse bullets from response (expecting one per line)
      const bullets = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && line !== 'No updates.')
        .map(line => {
          // Remove leading bullet characters if present
          return line.replace(/^[•\-\*]\s*/, '');
        })
        .filter(line => line.length > 10); // Filter out very short lines

      // Enhanced logging with token details
      const tokensUsed = usage ? `${usage.prompt_tokens}→${usage.completion_tokens}` : 'unknown';
      console.log(`   ✅ GPT call ${this.callsUsed}/${this.runsPerUpdate}: ${bullets.length} bullets, tokens: ${tokensUsed}`);
      return bullets;

    } catch (error) {
      console.log(`   ❌ GPT call failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Prepare excerpt data by trimming and cleaning
   * @param {Array} items - Raw items to convert to excerpts
   * @param {number} maxItems - Maximum items to include
   * @returns {Array} Trimmed excerpts
   */
  prepareExcerpts(items, maxItems = 5) {
    return items
      .slice(0, maxItems)
      .map(item => ({
        source: item.source,
        title: item.title ? item.title.substring(0, 100) : undefined,
        text: this.cleanAndTrimText(item.text || item.content || '', 500, 700),
        team: item.team,
        player: item.player,
        url: item.url
      }))
      .filter(excerpt => excerpt.text.length > 20); // Must have meaningful text
  }

  /**
   * Clean and trim text to target length, removing bylines and ads
   * @param {string} text - Raw text
   * @param {number} minLength - Minimum target length
   * @param {number} maxLength - Maximum target length
   * @returns {string} Cleaned text
   */
  cleanAndTrimText(text, minLength = 500, maxLength = 700) {
    // Remove common byline patterns
    text = text.replace(/^(By\s+[^\n]+|Staff\s+Report|Associated\s+Press|Reuters)[\n\r]*/i, '');
    
    // Remove common advertisement patterns
    text = text.replace(/(Advertisement|ADVERTISEMENT)[\s\S]*?(?=\n\n|$)/gi, '');
    
    // Remove social media links and handles
    text = text.replace(/@\w+|#\w+|https?:\/\/\S+/g, '');
    
    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    // Trim to target length at sentence boundary if possible
    if (text.length > maxLength) {
      const sentences = text.split(/(?<=[.!?])\s+/);
      let result = '';
      for (const sentence of sentences) {
        if ((result + sentence).length <= maxLength) {
          result += (result ? ' ' : '') + sentence;
        } else {
          break;
        }
      }
      text = result || text.substring(0, maxLength - 3) + '...';
    }
    
    return text;
  }

  /**
   * Summarize injuries from excerpts (ESPN injury table + RSS articles)
   * @param {Excerpt[]} excerpts - Array of excerpts
   * @param {string} dateISO - Date in ISO format
   * @returns {Promise<string[]>} Array of formatted injury bullets
   */
  async summarizeInjuries(excerpts, dateISO) {
    if (!this.enabled) return [];
    
    const trimmedExcerpts = this.prepareExcerpts(excerpts, 5);
    if (trimmedExcerpts.length === 0) return [];

    const systemPrompt = `You are an NFL update assistant. Use ONLY the provided excerpts as ground truth. Do NOT invent facts. If a detail is not stated, omit it. Return short factual bullets (1–2 sentences, ≤ 280 chars) shaped like '<Player or TEAM> — <status/action> (<SOURCE>)'. No URLs. No bylines. No speculation.`;

    const userPrompt = `Category: INJURIES (Date: ${dateISO}). Extract only confirmed injury statuses/updates. Include team if present. Omit rumors.

Excerpts:
${JSON.stringify(trimmedExcerpts, null, 2)}`;

    const bullets = await this.makeGPTCall(systemPrompt, userPrompt);
    
    // Post-process bullets to ensure format
    return bullets.map(bullet => this.enforceFormat(bullet, 'injury'));
  }

  /**
   * Summarize roster changes from excerpts (PFR transactions + team press releases)
   * @param {Excerpt[]} excerpts - Array of excerpts
   * @param {string} dateISO - Date in ISO format
   * @returns {Promise<string[]>} Array of formatted roster bullets
   */
  async summarizeRoster(excerpts, dateISO) {
    if (!this.enabled) return [];
    
    const trimmedExcerpts = this.prepareExcerpts(excerpts, 5);
    if (trimmedExcerpts.length === 0) return [];

    const systemPrompt = `You are an NFL update assistant. Use ONLY the provided excerpts as ground truth. Do NOT invent facts. If a detail is not stated, omit it. Return short factual bullets (1–2 sentences, ≤ 280 chars) shaped like '<Player or TEAM> — <status/action> (<SOURCE>)'. No URLs. No bylines. No speculation.`;

    const userPrompt = `Category: ROSTER. Extract ONLY transactions (sign/waive/release/trade/activate/IR/elevate/promote/claim/extension). Include team and player. Omit rumors.

Excerpts:
${JSON.stringify(trimmedExcerpts, null, 2)}`;

    const bullets = await this.makeGPTCall(systemPrompt, userPrompt);
    
    return bullets.map(bullet => this.enforceFormat(bullet, 'roster'));
  }

  /**
   * Summarize breaking news from excerpts (major announcements, suspensions, etc.)
   * @param {Excerpt[]} excerpts - Array of excerpts
   * @param {string} dateISO - Date in ISO format
   * @returns {Promise<string[]>} Array of formatted breaking news bullets
   */
  async summarizeBreaking(excerpts, dateISO) {
    if (!this.enabled) return [];
    
    const trimmedExcerpts = this.prepareExcerpts(excerpts, 5);
    if (trimmedExcerpts.length === 0) return [];

    const systemPrompt = `You are an NFL update assistant. Use ONLY the provided excerpts as ground truth. Do NOT invent facts. If a detail is not stated, omit it. Return short factual bullets (1–2 sentences, ≤ 280 chars) shaped like '<Player or TEAM> — <status/action> (<SOURCE>)'. No URLs. No bylines. No speculation.`;

    const userPrompt = `Category: BREAKING. Major announcements not already in injuries/roster (extensions, suspensions, official statements, returns). Omit opinion columns.

Excerpts:
${JSON.stringify(trimmedExcerpts, null, 2)}`;

    const bullets = await this.makeGPTCall(systemPrompt, userPrompt);
    
    return bullets.map(bullet => this.enforceFormat(bullet, 'breaking'));
  }

  /**
   * Semantically deduplicate bullets using GPT
   * @param {string[]} bullets - Array of bullets to dedupe
   * @returns {Promise<string[]>} Deduplicated bullets
   */
  async semanticDedupe(bullets) {
    if (!this.enabled || bullets.length <= 3) {
      return this.simpleDedupe(bullets);
    }

    // Take up to 15 bullets for deduplication
    const inputBullets = bullets.slice(0, 15);

    const systemPrompt = `You are a deduplication assistant. Your job is to identify semantically identical NFL updates and keep only the clearest version. Return a deduplicated list of bullets, preserving the original formatting. Each bullet on a new line.`;

    const userPrompt = `Merge semantically identical bullets; keep the clearest; return plain list:

${inputBullets.map((b, i) => `${i + 1}. ${b}`).join('\n')}`;

    const dedupedBullets = await this.makeGPTCall(systemPrompt, userPrompt);
    
    // If GPT fails, fall back to simple dedup
    if (dedupedBullets.length === 0) {
      return this.simpleDedupe(bullets);
    }

    // Add back any bullets beyond the first 15
    if (bullets.length > 15) {
      dedupedBullets.push(...bullets.slice(15));
    }

    return dedupedBullets;
  }

  /**
   * Simple string-based deduplication (fallback when GPT is disabled)
   * @param {string[]} bullets - Bullets to deduplicate
   * @returns {string[]} Deduplicated bullets
   */
  simpleDedupe(bullets) {
    const seen = new Set();
    const deduped = [];
    
    for (const bullet of bullets) {
      // Create normalized version for comparison
      const normalized = bullet.toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
      
      // Check for similarity with existing bullets
      let isDuplicate = false;
      for (const seenBullet of seen) {
        if (this.calculateSimilarity(normalized, seenBullet) > 0.8) {
          isDuplicate = true;
          break;
        }
      }
      
      if (!isDuplicate) {
        deduped.push(bullet);
        seen.add(normalized);
      }
    }
    
    return deduped;
  }

  /**
   * Calculate Jaccard similarity between two strings
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Similarity score (0-1)
   */
  calculateSimilarity(str1, str2) {
    const tokens1 = new Set(str1.split(' '));
    const tokens2 = new Set(str2.split(' '));
    
    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);
    
    return intersection.size / union.size;
  }

  /**
   * Enforce bullet format and length constraints
   * @param {string} bullet - Raw bullet
   * @param {string} category - Category type
   * @returns {string} Formatted bullet
   */
  enforceFormat(bullet, category) {
    // Remove any URLs that may have slipped in
    bullet = bullet.replace(/https?:\/\/\S+/g, '');
    
    // Remove byline patterns
    bullet = bullet.replace(/^(By\s+[^:]+:|Staff\s+Report:|Associated\s+Press:)/i, '').trim();
    
    // Ensure source is included at the end
    if (!bullet.includes('(') || !bullet.includes(')')) {
      bullet += ' (Source)';
    }
    
    // Enforce length limit (280 chars soft limit)
    if (bullet.length > 280) {
      // Try to cut at sentence boundary
      const sentences = bullet.split(/(?<=[.!?])\s+/);
      if (sentences.length > 1) {
        bullet = sentences[0];
        // Re-add source if it was cut off
        if (!bullet.includes('(') || !bullet.includes(')')) {
          const sourceMatch = sentences.join(' ').match(/\([^)]+\)\s*$/);
          if (sourceMatch) {
            bullet += ' ' + sourceMatch[0];
          }
        }
      } else {
        // Hard truncate but preserve source
        const sourceMatch = bullet.match(/\([^)]+\)\s*$/);
        const mainText = bullet.replace(/\([^)]+\)\s*$/, '').trim();
        if (mainText.length > 260 && sourceMatch) {
          bullet = mainText.substring(0, 260).trim() + '... ' + sourceMatch[0];
        } else {
          bullet = bullet.substring(0, 277) + '...';
        }
      }
    }
    
    // Ensure bullet doesn't start with bullet character
    bullet = bullet.replace(/^[•\-\*]\s*/, '');
    
    return bullet.trim();
  }

  /**
   * Get comprehensive status of GPT summarizer including token usage
   * @returns {Object} Status information with detailed metrics
   */
  getStatus() {
    const baseStatus = {
      enabled: this.enabled,
      model: this.model || 'gpt-4o-mini',
      temperature: this.temperature || 0.1,
      callsUsed: this.callsUsed,
      callsLimit: this.runsPerUpdate || 3,
      maxInputTokens: this.maxInputTokens || 3000,
      maxOutputTokens: this.maxOutputTokens || 600,
      timeoutMs: this.timeoutMs || 12000
    };
    
    // Add token usage metrics for enabled GPT
    if (this.enabled) {
      baseStatus.tokenUsage = {
        totalInputTokens: this.tokenUsage.totalInputTokens,
        totalOutputTokens: this.tokenUsage.totalOutputTokens,
        totalCalls: this.tokenUsage.totalCalls,
        avgInputTokensPerCall: this.tokenUsage.totalCalls > 0 
          ? Math.round(this.tokenUsage.totalInputTokens / this.tokenUsage.totalCalls) 
          : 0,
        avgOutputTokensPerCall: this.tokenUsage.totalCalls > 0
          ? Math.round(this.tokenUsage.totalOutputTokens / this.tokenUsage.totalCalls)
          : 0,
        sessionDuration: Date.now() - this.tokenUsage.lastResetTime
      };
    }
    
    return baseStatus;
  }
  
  /**
   * Get detailed GPT metrics string for logging
   * @returns {string} Formatted metrics string
   */
  getDetailedMetrics() {
    if (!this.enabled) {
      return 'GPT: enabled=false';
    }
    
    const status = this.getStatus();
    const tokens = status.tokenUsage;
    
    return `GPT: enabled=true model=${this.model} calls=${this.callsUsed} ` +
           `in_tokens≈${tokens.totalInputTokens} out_tokens≈${tokens.totalOutputTokens} ` +
           `avg_in=${tokens.avgInputTokensPerCall} avg_out=${tokens.avgOutputTokensPerCall}`;
  }
}

// Export singleton instance
module.exports = new GPTSummarizerService();