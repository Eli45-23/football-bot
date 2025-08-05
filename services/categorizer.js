const { OpenAI } = require('openai');
const config = require('../config/config');

/**
 * NFL Content Categorization Service
 * Organizes NFL data into structured categories for clean Discord updates
 */
class NFLCategorizer {  
  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey
    });
    this.model = config.openai.model;
  }

  /**
   * Categorize all team data into organized sections
   * @param {Array} teamDataArray - Array of team data objects
   * @param {string} date - Date string for the briefing
   * @returns {Object} Categorized content with sections
   */
  async categorizeAllContent(teamDataArray, date) {
    try {
      console.log(`📋 Categorizing content for ${teamDataArray.length} teams...`);
      
      // Collect all data from teams for comprehensive analysis
      const allContent = this.prepareContentForCategorization(teamDataArray);
      
      if (!allContent.hasContent) {
        return this.createEmptyBriefing(date);
      }

      // Use GPT-4 to categorize and organize all content
      const categorizedContent = await this.performCategorization(allContent, date);
      
      return categorizedContent;

    } catch (error) {
      console.error('❌ Error categorizing content:', error);
      return this.createErrorBriefing(date, error.message);
    }
  }

  /**
   * Prepare raw team data for categorization with token management
   * @param {Array} teamDataArray - Raw team data
   * @returns {Object} Prepared content object
   */
  prepareContentForCategorization(teamDataArray) {
    const allData = {
      teamUpdates: [],
      timelineEntries: [],
      upcomingGames: [],
      recentGames: [],
      rssItems: [],
      hasContent: false
    };

    // Limit data to prevent token overflow - prioritize most recent/relevant
    const maxTeamUpdates = 8; // Limit team summaries
    const maxTimelinePerTeam = 2; // Reduce timeline entries per team
    const maxGamesPerTeam = 1; // Reduce games per team
    const maxRssPerTeam = 2; // Reduce RSS items per team

    teamDataArray.slice(0, 12).forEach(teamData => { // Limit total teams processed
      if (!teamData) return;

      // Add team-specific summaries if available (truncate long summaries)
      if (teamData.summary && teamData.summary !== "No significant updates." && allData.teamUpdates.length < maxTeamUpdates) {
        // Truncate summary to prevent token bloat
        const truncatedSummary = teamData.summary.length > 300 
          ? teamData.summary.substring(0, 297) + '...'
          : teamData.summary;
          
        allData.teamUpdates.push({
          team: teamData.team,
          summary: truncatedSummary,
          source: teamData.source || 'SportsDB'
        });
        allData.hasContent = true;
      }

      // Add timeline data if available (heavily limited)
      if (teamData.timelineData && teamData.timelineData.length > 0) {
        const limitedTimeline = teamData.timelineData.slice(0, maxTimelinePerTeam).map(entry => ({
          strTimeline: entry.strTimeline ? entry.strTimeline.substring(0, 150) : '',
          dateTimeline: entry.dateTimeline,
          strEvent: entry.strEvent
        }));
        allData.timelineEntries.push(...limitedTimeline);
        allData.hasContent = true;
      }

      // Add game data (limited)
      if (teamData.nextEvents && teamData.nextEvents.length > 0) {
        const limitedGames = teamData.nextEvents.slice(0, maxGamesPerTeam).map(game => ({
          strEvent: game.strEvent || 'Upcoming Game',
          dateEvent: game.dateEvent,
          strHomeTeam: game.strHomeTeam,
          strAwayTeam: game.strAwayTeam
        }));
        allData.upcomingGames.push(...limitedGames);
        allData.hasContent = true;
      }

      if (teamData.lastEvents && teamData.lastEvents.length > 0) {
        const limitedGames = teamData.lastEvents.slice(0, maxGamesPerTeam).map(game => ({
          strEvent: game.strEvent || 'Recent Game',
          dateEvent: game.dateEvent,
          intHomeScore: game.intHomeScore,
          intAwayScore: game.intAwayScore,
          strHomeTeam: game.strHomeTeam,
          strAwayTeam: game.strAwayTeam
        }));
        allData.recentGames.push(...limitedGames);
        allData.hasContent = true;
      }

      // Add RSS data if available (limited and truncated)
      if (teamData.rssItems && teamData.rssItems.length > 0) {
        const limitedRss = teamData.rssItems.slice(0, maxRssPerTeam).map(item => ({
          title: item.title ? item.title.substring(0, 100) : '',
          contentSnippet: item.contentSnippet ? item.contentSnippet.substring(0, 150) : '',
          pubDate: item.pubDate
        }));
        allData.rssItems.push(...limitedRss);
        allData.hasContent = true;
      }
    });

    console.log(`📊 Prepared data for categorization: ${allData.teamUpdates.length} summaries, ${allData.timelineEntries.length} timeline, ${allData.upcomingGames.length} upcoming, ${allData.recentGames.length} recent, ${allData.rssItems.length} rss`);
    
    return allData;
  }

  /**
   * Use GPT-4 to categorize content into organized sections with token management
   * @param {Object} allContent - All collected content
   * @param {string} date - Briefing date
   * @returns {Object} Categorized briefing content
   */
  async performCategorization(allContent, date) {
    // Create a more concise prompt with essential data only
    const essentialData = this.createConciseDataSummary(allContent);
    
    const prompt = `NFL analyst: Organize this data into 4 categories for Discord briefing.

DATA:
${essentialData}

CATEGORIES:
1. **🏥 Injury Report** - Player injuries, health status
2. **🔁 Roster Moves** - Signings, releases, trades  
3. **📅 Scheduled Games** - Upcoming games this week
4. **🚨 Breaking News** - Major news, performance updates

FORMAT:
- Max 4 bullet points per category
- One sentence per bullet point
- Use team names (e.g., "Eagles WR AJ Brown...")
- If no content: "No significant updates"

EXAMPLE:
🏥 **Injury Report**
• Cowboys RB Tony Pollard ruled OUT with ankle injury
• Eagles WR AJ Brown questionable for Monday (hamstring)

🔁 **Roster Moves**  
• Patriots sign WR Kenny Golladay after preseason injury
• Jets release RB Zonovan Knight from practice squad

📅 **Scheduled Games**
• Eagles vs Giants – Monday, 8:15 PM EST
• Cowboys vs Bills – Sunday Night Football

🚨 **Breaking News**
• Aaron Rodgers expected to return to full practice this week
• Deebo Samuel contract extension talks ongoing

Return ONLY the organized categories with bullet points.`;

    try {
      // Log token estimate for debugging
      const estimatedTokens = Math.ceil(prompt.length / 4); // Rough token estimate
      console.log(`🔢 Estimated tokens for categorization: ${estimatedTokens}`);
      
      if (estimatedTokens > 7000) {
        console.log('⚠️ Token count too high, using ultra-compact prompt');
        return this.performCompactCategorization(allContent, date);
      }

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600, // Reduced max tokens
        temperature: 0.3
      });

      const categorizedText = response.choices[0]?.message?.content?.trim();
      
      if (!categorizedText) {
        throw new Error('No categorized content received from GPT');
      }

      // Parse the categorized content into structured data
      return this.parseCategorizedContent(categorizedText, date, allContent);

    } catch (error) {
      console.error('❌ Error in GPT categorization:', error);
      throw error;
    }
  }

  /**
   * Parse GPT categorized content into structured format
   * @param {string} categorizedText - GPT response
   * @param {string} date - Briefing date
   * @param {Object} sourceData - Original source data for metadata
   * @returns {Object} Structured briefing object
   */
  parseCategorizedContent(categorizedText, date, sourceData) {
    const sections = {
      date,
      injuries: [],
      rosterMoves: [],
      scheduledGames: [],
      breakingNews: [],
      metadata: {
        totalTeams: sourceData.teamUpdates.length,
        dataSources: this.getDataSources(sourceData),
        generatedAt: new Date().toISOString()
      }
    };

    // Parse each section from the categorized text
    const lines = categorizedText.split('\n').filter(line => line.trim());
    let currentSection = null;

    lines.forEach(line => {
      const trimmed = line.trim();
      
      // Detect section headers
      if (trimmed.includes('🏥') && trimmed.includes('Injury Report')) {
        currentSection = 'injuries';
        return;
      }
      if (trimmed.includes('🔁') && trimmed.includes('Roster Moves')) {
        currentSection = 'rosterMoves';
        return;
      }
      if (trimmed.includes('📅') && trimmed.includes('Scheduled Games')) {
        currentSection = 'scheduledGames';
        return;
      }
      if (trimmed.includes('🚨') && trimmed.includes('Breaking News')) {
        currentSection = 'breakingNews';
        return;
      }

      // Add content to current section
      if (currentSection && trimmed.startsWith('•')) {
        const content = trimmed.substring(1).trim();
        if (content && !content.includes('No significant updates')) {
          sections[currentSection].push(content);
        }
      }
    });

    console.log(`✅ Parsed categorized content: ${sections.injuries.length} injuries, ${sections.rosterMoves.length} moves, ${sections.scheduledGames.length} games, ${sections.breakingNews.length} news`);
    
    return sections;
  }

  /**
   * Create a concise data summary for token-efficient prompts
   * @param {Object} allContent - All collected content
   * @returns {string} Concise data summary
   */
  createConciseDataSummary(allContent) {
    let summary = '';
    
    // Team updates (most important)
    if (allContent.teamUpdates.length > 0) {
      summary += 'TEAM UPDATES:\n';
      allContent.teamUpdates.slice(0, 6).forEach(update => {
        summary += `- ${update.team}: ${update.summary.substring(0, 150)}\n`;
      });
      summary += '\n';
    }
    
    // Upcoming games (condensed)
    if (allContent.upcomingGames.length > 0) {
      summary += 'UPCOMING GAMES:\n';
      allContent.upcomingGames.slice(0, 6).forEach(game => {
        const homeTeam = game.strHomeTeam || 'TBD';
        const awayTeam = game.strAwayTeam || 'TBD';
        const date = game.dateEvent || 'TBD';
        summary += `- ${awayTeam} @ ${homeTeam} (${date})\n`;
      });
      summary += '\n';
    }
    
    // Recent games (condensed)
    if (allContent.recentGames.length > 0) {
      summary += 'RECENT GAMES:\n';
      allContent.recentGames.slice(0, 4).forEach(game => {
        const homeTeam = game.strHomeTeam || 'TBD';
        const awayTeam = game.strAwayTeam || 'TBD';
        const homeScore = game.intHomeScore || '?';
        const awayScore = game.intAwayScore || '?';
        summary += `- ${awayTeam} ${awayScore}-${homeScore} ${homeTeam}\n`;
      });
      summary += '\n';
    }
    
    // Timeline entries (most condensed)
    if (allContent.timelineEntries.length > 0) {
      summary += 'TIMELINE:\n';
      allContent.timelineEntries.slice(0, 4).forEach(entry => {
        const timeline = entry.strTimeline || 'Update';
        summary += `- ${timeline.substring(0, 100)}\n`;
      });
      summary += '\n';
    }
    
    // RSS items (very condensed)
    if (allContent.rssItems.length > 0) {
      summary += 'NEWS:\n';
      allContent.rssItems.slice(0, 4).forEach(item => {
        summary += `- ${item.title.substring(0, 80)}\n`;
      });
    }
    
    return summary.substring(0, 3000); // Hard limit to prevent token overflow
  }

  /**
   * Perform ultra-compact categorization for token-heavy data
   * @param {Object} allContent - All collected content
   * @param {string} date - Briefing date
   * @returns {Object} Categorized briefing content
   */
  async performCompactCategorization(allContent, date) {
    // Ultra-compact prompt for high token situations
    const compactPrompt = `Categorize NFL data into 4 sections:

UPDATES: ${allContent.teamUpdates.slice(0, 4).map(u => `${u.team}: ${u.summary.substring(0, 50)}`).join('; ')}

GAMES: ${allContent.upcomingGames.slice(0, 4).map(g => `${g.strAwayTeam || 'TBD'} @ ${g.strHomeTeam || 'TBD'}`).join('; ')}

NEWS: ${allContent.rssItems.slice(0, 3).map(r => r.title.substring(0, 40)).join('; ')}

Output format:
🏥 **Injury Report**
• [injuries or "No significant updates"]

🔁 **Roster Moves**
• [moves or "No significant updates"]

📅 **Scheduled Games**
• [games or "No significant updates"]

🚨 **Breaking News**
• [news or "No significant updates"]`;

    try {
      console.log(`🔢 Compact prompt tokens: ${Math.ceil(compactPrompt.length / 4)}`);
      
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: compactPrompt }],
        max_tokens: 400,
        temperature: 0.3
      });

      const categorizedText = response.choices[0]?.message?.content?.trim();
      
      if (!categorizedText) {
        throw new Error('No categorized content received from compact GPT');
      }

      return this.parseCategorizedContent(categorizedText, date, allContent);

    } catch (error) {
      console.error('❌ Error in compact categorization:', error);
      throw error;
    }
  }

  /**
   * Determine data sources used in the briefing
   * @param {Object} sourceData - Source data object
   * @returns {Array} Array of data sources
   */
  getDataSources(sourceData) {
    const sources = new Set();
    
    sourceData.teamUpdates.forEach(update => {
      if (update.source) sources.add(update.source);
    });
    
    if (sourceData.timelineEntries.length > 0) sources.add('SportsDB Timeline');
    if (sourceData.upcomingGames.length > 0) sources.add('SportsDB Schedule');
    if (sourceData.rssItems.length > 0) sources.add('RSS Feeds');
    
    return Array.from(sources);
  }

  /**
   * Create empty briefing when no content is available
   * @param {string} date - Briefing date
   * @returns {Object} Empty briefing structure
   */
  createEmptyBriefing(date) {
    return {
      date,
      injuries: [],
      rosterMoves: [],
      scheduledGames: [],
      breakingNews: [],
      isEmpty: true,
      metadata: {
        totalTeams: 0,
        dataSources: [],
        generatedAt: new Date().toISOString(),
        message: 'No significant updates found today'
      }
    };
  }

  /**
   * Create error briefing when categorization fails
   * @param {string} date - Briefing date
   * @param {string} errorMessage - Error details
   * @returns {Object} Error briefing structure
   */
  createErrorBriefing(date, errorMessage) {
    return {
      date,
      injuries: [],
      rosterMoves: [],
      scheduledGames: [],
      breakingNews: [],
      hasError: true,
      metadata: {
        totalTeams: 0,
        dataSources: [],
        generatedAt: new Date().toISOString(),
        error: errorMessage
      }
    };
  }

  /**
   * Format categorized content into Discord embed
   * @param {Object} briefing - Categorized briefing data
   * @returns {Object} Discord embed object
   */
  formatForDiscord(briefing) {
    const { EmbedBuilder } = require('discord.js');
    
    const embed = new EmbedBuilder()
      .setTitle(`🏈 **NFL Daily Briefing – ${briefing.date}**`)
      .setColor(0x013369)
      .setTimestamp();

    // Handle empty or error briefings
    if (briefing.isEmpty) {
      embed.setDescription('No significant player updates found today across all monitored teams.\n\nAll teams showing normal activity.');
      embed.addFields({
        name: '📊 Scan Results',
        value: `Processed: ${config.nflTeams.length} teams\nUpdates found: 0`,
        inline: true
      });
    } else if (briefing.hasError) {
      embed.setDescription('❌ An error occurred while generating the daily briefing. Please try again later.');
      embed.setColor(0xFF0000);
    } else {
      // Add categorized sections as embed fields
      this.addSectionToEmbed(embed, '🏥 **Injury Report**', briefing.injuries);
      this.addSectionToEmbed(embed, '🔁 **Roster Moves**', briefing.rosterMoves);
      this.addSectionToEmbed(embed, '📅 **Scheduled Games**', briefing.scheduledGames);
      this.addSectionToEmbed(embed, '🚨 **Breaking News**', briefing.breakingNews);

      // Add metadata
      const totalUpdates = briefing.injuries.length + briefing.rosterMoves.length + 
                          briefing.scheduledGames.length + briefing.breakingNews.length;
      
      embed.addFields({
        name: '📊 Scan Results',
        value: `Processed: ${briefing.metadata.totalTeams} teams\nUpdates found: ${totalUpdates}`,
        inline: true
      });
    }

    // Add footer with data sources
    const sources = briefing.metadata.dataSources.length > 0 
      ? briefing.metadata.dataSources.join(' + ')
      : 'Multiple Sources';
    
    embed.setFooter({
      text: `Sources: ${sources} • Powered by GPT-4`
    });

    return embed;
  }

  /**
   * Add section content to Discord embed
   * @param {EmbedBuilder} embed - Discord embed builder
   * @param {string} title - Section title
   * @param {Array} items - Section items
   */
  addSectionToEmbed(embed, title, items) {
    let content;
    
    if (items.length === 0) {
      content = 'No significant updates';
    } else {
      content = items.map(item => `• ${item}`).join('\n');
      // Truncate if too long for Discord
      if (content.length > 1024) {
        const truncated = content.substring(0, 1020) + '...';
        content = truncated;
      }
    }

    embed.addFields({
      name: title,
      value: content,
      inline: false
    });
  }
}

module.exports = new NFLCategorizer();