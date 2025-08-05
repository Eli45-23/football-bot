const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getTeamStatus } = require('../services/statusService');
const gptSummarizer = require('../utils/gptSummarizer');
const { fetchFallbackNews } = require('../services/rssFallback');
const sportsdb = require('../api/sportsdb');
const config = require('../config/config');

/**
 * /updates command - Generate on-demand categorized NFL briefing
 * Fetches comprehensive data for all monitored teams and provides organized summary
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('updates')
    .setDescription('Get categorized NFL briefing with injuries, roster moves, games, and breaking news'),

  async execute(interaction) {
    await interaction.deferReply();

    const today = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    try {
      console.log(`🔄 Manual categorized briefing requested by ${interaction.user.tag}`);
      
      // Show initial status
      await interaction.editReply({
        content: `🔍 **Generating NFL Briefing...**\nCollecting comprehensive data for ${config.nflTeams.length} teams...`
      });

      const teamDataArray = [];
      let processedTeams = 0;

      // Process each team with comprehensive data collection (similar to daily updater)
      for (const teamName of config.nflTeams) {
        try {
          console.log(`📡 Collecting data for ${teamName}... (${processedTeams + 1}/${config.nflTeams.length})`);
          
          // Update progress every few teams
          if (processedTeams % 4 === 0 && processedTeams > 0) {
            await interaction.editReply({
              content: `🔍 **Generating NFL Briefing...**\nProcessed ${processedTeams}/${config.nflTeams.length} teams...`
            });
          }

          // Collect comprehensive team data using the same method as daily updater
          const teamData = await this.collectComprehensiveTeamData(teamName);
          
          if (teamData) {
            teamDataArray.push(teamData);
            console.log(`✅ Collected data for ${teamName} (${teamData.source})`);
          } else {
            console.log(`📝 No meaningful data for ${teamName}`);
          }

          processedTeams++;
          
          // Rate limiting - longer delay for comprehensive data collection
          if (processedTeams < config.nflTeams.length) {
            await new Promise(resolve => setTimeout(resolve, 1800)); // 1.8 second delay
          }

        } catch (teamError) {
          console.error(`❌ Error processing ${teamName}:`, teamError.message);
          processedTeams++;
          // Continue processing other teams even if one fails
          continue;
        }
      }

      // Update progress for categorization step
      await interaction.editReply({
        content: `🧠 **Organizing content...**\nCategorizing updates into sections...`
      });

      // Generate categorized briefing using the same system as daily updates
      const briefingEmbed = await gptSummarizer.createCategorizedBriefing(teamDataArray, today);

      await interaction.editReply({
        content: null,
        embeds: [briefingEmbed]
      });

      console.log(`✅ Manual categorized briefing completed! Processed ${processedTeams} teams, generated ${teamDataArray.length} team summaries`);

    } catch (error) {
      console.error('❌ Error in updates command:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Briefing Error')
        .setDescription('An error occurred while generating the NFL briefing. Please try again later.')
        .setColor(0xFF0000)
        .setTimestamp();

      await interaction.editReply({
        content: null,
        embeds: [errorEmbed]
      });
    }
  },

  /**
   * Collect comprehensive data for a single team using BOTH SportsDB AND RSS
   * @param {string} teamName - Name of the team
   * @returns {Object} Comprehensive team data object
   */
  async collectComprehensiveTeamData(teamName) {
    try {
      let teamData = {
        team: teamName,
        summary: '',
        timelineData: [],
        nextEvents: [],
        lastEvents: [],
        rssItems: [],
        sources: []
      };

      // Step 1: ALWAYS try SportsDB data (games, events, timeline)
      try {
        console.log(`🏈 Collecting SportsDB data for: ${teamName}`);
        const sportsDbData = await sportsdb.getTeamUpdateData(teamName);
        
        if (sportsDbData && (sportsDbData.timelineData.length > 0 || sportsDbData.nextEvents.length > 0)) {
          // Generate summary using existing method
          const summary = await gptSummarizer.summarizeTeamUpdates(
            teamName,
            sportsDbData.timelineData,
            sportsDbData.nextEvents,
            sportsDbData.lastEvents
          );

          teamData.summary = summary;
          teamData.timelineData = sportsDbData.timelineData;
          teamData.nextEvents = sportsDbData.nextEvents;
          teamData.lastEvents = sportsDbData.lastEvents;
          teamData.sources.push('SportsDB');
          
          console.log(`✅ SportsDB data: ${sportsDbData.timelineData.length} timeline, ${sportsDbData.nextEvents.length} upcoming, ${sportsDbData.lastEvents.length} recent`);
        } else {
          console.log(`⚪ No SportsDB timeline/events for: ${teamName}`);
        }
      } catch (sportsDbError) {
        console.log(`⚠️ SportsDB failed for ${teamName}: ${sportsDbError.message}`);
      }

      // Step 2: ALWAYS try RSS data (injuries, roster moves, breaking news)
      try {
        console.log(`📰 Collecting RSS news data for: ${teamName}`);
        const rssItems = await fetchFallbackNews(teamName);
        
        if (rssItems.length > 0) {
          teamData.rssItems = rssItems.slice(0, 5); // Limit to top 5 news items
          teamData.sources.push('RSS News');
          
          console.log(`✅ RSS data: ${rssItems.length} news items found`);
          
          // Show sample RSS titles for debugging
          if (rssItems.length > 0) {
            console.log(`   📋 Sample news: "${rssItems[0].title?.substring(0, 60)}..."`);
          }
        } else {
          console.log(`⚪ No RSS news found for: ${teamName}`);
        }
      } catch (rssError) {
        console.log(`⚠️ RSS collection failed for ${teamName}: ${rssError.message}`);
      }

      // Step 3: Determine if we have meaningful data
      const hasData = teamData.timelineData.length > 0 || 
                     teamData.nextEvents.length > 0 || 
                     teamData.lastEvents.length > 0 || 
                     teamData.rssItems.length > 0;

      if (hasData) {
        // Create combined source attribution
        const sourceString = teamData.sources.length > 0 
          ? teamData.sources.join(' + ') 
          : 'Limited Data';
        
        teamData.source = sourceString;
        
        // If no summary from SportsDB but we have RSS, create basic summary
        if (!teamData.summary && teamData.rssItems.length > 0) {
          teamData.summary = `Recent news coverage and updates found for ${teamName}`;
        }
        
        console.log(`✅ Combined data collected for ${teamName} (${sourceString})`);
        return teamData;
      }

      console.log(`⚠️ No meaningful data found for ${teamName}`);
      return null;

    } catch (error) {
      console.error(`❌ Error collecting data for ${teamName}:`, error);
      return null;
    }
  },

  /**
   * Create formatted briefing embed with all team updates (legacy method - kept for compatibility)
   * @param {Array} teamUpdates - Array of team update objects
   * @param {string} date - Formatted date string
   * @param {number} processedTeams - Total teams processed
   * @param {number} successfulTeams - Teams with successful data fetch
   * @returns {EmbedBuilder} Formatted Discord embed
   */
  async createBriefingEmbed(teamUpdates, date, processedTeams, successfulTeams) {
    const embed = new EmbedBuilder()
      .setTitle('🟢 **NFL Daily Briefing**')
      .setColor(0x013369)
      .setTimestamp();

    if (teamUpdates.length === 0) {
      embed.setDescription(`**${date}**\n\nNo significant player updates found today across all monitored teams.\n\nAll teams showing normal activity.`);
      
      embed.addFields({
        name: '📊 Scan Results',
        value: `Processed: ${processedTeams} teams\nData retrieved: ${successfulTeams} teams`,
        inline: true
      });
    } else {
      // Set basic description
      embed.setDescription(`**${date}**\n\nFound significant updates for ${teamUpdates.length} teams:`);
      
      // Add each team's update as a separate field for better visibility
      teamUpdates.forEach((update, index) => {
        if (index < 10) { // Discord embed field limit
          embed.addFields({
            name: `🏈 ${update.team}`,
            value: update.summary.substring(0, 1024),
            inline: false
          });
        }
      });

      // Add summary stats
      embed.addFields(
        {
          name: '📊 Scan Results',
          value: `Processed: ${processedTeams} teams\nUpdates found: ${teamUpdates.length} teams`,
          inline: true
        },
        {
          name: '🕐 Generated',
          value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
          inline: true
        }
      );
    }

    // Add monitored teams list
    const teamsList = config.nflTeams.slice(0, 8).join(' • ') + 
      (config.nflTeams.length > 8 ? ` • +${config.nflTeams.length - 8} more` : '');
    
    embed.addFields({
      name: '🏈 Monitored Teams',
      value: teamsList,
      inline: false
    });

    embed.setFooter({
      text: 'Data from TheSportsDB • Powered by GPT-4',
      iconURL: 'https://cdn.discordapp.com/app-icons/1402059108995174431/f8d2b7a8e5c9c0c5c0c5c0c5c0c5c0c5.png'
    });

    return embed;
  },

  /**
   * Get quick status of current updates
   * Used for admin/debug purposes
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      commandName: 'updates',
      monitoredTeams: config.nflTeams.length,
      teamsListPreview: config.nflTeams.slice(0, 3),
      description: 'On-demand categorized NFL briefing for all monitored teams'
    };
  }
};