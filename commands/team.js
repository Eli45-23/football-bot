const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const sportsdb = require('../api/sportsdb');
const gptSummarizer = require('../utils/gptSummarizer');
const { fetchFallbackNews } = require('../services/rssFallback');
const summarizer = require('../services/summarizer');
const { getCache, setCache } = require('../lib/cache');

/**
 * /team command - Display NFL team roster and information
 * Shows current roster with interactive buttons for detailed player info
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('team')
    .setDescription('Get current roster and information for an NFL team')
    .addStringOption(option =>
      option.setName('team_name')
        .setDescription('NFL team name (e.g., "Dallas Cowboys", "Eagles")')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const teamName = interaction.options.getString('team_name');
    const cacheKey = `team:${teamName.toLowerCase()}:data`;
    
    try {
      console.log(`🔍 Looking up team: ${teamName}`);
      
      // Check cache first
      const cached = await getCache(cacheKey);
      if (cached) {
        console.log(`💾 Using cached team data for: ${teamName}`);
        await this.renderTeamEmbed(interaction, cached.team, cached.players, cached.summary, 'Cached');
        return;
      }
      
      // Step 1: Try SportsDB first
      console.log(`🏈 Attempting SportsDB lookup for team: ${teamName}`);
      const team = await sportsdb.searchTeam(teamName);
      
      if (!team) {
        // Step 2: If no team found, try RSS fallback for team info
        console.log(`📰 Team not found in SportsDB, trying RSS fallback for: ${teamName}`);
        await this.handleTeamNotFound(interaction, teamName);
        return;
      }

      // Step 2: Get team roster from SportsDB
      console.log(`📋 Fetching roster for: ${team.strTeam}`);
      const players = await sportsdb.getTeamPlayers(team.idTeam);
      
      if (players.length === 0) {
        // Step 3: If no roster data, try RSS fallback for team news
        console.log(`📰 No roster data found, trying RSS fallback for team info: ${team.strTeam}`);
        await this.handleNoRosterData(interaction, team);
        return;
      }

      // Filter and organize players by position
      const activePlayers = players.filter(p => p.strPlayer && p.strPosition);
      const playersByPosition = {};
      
      activePlayers.forEach(player => {
        const position = player.strPosition;
        if (!playersByPosition[position]) {
          playersByPosition[position] = [];
        }
        playersByPosition[position].push(player);
      });

      // Generate roster summary using GPT-4
      const rosterSummary = await gptSummarizer.summarizeTeamRoster(team.strTeam, activePlayers);

      // Create main embed
      const embed = new EmbedBuilder()
        .setTitle(`🏈 ${team.strTeam}`)
        .setDescription(rosterSummary)
        .setColor(0x013369)
        .setThumbnail(team.strTeamBadge || team.strTeamLogo)
        .addFields(
          {
            name: '🏟️ Stadium',
            value: team.strStadium || 'N/A',
            inline: true
          },
          {
            name: '📍 Location',
            value: team.strStadiumLocation || 'N/A',
            inline: true
          },
          {
            name: '📅 Founded',
            value: team.intFormedYear ? team.intFormedYear.toString() : 'N/A',
            inline: true
          },
          {
            name: '👥 Active Roster',
            value: activePlayers.length.toString(),
            inline: true
          },
          {
            name: '🏆 League',
            value: team.strLeague || 'NFL',
            inline: true
          },
          {
            name: '🌐 Division',
            value: team.strDivision || 'N/A',
            inline: true
          }
        );

      // Add key positions to embed
      const keyPositions = ['QB', 'RB', 'WR', 'TE', 'K'];
      keyPositions.forEach(position => {
        if (playersByPosition[position]) {
          const playersAtPosition = playersByPosition[position]
            .slice(0, 5) // Limit to prevent embed size issues
            .map(p => p.strPlayer)
            .join('\n');
          
          if (playersAtPosition) {
            embed.addFields({
              name: `${position}`,
              value: playersAtPosition,
              inline: true
            });
          }
        }
      });

      // Create interactive buttons
      const buttons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`team_roster_${team.idTeam}`)
            .setLabel('Full Roster')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('👥'),
          new ButtonBuilder()
            .setCustomId(`team_schedule_${team.idTeam}`)
            .setLabel('Schedule')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📅'),
          new ButtonBuilder()
            .setCustomId(`team_stats_${team.idTeam}`)
            .setLabel('Team Stats')
            .setStyle(ButtonStyle.Success)
            .setEmoji('📊')
        );

      // Add team image if available
      if (team.strTeamFanart1) {
        embed.setImage(team.strTeamFanart1);
      }

      // Cache the successful result
      const cacheData = {
        team,
        players: activePlayers,
        summary: rosterSummary
      };
      await setCache(cacheKey, cacheData, 30); // Cache for 30 minutes

      embed.setFooter({
        text: `Source: SportsDB • Team ID: ${team.idTeam} • Use /player [name] for detailed player info`,
        iconURL: interaction.client.user.displayAvatarURL()
      });

      await interaction.editReply({
        embeds: [embed],
        components: [buttons]
      });

      console.log(`✅ Successfully displayed ${team.strTeam} roster with ${activePlayers.length} players (SportsDB)`);

    } catch (error) {
      console.error('❌ Error in team command:', error);
      await interaction.editReply({
        content: '❌ An error occurred while fetching team information. Please try again later.'
      });
    }
  },

  /**
   * Handle case when team is not found in SportsDB
   * @param {Interaction} interaction - Discord interaction
   * @param {string} teamName - Team name to search for
   */
  async handleTeamNotFound(interaction, teamName) {
    try {
      console.log(`📰 Searching RSS feeds for team info: ${teamName}`);
      const newsItems = await fetchFallbackNews(teamName);
      
      if (newsItems.length > 0) {
        const summary = await summarizer.summarizeFromRSS({
          subject: teamName,
          items: newsItems.slice(0, 5)
        });
        
        const embed = new EmbedBuilder()
          .setTitle(`🏈 ${teamName} - News Summary`)
          .setDescription(summary || 'Found some news items but no clear team information.')
          .setColor(0xFFA500)
          .addFields({
            name: '📰 Recent News',
            value: `Found ${newsItems.length} recent news items`,
            inline: true
          })
          .setFooter({
            text: 'Source: RSS Fallback • Team not found in official database',
            iconURL: interaction.client.user.displayAvatarURL()
          })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.editReply({
          content: `❌ Could not find NFL team "${teamName}" in official database or news sources. Try using full team names like "Dallas Cowboys" or "Philadelphia Eagles".`
        });
      }
    } catch (error) {
      console.error('❌ Error in RSS fallback:', error);
      await interaction.editReply({
        content: `❌ Could not find NFL team "${teamName}". Try using full team names like "Dallas Cowboys" or "Philadelphia Eagles".`
      });
    }
  },

  /**
   * Handle case when roster data is not available
   * @param {Interaction} interaction - Discord interaction
   * @param {Object} team - Team object from SportsDB
   */
  async handleNoRosterData(interaction, team) {
    try {
      console.log(`📰 No roster data, fetching news for: ${team.strTeam}`);
      const newsItems = await fetchFallbackNews(team.strTeam);
      
      const summary = await summarizer.summarizeFromRSS({
        subject: team.strTeam,
        items: newsItems.slice(0, 8)
      });
      
      const embed = new EmbedBuilder()
        .setTitle(`🏈 ${team.strTeam}`)
        .setDescription(summary || 'Official roster data not available.')
        .setColor(0xFFA500)
        .setThumbnail(team.strTeamBadge || team.strTeamLogo)
        .addFields(
          {
            name: '🏟️ Stadium',
            value: team.strStadium || 'N/A',
            inline: true
          },
          {
            name: '📍 Location',
            value: team.strStadiumLocation || 'N/A',
            inline: true
          },
          {
            name: '📰 News Items',
            value: `${newsItems.length} recent updates`,
            inline: true
          }
        )
        .setFooter({
          text: `Source: RSS Fallback • Official roster data unavailable`,
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      console.log(`✅ Displayed ${team.strTeam} info with RSS fallback`);
    } catch (error) {
      console.error('❌ Error in roster fallback:', error);
      await interaction.editReply({
        content: `❌ No roster data found for ${team.strTeam} and fallback sources failed.`
      });
    }
  },

  /**
   * Render team embed with source attribution
   * @param {Interaction} interaction - Discord interaction
   * @param {Object} team - Team data
   * @param {Array} players - Player array
   * @param {string} summary - GPT summary
   * @param {string} source - Data source
   */
  async renderTeamEmbed(interaction, team, players, summary, source) {
    const playersByPosition = {};
    players.forEach(player => {
      const position = player.strPosition;
      if (!playersByPosition[position]) {
        playersByPosition[position] = [];
      }
      playersByPosition[position].push(player);
    });

    const embed = new EmbedBuilder()
      .setTitle(`🏈 ${team.strTeam}`)
      .setDescription(summary)
      .setColor(0x013369)
      .setThumbnail(team.strTeamBadge || team.strTeamLogo);

    // Add basic team info
    embed.addFields(
      {
        name: '🏟️ Stadium',
        value: team.strStadium || 'N/A',
        inline: true
      },
      {
        name: '👥 Active Roster',
        value: players.length.toString(),
        inline: true
      },
      {
        name: '🏆 League',
        value: team.strLeague || 'NFL',
        inline: true
      }
    );

    embed.setFooter({
      text: `Source: ${source} • Team ID: ${team.idTeam}`,
      iconURL: interaction.client.user.displayAvatarURL()
    });

    await interaction.editReply({ embeds: [embed] });
  },

  /**
   * Handle button interactions for team command
   * @param {Interaction} interaction - Discord button interaction
   */
  async handleButton(interaction) {
    const [action, type, teamId] = interaction.customId.split('_');
    
    if (action !== 'team') return false;

    await interaction.deferReply({ ephemeral: true });

    try {
      switch (type) {
        case 'roster':
          await this.handleFullRoster(interaction, teamId);
          break;
        case 'schedule':
          await this.handleSchedule(interaction, teamId);
          break;
        case 'stats':
          await this.handleTeamStats(interaction, teamId);
          break;
        default:
          await interaction.editReply({ content: '❌ Unknown team action.' });
      }
    } catch (error) {
      console.error('❌ Error handling team button:', error);
      await interaction.editReply({ content: '❌ An error occurred processing your request.' });
    }

    return true;
  },

  /**
   * Display complete team roster organized by position
   */
  async handleFullRoster(interaction, teamId) {
    const players = await sportsdb.getTeamPlayers(teamId);
    
    if (players.length === 0) {
      await interaction.editReply({ content: '❌ No roster data available.' });
      return;
    }

    // Organize by position
    const playersByPosition = {};
    players.filter(p => p.strPlayer && p.strPosition).forEach(player => {
      const position = player.strPosition;
      if (!playersByPosition[position]) {
        playersByPosition[position] = [];
      }
      playersByPosition[position].push(player.strPlayer);
    });

    const embed = new EmbedBuilder()
      .setTitle('👥 Complete Team Roster')
      .setColor(0x013369);

    // Add fields for each position
    Object.entries(playersByPosition).forEach(([position, playerNames]) => {
      if (playerNames.length > 0) {
        embed.addFields({
          name: position,
          value: playerNames.slice(0, 10).join('\n') || 'No players',
          inline: true
        });
      }
    });

    embed.setFooter({ text: `Total Players: ${players.length}` });

    await interaction.editReply({ embeds: [embed] });
  },

  /**
   * Display team schedule (upcoming and recent games)
   */
  async handleSchedule(interaction, teamId) {
    const [nextEvents, lastEvents] = await Promise.all([
      sportsdb.getNextEvents(teamId),
      sportsdb.getLastEvents(teamId)
    ]);

    const embed = new EmbedBuilder()
      .setTitle('📅 Team Schedule')
      .setColor(0x013369);

    if (nextEvents.length > 0) {
      const upcoming = nextEvents.slice(0, 5).map(event => {
        const date = event.dateEvent ? new Date(event.dateEvent).toLocaleDateString() : 'TBD';
        const opponent = event.strAwayTeam || event.strHomeTeam || 'TBD';
        return `**${date}** vs ${opponent}`;
      }).join('\n');

      embed.addFields({
        name: '⏭️ Upcoming Games',
        value: upcoming || 'No upcoming games scheduled',
        inline: false
      });
    }

    if (lastEvents.length > 0) {
      const recent = lastEvents.slice(0, 5).map(event => {
        const date = event.dateEvent ? new Date(event.dateEvent).toLocaleDateString() : 'Unknown';
        const score = event.intHomeScore && event.intAwayScore ? 
          `${event.intHomeScore}-${event.intAwayScore}` : 'Final';
        return `**${date}** - ${score}`;
      }).join('\n');

      embed.addFields({
        name: '📈 Recent Games',
        value: recent || 'No recent games found',
        inline: false
      });
    }

    if (nextEvents.length === 0 && lastEvents.length === 0) {
      embed.setDescription('No schedule information available.');
    }

    await interaction.editReply({ embeds: [embed] });
  },

  /**
   * Display team statistics and performance data
   */
  async handleTeamStats(interaction, teamId) {
    const [nextEvents, lastEvents] = await Promise.all([
      sportsdb.getNextEvents(teamId),
      sportsdb.getLastEvents(teamId)
    ]);

    const embed = new EmbedBuilder()
      .setTitle('📊 Team Statistics')
      .setColor(0x013369);

    // Calculate basic stats from available data
    const recentGames = lastEvents.slice(0, 10);
    const wins = recentGames.filter(game => 
      game.intHomeScore && game.intAwayScore && 
      parseInt(game.intHomeScore) > parseInt(game.intAwayScore)
    ).length;
    
    embed.addFields(
      {
        name: '🎯 Recent Performance',
        value: `${wins} wins in last ${recentGames.length} games`,
        inline: true
      },
      {
        name: '📅 Upcoming Games',
        value: nextEvents.length.toString(),
        inline: true
      },
      {
        name: '📈 Season Status',
        value: 'Active',
        inline: true
      }
    );

    if (recentGames.length > 0) {
      const lastGame = recentGames[0];
      embed.addFields({
        name: '🏈 Last Game',
        value: `${lastGame.strEvent || 'Recent Game'}\nScore: ${lastGame.intHomeScore || '?'}-${lastGame.intAwayScore || '?'}`,
        inline: false
      });
    }

    await interaction.editReply({ embeds: [embed] });
  }
};