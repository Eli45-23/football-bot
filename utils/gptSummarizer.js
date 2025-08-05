const { OpenAI } = require('openai');
const config = require('../config/config');

/**
 * OpenAI GPT-4 Summarizer for NFL data
 * Converts raw timeline and player data into readable Discord updates
 */
class GPTSummarizer {
  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey
    });
    this.model = config.openai.model;
    this.maxTokens = config.openai.maxTokens;
    this.temperature = config.openai.temperature;
  }

  /**
   * Summarize team timeline data into Discord-ready updates
   * @param {string} teamName - Name of the NFL team
   * @param {Array} timelineData - Raw timeline data from TheSportsDB
   * @param {Array} nextEvents - Upcoming games
   * @param {Array} lastEvents - Recent games
   * @returns {string} Formatted update summary
   */
  async summarizeTeamUpdates(teamName, timelineData, nextEvents = [], lastEvents = []) {
    try {
      // Check if we have any meaningful data
      const hasTimelineData = timelineData && timelineData.length > 0;
      const hasEventData = (nextEvents && nextEvents.length > 0) || (lastEvents && lastEvents.length > 0);
      
      if (!hasTimelineData && !hasEventData) {
        console.log(`⚠️ No meaningful data for ${teamName} - skipping GPT analysis`);
        return null;
      }

      // Prepare context data for GPT-4
      const contextData = {
        team: teamName,
        timelineEntries: timelineData.slice(0, 10), // Limit to prevent token overflow
        upcomingGames: nextEvents.slice(0, 3),
        recentGames: lastEvents.slice(0, 3),
        dataSource: hasTimelineData ? 'timeline_and_events' : 'events_only'
      };

      const prompt = `You are an NFL news reporter creating concise injury/roster updates for Discord. 

Team: ${teamName}
Data Available: ${JSON.stringify(contextData, null, 2)}

${hasTimelineData ? 
  'Create a brief update focusing ONLY on:' : 
  'Based on limited event data, create a brief update if you can identify:'
}
- Player injuries (strains, sprains, ruled out, questionable status)
- Roster moves (signings, releases, trades)
- Practice participation changes
- Return-to-play updates
- Game performance highlights (if from recent games)

Format as bullet points using these emojis:
🏈 for general player news
🛑 for injuries/ruled out
🔁 for roster moves/signings
🟢 for positive news (cleared to play, returning)

Each bullet should be ONE sentence max. Only include significant NFL news that fantasy players care about.
${!hasTimelineData ? 'With limited timeline data, focus on what you can reasonably infer from game schedules and results.' : ''}
If no relevant updates can be determined, respond with "No significant updates."

Example format:
🛑 Eagles WR AJ Brown ruled out for Week 1 (hamstring)
🔁 Patriots sign WR Kenny Golladay after preseason injury
🟢 Jets QB Aaron Rodgers cleared for full practice

Keep response under 200 words total.`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: this.maxTokens,
        temperature: this.temperature
      });

      const summary = response.choices[0]?.message?.content?.trim();
      
      if (!summary || summary === "No significant updates.") {
        return null; // Return null for no updates to filter out empty summaries
      }

      console.log(`✅ Generated summary for ${teamName}: ${summary.substring(0, 100)}...`);
      return summary;

    } catch (error) {
      console.error(`❌ Error summarizing updates for ${teamName}:`, error.message);
      return null;
    }
  }

  /**
   * Generate player profile summary from detailed player data
   * @param {Object} playerData - Player information from TheSportsDB
   * @param {Array} contracts - Player contract data
   * @param {Array} milestones - Player achievements
   * @returns {string} Formatted player profile summary
   */
  async summarizePlayerProfile(playerData, contracts = [], milestones = []) {
    try {
      const prompt = `Create a concise Discord embed description for this NFL player:

Player: ${playerData.strPlayer}
Position: ${playerData.strPosition}
Team: ${playerData.strTeam}
Bio: ${playerData.strDescriptionEN?.substring(0, 500) || 'No bio available'}
Height: ${playerData.strHeight}
Weight: ${playerData.strWeight}
Born: ${playerData.dateBorn}
Nationality: ${playerData.strNationality}

Recent Contracts: ${JSON.stringify(contracts.slice(0, 2))}
Key Milestones: ${JSON.stringify(milestones.slice(0, 3))}

Write a 2-3 sentence engaging summary focusing on:
- Current team and position
- Key career highlights or recent achievements
- Notable stats or records if mentioned

Keep it conversational and informative for NFL fans. Under 150 words.`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.4
      });

      return response.choices[0]?.message?.content?.trim() || 'Player profile summary unavailable.';

    } catch (error) {
      console.error(`❌ Error creating player profile summary:`, error.message);
      return 'Player profile summary unavailable due to API error.';
    }
  }

  /**
   * Create team roster overview for Discord embed
   * @param {string} teamName - Name of the team
   * @param {Array} players - Array of team players
   * @returns {string} Team roster summary
   */
  async summarizeTeamRoster(teamName, players) {
    try {
      // Get key positions and notable players
      const keyPlayers = players.filter(p => 
        p.strPosition && ['QB', 'RB', 'WR', 'TE'].includes(p.strPosition)
      ).slice(0, 8);

      const prompt = `Create a brief team roster overview for the ${teamName}:

Key Players: ${JSON.stringify(keyPlayers.map(p => ({
        name: p.strPlayer,
        position: p.strPosition
      })))}

Total Roster Size: ${players.length} players

Write 2-3 sentences highlighting:
- Star players at key positions (QB, RB, WR)
- Team strengths based on roster
- Any notable depth or talent

Keep it engaging for NFL fans. Under 100 words.`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.4
      });

      return response.choices[0]?.message?.content?.trim() || `${teamName} roster information.`;

    } catch (error) {
      console.error(`❌ Error creating roster summary:`, error.message);
      return `${teamName} roster information.`;
    }
  }

  /**
   * Create comprehensive daily briefing with categorized sections
   * @param {Array} teamDataArray - Array of complete team data objects
   * @param {string} date - Date string for the briefing
   * @returns {Object} Discord embed object with categorized content
   */
  async createCategorizedBriefing(teamDataArray, date) {
    try {
      const categorizer = require('../services/categorizer');
      
      console.log(`📋 Creating categorized briefing for ${teamDataArray.length} teams...`);
      
      // Use the categorizer to organize all content
      const categorizedContent = await categorizer.categorizeAllContent(teamDataArray, date);
      
      // Format for Discord
      const discordEmbed = categorizer.formatForDiscord(categorizedContent);
      
      console.log(`✅ Created categorized briefing with ${Object.keys(categorizedContent).length} sections`);
      
      return discordEmbed;

    } catch (error) {
      console.error('❌ Error creating categorized briefing:', error);
      
      // Fallback to old format if categorization fails
      const teamUpdates = teamDataArray.map(data => ({
        team: data.team,
        summary: data.summary
      })).filter(update => update.summary);
      
      return this.formatDailyUpdateFallback(teamUpdates, date);
    }
  }

  /**
   * Format daily update compilation for Discord (legacy method)
   * @param {Array} teamUpdates - Array of team update objects
   * @param {string} date - Date string for the update
   * @returns {string} Complete daily update message
   */
  formatDailyUpdate(teamUpdates, date) {
    if (!teamUpdates || teamUpdates.length === 0) {
      return `🟢 **NFL Update – ${date}**\n\nNo significant player updates today. All monitored teams show normal activity.\n\nUse \`/team [name]\` or \`/player [name]\` for detailed information.`;
    }

    let updateMessage = `🟢 **NFL Update – ${date}**\n\n`;
    
    teamUpdates.forEach(update => {
      if (update.summary && update.summary !== "No significant updates.") {
        updateMessage += `${update.summary}\n\n`;
      }
    });

    updateMessage += `Use \`/team [name]\` or \`/player [name]\` for full bio and updates.`;
    
    return updateMessage;
  }

  /**
   * Fallback format for daily updates when categorization fails
   * @param {Array} teamUpdates - Array of team update objects
   * @param {string} date - Date string for the update
   * @returns {Object} Discord embed object
   */
  formatDailyUpdateFallback(teamUpdates, date) {
    const { EmbedBuilder } = require('discord.js');
    
    const embed = new EmbedBuilder()
      .setTitle(`🟢 **NFL Update – ${date}**`)
      .setColor(0x013369)
      .setTimestamp();

    if (!teamUpdates || teamUpdates.length === 0) {
      embed.setDescription('No significant player updates today. All monitored teams show normal activity.');
    } else {
      let description = '';
      teamUpdates.forEach(update => {
        if (update.summary && update.summary !== "No significant updates.") {
          description += `${update.summary}\n\n`;
        }
      });
      
      embed.setDescription(description || 'No significant updates found.');
    }

    embed.addFields({
      name: 'ℹ️ Commands',
      value: 'Use `/team [name]` or `/player [name]` for detailed information.',
      inline: false
    });

    embed.setFooter({
      text: 'Data from TheSportsDB • Powered by GPT-4'
    });

    return embed;
  }

  /**
   * Generate team status summary from latest event and timeline data
   * @param {string} teamName - Name of the NFL team
   * @param {Object} lastEvent - Most recent event/game data
   * @param {Array} timelineData - Timeline entries from recent game
   * @returns {string} Formatted team status summary
   */
  async summarizeTeamStatus(teamName, lastEvent, timelineData) {
    try {
      // Check if we have meaningful data
      const hasEventData = lastEvent && (lastEvent.strEvent || lastEvent.dateEvent);
      const hasTimelineData = timelineData && timelineData.length > 0;
      
      if (!hasEventData && !hasTimelineData) {
        console.log(`⚠️ No meaningful data for team status: ${teamName}`);
        return `No recent activity or status updates found for ${teamName}.`;
      }

      const contextData = {
        team: teamName,
        lastEvent: lastEvent || null,
        timelineEntries: (timelineData || []).slice(0, 8), // Limit for token management
        dataAvailable: {
          hasEvent: hasEventData,
          hasTimeline: hasTimelineData
        }
      };

      const prompt = `You are an NFL reporter creating a concise team status update for Discord.

Team: ${teamName}
Recent Data: ${JSON.stringify(contextData, null, 2)}

Summarize key injuries, substitutions, or player absences for the ${teamName} from this timeline and last event. 

Focus on:
- Player injuries (ruled out, questionable, day-to-day)
- Roster changes (signings, releases, trades)
- Key substitutions or absences from recent games
- Practice participation updates
- Return-to-play status

Format as clean bullet points using these emojis:
🛑 for injuries/ruled out
🟢 for players returning/cleared
🔁 for roster moves/signings
🏈 for general team news

Each point should be ONE sentence maximum. 
Keep response under 150 words total.
Use bullet points starting with "- " format.

Example format:
- 🛑 AJ Brown ruled OUT (hamstring)
- 🔁 New CB signing: Casey Hayward
- 🟢 Next game: vs Giants on Monday

If no significant updates can be found, respond with "No significant status updates found."`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.3
      });

      const summary = response.choices[0]?.message?.content?.trim();
      
      if (!summary || summary === "No significant status updates found.") {
        return `No significant status updates found for ${teamName}.`;
      }

      console.log(`✅ Generated team status for ${teamName}: ${summary.substring(0, 50)}...`);
      return summary;

    } catch (error) {
      console.error(`❌ Error generating team status for ${teamName}:`, error.message);
      return `Unable to generate status summary for ${teamName} - please try again later.`;
    }
  }

  /**
   * Generate player status summary from player data and team timeline
   * @param {string} playerName - Name of the NFL player
   * @param {Object} playerData - Player information from TheSportsDB
   * @param {Array} teamTimeline - Timeline from player's current team
   * @returns {string} Formatted player status summary
   */
  async summarizePlayerStatus(playerName, playerData, teamTimeline) {
    try {
      // Check if we have meaningful data
      const hasPlayerData = playerData && (playerData.strPlayer || playerData.strTeam);
      const hasTimelineData = teamTimeline && teamTimeline.length > 0;
      
      if (!hasPlayerData) {
        console.log(`⚠️ No player data for status: ${playerName}`);
        return `No detailed information found for ${playerName}.`;
      }

      const contextData = {
        player: {
          name: playerData.strPlayer,
          team: playerData.strTeam,
          position: playerData.strPosition,
          status: playerData.strStatus,
          description: (playerData.strDescriptionEN || '').substring(0, 200) // Limit description
        },
        teamTimelineEntries: (teamTimeline || []).slice(0, 6), // Limit for tokens
        dataAvailable: {
          hasPlayerInfo: hasPlayerData,
          hasTeamTimeline: hasTimelineData
        }
      };

      const prompt = `You are an NFL reporter creating a player status update for Discord.

Player: ${playerName}
Available Data: ${JSON.stringify(contextData, null, 2)}

Is there any injury, trade, or status update for ${playerName} based on this player info and the most recent timeline for their team?

Look for:
- Injury status (hurt, questionable, ruled out)
- Game participation (started, benched, limited snaps)
- Practice participation (full, limited, did not participate)
- Performance notes from recent games
- Any roster or contract changes

Format as clean bullet points using these emojis:
🛑 for injuries/concerning status
🏈 for game performance/participation
🟢 for positive updates (healthy, good performance)
🔁 for status changes (traded, signed, etc.)

Each point should be ONE sentence maximum.
Keep response under 120 words total.
Use bullet points starting with "- " format.

Example format:
- 🛑 Left practice early (calf tightness)
- 🏈 Played only Q1 last game
- 🛑 Questionable for Week 1

If no specific status updates can be determined for this player, respond with "No specific status updates found."`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 180,
        temperature: 0.3
      });

      const summary = response.choices[0]?.message?.content?.trim();
      
      if (!summary || summary === "No specific status updates found.") {
        return `No specific status updates found for ${playerName} in recent team activity.`;
      }

      console.log(`✅ Generated player status for ${playerName}: ${summary.substring(0, 50)}...`);
      return summary;

    } catch (error) {
      console.error(`❌ Error generating player status for ${playerName}:`, error.message);
      return `Unable to generate status summary for ${playerName} - please try again later.`;
    }
  }
}

module.exports = new GPTSummarizer();