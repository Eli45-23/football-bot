const { OpenAI } = require('openai');

/**
 * Enhanced GPT Summarizer with strict no-hallucination prompts
 * Provides separate methods for SportsDB data vs RSS fallback data
 */

class EnhancedSummarizer {
  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    } else {
      console.warn('⚠️ OpenAI API key not found - GPT summarization will be disabled');
      this.openai = null;
    }
    this.model = 'gpt-4o-mini'; // Cost-effective model for summarization
    this.maxTokens = 300;
    this.temperature = 0.2; // Lower temperature for more factual responses
  }

  /**
   * Summarize NFL team status from SportsDB timeline and event data
   * @param {Object} params - Parameters object
   * @param {string} params.teamName - Name of the NFL team
   * @param {Object} params.lastEvent - Most recent event/game data
   * @param {Array} params.timeline - Timeline entries from recent game
   * @returns {Promise<string>} Formatted summary
   */
  async summarizeFromSportsDB({ teamName, lastEvent, timeline }) {
    if (!this.openai) {
      return 'GPT summarization unavailable - OpenAI API key not configured.';
    }
    
    try {
      // Prepare context with limited data to prevent token overflow
      const context = {
        team: teamName,
        lastEvent: lastEvent ? {
          event: lastEvent.strEvent,
          date: lastEvent.dateEvent,
          homeScore: lastEvent.intHomeScore,
          awayScore: lastEvent.intAwayScore,
          status: lastEvent.strStatus
        } : null,
        timeline: Array.isArray(timeline) ? timeline.slice(0, 8).map(entry => ({
          time: entry.strTime,
          timeline: entry.strTimeline,
          player: entry.strPlayer,
          type: entry.strTimelineType
        })) : []
      };

      const messages = [
        {
          role: "system",
          content: "You are a precise NFL update assistant. Only summarize what is directly supported by the provided data. If evidence is insufficient or unclear, state that plainly. Never guess, assume, or fabricate information. Be factual and concise."
        },
        {
          role: "user",
          content: `Team: ${teamName}

Last Event Data:
${JSON.stringify(context.lastEvent, null, 2)}

Timeline Data:
${JSON.stringify(context.timeline, null, 2)}

Instructions:
- Summarize key injuries, substitutions, DNPs (did not play), roster notes from the provided data
- Include next opponent information if clearly present
- Use 3-6 bullet points maximum
- Each bullet point should be one sentence
- Use these emojis: 🛑 for injuries/ruled out, 🟢 for positive news, 🔁 for roster moves, 🏈 for game info
- If the data is insufficient or unclear, say "Limited data available from recent games"
- Do not speculate or add information not directly stated in the data

Format as bullet points starting with "- "`
        }
      ];

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: this.maxTokens,
        temperature: this.temperature
      });

      const summary = response.choices[0]?.message?.content?.trim();
      
      if (!summary) {
        return "Unable to generate summary from available SportsDB data.";
      }

      console.log(`✅ SportsDB summary generated for ${teamName}: ${summary.substring(0, 50)}...`);
      return summary;

    } catch (error) {
      console.error(`❌ Error generating SportsDB summary for ${teamName}:`, error.message);
      return `Unable to generate status summary for ${teamName} - GPT analysis failed.`;
    }
  }

  /**
   * Summarize NFL team/player status from RSS news items
   * @param {Object} params - Parameters object
   * @param {string} params.subject - Team or player name
   * @param {Array} params.items - RSS news items
   * @returns {Promise<string>} Formatted summary
   */
  async summarizeFromRSS({ subject, items }) {
    if (!this.openai) {
      return 'GPT summarization unavailable - OpenAI API key not configured.';
    }
    
    try {
      // Prepare RSS items for analysis
      const newsItems = items.slice(0, 10).map(item => ({
        title: item.title,
        snippet: item.contentSnippet?.substring(0, 200) || '',
        date: item.isoDate,
        source: item.source
      }));

      const messages = [
        {
          role: "system",
          content: "You are a precise NFL update assistant. Only use facts explicitly present in the supplied headlines and snippets. If information is vague, speculative, or unclear, do not include it. If nothing concrete is found, state 'No confirmed updates found from fallback sources.' Never hallucinate or assume details not directly stated."
        },
        {
          role: "user",
          content: `Subject: ${subject}

News Items:
${newsItems.map((item, i) => `${i + 1}. Title: ${item.title}
   Snippet: ${item.snippet}
   Date: ${item.date}
   Source: ${item.source}`).join('\n\n')}

Instructions:
- Extract ONLY confirmed injuries, roster changes, signings, suspensions, or clear status updates
- Focus on factual statements, not speculation or rumors
- Use 3-6 bullet points maximum  
- Each point should reference specific information from the news items
- Use these emojis: 🛑 for injuries/ruled out, 🟢 for positive news, 🔁 for roster moves, 🏈 for game info
- If nothing solid is found, respond with "No confirmed updates found from fallback sources"
- Do not speculate about implications or add context not in the source material

Format as bullet points starting with "- "`
        }
      ];

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: this.maxTokens,
        temperature: this.temperature
      });

      const summary = response.choices[0]?.message?.content?.trim();
      
      if (!summary || summary.includes('No confirmed updates found')) {
        return "No confirmed updates found from fallback sources.";
      }

      console.log(`✅ RSS summary generated for ${subject}: ${summary.substring(0, 50)}...`);
      return summary;

    } catch (error) {
      console.error(`❌ Error generating RSS summary for ${subject}:`, error.message);
      return `Unable to generate summary from RSS sources - GPT analysis failed.`;
    }
  }

  /**
   * Generate a player-specific summary from team data
   * @param {Object} params - Parameters object
   * @param {string} params.playerName - Name of the player
   * @param {Object} params.playerData - Player information
   * @param {Array} params.teamTimeline - Timeline from player's current team
   * @returns {Promise<string>} Formatted player summary
   */
  async summarizePlayerFromTeamData({ playerName, playerData, teamTimeline }) {
    if (!this.openai) {
      return 'GPT summarization unavailable - OpenAI API key not configured.';
    }
    
    try {
      const context = {
        player: {
          name: playerData.strPlayer || playerName,
          team: playerData.strTeam,
          position: playerData.strPosition,
          status: playerData.strStatus
        },
        teamTimeline: Array.isArray(teamTimeline) ? teamTimeline.slice(0, 6).map(entry => ({
          time: entry.strTime,
          timeline: entry.strTimeline,
          player: entry.strPlayer,
          type: entry.strTimelineType
        })) : []
      };

      const messages = [
        {
          role: "system",
          content: "You are a precise NFL update assistant focused on individual player status. Only use information directly stated in the provided data. If no specific information about the player is found, state that clearly. Do not speculate or infer beyond what is explicitly provided."
        },
        {
          role: "user",
          content: `Player: ${playerName}

Player Data:
${JSON.stringify(context.player, null, 2)}

Team Timeline Data:
${JSON.stringify(context.teamTimeline, null, 2)}

Instructions:
- Look for specific mentions of ${playerName} in the timeline data
- Focus on injury status, game participation, practice participation, or performance notes
- Use 2-4 bullet points maximum
- Each point should be specific to this player
- Use these emojis: 🛑 for injuries/concerning status, 🏈 for game performance, 🟢 for positive updates
- If no specific information about ${playerName} is found, respond with "No specific status updates found for this player"
- Do not make assumptions about the player's status based on general team information

Format as bullet points starting with "- "`
        }
      ];

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: 200,
        temperature: this.temperature
      });

      const summary = response.choices[0]?.message?.content?.trim();
      
      if (!summary || summary.includes('No specific status updates found')) {
        return `No specific status updates found for ${playerName} in recent team activity.`;
      }

      console.log(`✅ Player summary generated for ${playerName}: ${summary.substring(0, 50)}...`);
      return summary;

    } catch (error) {
      console.error(`❌ Error generating player summary for ${playerName}:`, error.message);
      return `Unable to generate status summary for ${playerName} - GPT analysis failed.`;
    }
  }

  /**
   * Summarize injury and roster updates from RSS news
   * @param {Object} params - Parameters object
   * @param {string} params.teamName - Team name or "League-wide"
   * @param {Array} params.items - RSS news items filtered for injuries
   * @param {boolean} params.isLeagueWide - Whether this is league-wide report
   * @returns {Promise<string>} Formatted injury report
   */
  async summarizeInjuries({ teamName, items, isLeagueWide = false }) {
    if (!this.openai) {
      return 'GPT summarization unavailable - OpenAI API key not configured.';
    }
    
    try {
      // Prepare injury-focused items
      const injuryItems = items.slice(0, 15).map(item => ({
        title: item.title,
        snippet: item.contentSnippet?.substring(0, 200) || '',
        date: item.isoDate,
        source: item.source
      }));

      const scope = isLeagueWide ? 'league-wide' : `for ${teamName}`;


      const messages = [
        {
          role: "system",
          content: "You are an NFL injury report specialist. Extract ALL injuries, practice reports, and roster moves from the provided news. Be thorough and include any mention of player status, signings, releases, or team changes. If you find any relevant information, extract it. Only respond with 'No injury updates found' if there is truly no relevant information in any of the provided items."
        },
        {
          role: "user",
          content: `Generate an injury report ${scope} from these news items:

${injuryItems.map((item, i) => `${i + 1}. Title: ${item.title}
   Snippet: ${item.snippet}
   Date: ${item.date}`).join('\n\n')}

Instructions:
- Extract ALL injuries, practice reports, and roster moves mentioned in the news items
- Be thorough - include even minor updates like practice participation changes
- Group into 3 categories: Injuries/DNPs, Roster Moves, Practice Reports
- Use these emojis: 🏥 for injuries/medical, 🔄 for roster moves, 📋 for practice status
- Format each item as a bullet point with player name, team (if league-wide), and status
- Include injury designation (Out, Questionable, Doubtful, DNP, Limited) when stated
- For roster moves include action (signed, released, promoted, etc.)
- Extract up to 20 bullet points total to ensure comprehensive coverage
- If multiple items mention the same player, combine into one comprehensive bullet point
- If no relevant information found, respond with "No injury updates found"

Example format:
- 🏥 Patrick Mahomes (Chiefs) - DNP Wednesday (ankle)
- 🏥 Tyreek Hill - Questionable for Sunday (hamstring)
- 🔄 Cowboys signed WR John Smith from practice squad
- 📋 Aaron Rodgers - Limited practice Thursday`
        }
      ];

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: 500,
        temperature: 0.1 // Very low temperature for factual extraction
      });

      const summary = response.choices[0]?.message?.content?.trim();
      
      if (!summary || summary === 'No injury updates found') {
        return isLeagueWide ? 
          'No significant injury updates found across the league.' :
          `No injury updates found for ${teamName}.`;
      }

      console.log(`✅ Injury report generated ${scope}: ${summary.substring(0, 50)}...`);
      return summary;

    } catch (error) {
      console.error(`❌ Error generating injury report for ${teamName}:`, error.message);
      return 'Unable to generate injury report - GPT analysis failed.';
    }
  }

  /**
   * Test the summarizer with sample data
   * @returns {Promise<Object>} Test results
   */
  async testSummarizer() {
    console.log('🧪 Testing Enhanced Summarizer...');
    
    const testResults = {
      sportsDBTest: null,
      rssTest: null,
      playerTest: null
    };

    try {
      // Test SportsDB summarization
      testResults.sportsDBTest = await this.summarizeFromSportsDB({
        teamName: 'Test Team',
        lastEvent: { strEvent: 'Test vs Sample', dateEvent: '2024-08-04' },
        timeline: [{ strTimeline: 'Player substitution in Q2', strPlayer: 'Test Player' }]
      });

      // Test RSS summarization
      testResults.rssTest = await this.summarizeFromRSS({
        subject: 'Test Team',
        items: [{ title: 'Test Team signs new player', contentSnippet: 'Team announced signing' }]
      });

      // Test player summarization
      testResults.playerTest = await this.summarizePlayerFromTeamData({
        playerName: 'Test Player',
        playerData: { strPlayer: 'Test Player', strTeam: 'Test Team', strPosition: 'QB' },
        teamTimeline: [{ strTimeline: 'QB Test Player completed pass', strPlayer: 'Test Player' }]
      });

      console.log('✅ Summarizer tests completed');
      return testResults;

    } catch (error) {
      console.error('❌ Summarizer test failed:', error);
      return testResults;
    }
  }
}

module.exports = new EnhancedSummarizer();