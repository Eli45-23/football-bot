const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Content State Manager - Tracks reported content for delta updates
 * Maintains baseline content and identifies new/updated items
 */
class ContentState {
  constructor() {
    this.dataDir = path.join(__dirname, '../../.data');
    this.contentFile = path.join(this.dataDir, 'lastContent.json');
    
    // Default state structure
    this.defaultState = {
      lastReported: {
        injuries: [],
        roster: [],
        breaking: []
      },
      reportTimestamp: 0,
      reportId: null
    };
  }

  /**
   * Ensure data directory exists
   */
  async ensureDataDir() {
    try {
      await fs.access(this.dataDir);
    } catch {
      await fs.mkdir(this.dataDir, { recursive: true });
      console.log('📁 Created .data directory for content state');
    }
  }

  /**
   * Get current content state
   * @returns {Object} Last reported content state
   */
  async getContentState() {
    await this.ensureDataDir();
    
    try {
      const data = await fs.readFile(this.contentFile, 'utf8');
      const state = JSON.parse(data);
      
      return {
        lastReported: {
          injuries: state.lastReported?.injuries || [],
          roster: state.lastReported?.roster || [],
          breaking: state.lastReported?.breaking || []
        },
        reportTimestamp: state.reportTimestamp || 0,
        reportId: state.reportId || null
      };
    } catch (error) {
      // File doesn't exist or is corrupted - return defaults
      console.log('📋 Initializing content state with defaults');
      await this.saveContentState(this.defaultState);
      return this.defaultState;
    }
  }

  /**
   * Save content state to persistent storage
   * @param {Object} state - State object to save
   */
  async saveContentState(state) {
    await this.ensureDataDir();
    await fs.writeFile(this.contentFile, JSON.stringify(state, null, 2));
  }

  /**
   * Compare current content with last reported and categorize as new/updated/unchanged
   * @param {Array} currentItems - Current content items
   * @param {Array} lastItems - Last reported items
   * @param {string} category - Content category (injuries/roster/breaking)
   * @returns {Object} Categorized content with new/updated/baseline items
   */
  categorizeContent(currentItems, lastItems, category) {
    const result = {
      new: [],
      updated: [],
      baseline: [],
      removed: []
    };

    // Create sets for faster lookup
    const lastItemsSet = new Set(lastItems.map(item => this.normalizeItem(item)));
    const currentItemsSet = new Set(currentItems.map(item => this.normalizeItem(item)));

    // Categorize current items
    for (const item of currentItems) {
      const normalized = this.normalizeItem(item);
      
      if (!lastItemsSet.has(normalized)) {
        result.new.push(item);
      } else {
        result.baseline.push(item);
      }
    }

    // Find removed items (were in last report but not in current)
    for (const item of lastItems) {
      const normalized = this.normalizeItem(item);
      
      if (!currentItemsSet.has(normalized)) {
        result.removed.push(item);
      }
    }

    console.log(`   📊 ${category}: ${result.new.length} new, ${result.baseline.length} baseline, ${result.removed.length} removed`);
    
    return result;
  }

  /**
   * Normalize item for comparison (remove timestamps, minor formatting differences)
   * @param {string} item - Content item
   * @returns {string} Normalized item for comparison
   */
  normalizeItem(item) {
    if (!item) return '';
    
    return item
      .toLowerCase()
      .replace(/updated? \w+ \d+/gi, '') // Remove "Updated Aug 12" type strings
      .replace(/\(espn\)|\(pfr\)|\(cbs\)|\(yahoo\)/gi, '') // Remove source tags
      .replace(/[•·]/g, '') // Remove bullet points
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Build comprehensive content with NEW/UPDATED prefixes
   * @param {Object} categorizedContent - Content categorized by new/updated/baseline
   * @param {string} category - Content category
   * @returns {Array} Enhanced content items with prefixes
   */
  buildEnhancedContent(categorizedContent, category) {
    const enhanced = [];

    // Add NEW items first
    for (const item of categorizedContent.new) {
      enhanced.push(`🆕 NEW: ${item}`);
    }

    // Add UPDATED items
    for (const item of categorizedContent.updated) {
      enhanced.push(`🔄 UPDATED: ${item}`);
    }

    // Add baseline items (ongoing situations)
    for (const item of categorizedContent.baseline) {
      enhanced.push(item);
    }

    return enhanced;
  }

  /**
   * Process content for delta reporting
   * @param {Object} currentContent - Current report content {injuries, roster, breaking}
   * @returns {Object} Enhanced content with new/updated indicators
   */
  async processContentDeltas(currentContent) {
    const lastState = await this.getContentState();
    
    console.log('🔄 Processing content deltas against last report...');
    
    const enhanced = {
      injuries: { items: [], totalCount: 0, newCount: 0, source: 'Mixed' },
      roster: { items: [], totalCount: 0, newCount: 0, source: 'Mixed' },
      breaking: { items: [], totalCount: 0, newCount: 0, source: 'Mixed' }
    };

    // Process each category
    for (const category of ['injuries', 'roster', 'breaking']) {
      const currentItems = currentContent[category]?.items || [];
      const lastItems = lastState.lastReported[category] || [];
      
      const categorized = this.categorizeContent(currentItems, lastItems, category);
      const enhancedItems = this.buildEnhancedContent(categorized, category);
      
      enhanced[category] = {
        items: enhancedItems,
        totalCount: enhancedItems.length,
        newCount: categorized.new.length,
        updatedCount: categorized.updated.length,
        baselineCount: categorized.baseline.length,
        source: currentContent[category]?.source || 'Mixed'
      };
    }

    console.log(`✅ Delta processing complete:`);
    console.log(`   🏥 Injuries: ${enhanced.injuries.newCount} new, ${enhanced.injuries.baselineCount} baseline`);
    console.log(`   🔁 Roster: ${enhanced.roster.newCount} new, ${enhanced.roster.baselineCount} baseline`);
    console.log(`   📰 Breaking: ${enhanced.breaking.newCount} new, ${enhanced.breaking.baselineCount} baseline`);

    return enhanced;
  }

  /**
   * Save current report content for next delta comparison
   * @param {Object} reportContent - Content that was reported
   * @param {string} reportId - Unique report ID
   */
  async saveReportedContent(reportContent, reportId) {
    const state = {
      lastReported: {
        injuries: reportContent.injuries?.items || [],
        roster: reportContent.roster?.items || [],
        breaking: reportContent.breaking?.items || []
      },
      reportTimestamp: Date.now(),
      reportId: reportId
    };

    await this.saveContentState(state);
    console.log(`💾 Saved reported content state for next delta comparison (${reportId})`);
  }

  /**
   * Get diagnostic information
   * @returns {Object} Diagnostic information
   */
  async getDiagnostics() {
    const state = await this.getContentState();
    
    return {
      dataDir: this.dataDir,
      lastReport: {
        timestamp: state.reportTimestamp,
        reportId: state.reportId,
        formatted: state.reportTimestamp > 0 ? new Date(state.reportTimestamp).toISOString() : 'Never',
        hoursAgo: state.reportTimestamp > 0 ? Math.round((Date.now() - state.reportTimestamp) / (1000 * 60 * 60)) : Infinity
      },
      itemCounts: {
        injuries: state.lastReported.injuries.length,
        roster: state.lastReported.roster.length,
        breaking: state.lastReported.breaking.length
      }
    };
  }

  /**
   * Clear content state (for testing)
   */
  async clearState() {
    await this.saveContentState(this.defaultState);
    console.log('🗑️ Content state cleared');
  }
}

// Export singleton instance
module.exports = new ContentState();