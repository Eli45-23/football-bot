const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const sportsdb = require('../api/sportsdb');
const gptSummarizer = require('../utils/gptSummarizer');
const { fetchFallbackNews } = require('../services/rssFallback');
const summarizer = require('../services/summarizer');
const { getCache, setCache } = require('../lib/cache');

/**
 * /player command - Display detailed NFL player information
 * Shows comprehensive player profile with interactive buttons for additional data
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('player')
    .setDescription('Search for detailed NFL player information and stats')
    .addStringOption(option =>
      option.setName('player_name')
        .setDescription('Player name (e.g., "Aaron Rodgers", "Travis Kelce")')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const playerName = interaction.options.getString('player_name');
    
    try {
      console.log(`🔍 Searching for player: ${playerName}`);
      
      // Search for the player
      const players = await sportsdb.searchPlayer(playerName);
      
      if (players.length === 0) {
        await interaction.editReply({
          content: `❌ Could not find NFL player "${playerName}". Try using the player's full name like "Aaron Rodgers" or "Tom Brady".`
        });
        return;
      }

      // Select the most relevant player (prefer current NFL players)
      let selectedPlayer = players[0];
      const currentNFLPlayers = players.filter(p => p.strTeam && p.strTeam.length > 0);
      if (currentNFLPlayers.length > 0) {
        selectedPlayer = currentNFLPlayers[0];
      }

      // Get detailed player information
      const [playerDetails, contracts, milestones, formerTeams] = await Promise.all([
        sportsdb.getPlayer(selectedPlayer.idPlayer),
        sportsdb.getPlayerContracts(selectedPlayer.idPlayer),
        sportsdb.getPlayerMilestones(selectedPlayer.idPlayer),
        sportsdb.getPlayerFormerTeams(selectedPlayer.idPlayer)
      ]);

      if (!playerDetails) {
        await interaction.editReply({
          content: `❌ Could not retrieve detailed information for ${selectedPlayer.strPlayer}.`
        });
        return;
      }

      // Generate AI-powered player summary
      const profileSummary = await gptSummarizer.summarizePlayerProfile(
        playerDetails, 
        contracts, 
        milestones
      );

      // Create main player embed
      const embed = new EmbedBuilder()
        .setTitle(`🏈 ${playerDetails.strPlayer}`)
        .setDescription(profileSummary)
        .setColor(0x013369);

      // Add player image
      if (playerDetails.strThumb || playerDetails.strCutout) {
        embed.setThumbnail(playerDetails.strThumb || playerDetails.strCutout);
      }

      // Add basic player information
      const fields = [];
      
      if (playerDetails.strTeam) {
        fields.push({
          name: '🏟️ Current Team',
          value: playerDetails.strTeam,
          inline: true
        });
      }

      if (playerDetails.strPosition) {
        fields.push({
          name: '📍 Position',
          value: playerDetails.strPosition,
          inline: true
        });
      }

      if (playerDetails.strNationality) {
        fields.push({
          name: '🌍 Nationality',
          value: playerDetails.strNationality,
          inline: true
        });
      }

      if (playerDetails.dateBorn) {
        const birthDate = new Date(playerDetails.dateBorn);
        const age = new Date().getFullYear() - birthDate.getFullYear();
        fields.push({
          name: '🎂 Age',
          value: `${age} (Born: ${birthDate.toLocaleDateString()})`,
          inline: true
        });
      }

      if (playerDetails.strHeight || playerDetails.strWeight) {
        const physicalStats = [
          playerDetails.strHeight ? `${playerDetails.strHeight}` : null,
          playerDetails.strWeight ? `${playerDetails.strWeight}` : null
        ].filter(Boolean).join(' • ');
        
        fields.push({
          name: '📏 Physical Stats',
          value: physicalStats,
          inline: true
        });
      }

      if (playerDetails.strWage) {
        fields.push({
          name: '💰 Salary',
          value: playerDetails.strWage,
          inline: true
        });
      }

      if (fields.length > 0) {
        embed.addFields(fields);
      }

      // Add player biography if available
      if (playerDetails.strDescriptionEN) {
        const bioText = playerDetails.strDescriptionEN.length > 800 
          ? playerDetails.strDescriptionEN.substring(0, 797) + '...'
          : playerDetails.strDescriptionEN;
        
        embed.addFields({
          name: '📖 Biography',
          value: bioText,
          inline: false
        });
      }

      // Create interactive buttons for additional data
      const buttons1 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`player_bio_${playerDetails.idPlayer}`)
            .setLabel('Bio')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📖'),
          new ButtonBuilder()
            .setCustomId(`player_contracts_${playerDetails.idPlayer}`)
            .setLabel('Contracts')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('💰'),
          new ButtonBuilder()
            .setCustomId(`player_milestones_${playerDetails.idPlayer}`)
            .setLabel('Milestones')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🏆')
        );

      const buttons2 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`player_teams_${playerDetails.idPlayer}`)
            .setLabel('Former Teams')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔄'),
          new ButtonBuilder()
            .setCustomId(`player_stats_${playerDetails.idPlayer}`)
            .setLabel('Career Stats')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📊')
        );

      // Add player fanart if available
      if (playerDetails.strFanart1) {
        embed.setImage(playerDetails.strFanart1);
      }

      embed.setFooter({
        text: `Player ID: ${playerDetails.idPlayer} • Data from TheSportsDB`,
        iconURL: interaction.client.user.displayAvatarURL()
      });

      await interaction.editReply({
        embeds: [embed],
        components: [buttons1, buttons2]
      });

      console.log(`✅ Successfully displayed profile for ${playerDetails.strPlayer}`);

    } catch (error) {
      console.error('❌ Error in player command:', error);
      await interaction.editReply({
        content: '❌ An error occurred while fetching player information. Please try again later.'
      });
    }
  },

  /**
   * Handle button interactions for player command
   * @param {Interaction} interaction - Discord button interaction
   */
  async handleButton(interaction) {
    const [action, type, playerId] = interaction.customId.split('_');
    
    if (action !== 'player') return false;

    await interaction.deferReply({ ephemeral: true });

    try {
      switch (type) {
        case 'bio':
          await this.handlePlayerBio(interaction, playerId);
          break;
        case 'contracts':
          await this.handlePlayerContracts(interaction, playerId);
          break;
        case 'milestones':
          await this.handlePlayerMilestones(interaction, playerId);
          break;
        case 'teams':
          await this.handleFormerTeams(interaction, playerId);
          break;
        case 'stats':
          await this.handleCareerStats(interaction, playerId);
          break;
        default:
          await interaction.editReply({ content: '❌ Unknown player action.' });
      }
    } catch (error) {
      console.error('❌ Error handling player button:', error);
      await interaction.editReply({ content: '❌ An error occurred processing your request.' });
    }

    return true;
  },

  /**
   * Display extended player biography
   */
  async handlePlayerBio(interaction, playerId) {
    const player = await sportsdb.getPlayer(playerId);
    
    if (!player) {
      await interaction.editReply({ content: '❌ Player information not available.' });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`📖 ${player.strPlayer} - Biography`)
      .setColor(0x013369);

    if (player.strThumb) {
      embed.setThumbnail(player.strThumb);
    }

    if (player.strDescriptionEN) {
      // Split long bio into multiple fields if needed
      const bioText = player.strDescriptionEN;
      if (bioText.length > 1024) {
        const part1 = bioText.substring(0, 1020) + '...';
        const part2 = '...' + bioText.substring(1020, 2044);
        
        embed.addFields(
          { name: 'Biography (Part 1)', value: part1, inline: false },
          { name: 'Biography (Part 2)', value: part2, inline: false }
        );
      } else {
        embed.addFields({ name: 'Biography', value: bioText, inline: false });
      }
    } else {
      embed.setDescription('No detailed biography available for this player.');
    }

    // Add additional bio details
    const bioFields = [];
    if (player.strBirthLocation) {
      bioFields.push({ name: '🏠 Birthplace', value: player.strBirthLocation, inline: true });
    }
    if (player.strGender) {
      bioFields.push({ name: '👤 Gender', value: player.strGender, inline: true });
    }
    if (player.strSide) {
      bioFields.push({ name: '👋 Throws/Kicks', value: player.strSide, inline: true });
    }

    if (bioFields.length > 0) {
      embed.addFields(bioFields);
    }

    await interaction.editReply({ embeds: [embed] });
  },

  /**
   * Display player contract information
   */
  async handlePlayerContracts(interaction, playerId) {
    const contracts = await sportsdb.getPlayerContracts(playerId);
    
    const embed = new EmbedBuilder()
      .setTitle('💰 Contract Information')
      .setColor(0x013369);

    if (contracts.length === 0) {
      embed.setDescription('No contract information available for this player.');
    } else {
      const contractInfo = contracts.slice(0, 8).map(contract => {
        const year = contract.strSeason || 'Unknown Year';
        const team = contract.strTeam || 'Unknown Team';
        const wage = contract.strWage || 'Undisclosed';
        return `**${year}** • ${team}\n💰 ${wage}`;
      }).join('\n\n');

      embed.setDescription(contractInfo);
    }

    embed.setFooter({ text: `Contracts found: ${contracts.length}` });

    await interaction.editReply({ embeds: [embed] });
  },

  /**
   * Display player milestones and achievements
   */
  async handlePlayerMilestones(interaction, playerId) {
    const milestones = await sportsdb.getPlayerMilestones(playerId);
    
    const embed = new EmbedBuilder()
      .setTitle('🏆 Career Milestones')
      .setColor(0x013369);

    if (milestones.length === 0) {
      embed.setDescription('No milestone information available for this player.');
    } else {
      const achievementsList = milestones.slice(0, 10).map(milestone => {
        const date = milestone.dateMilestone ? 
          new Date(milestone.dateMilestone).toLocaleDateString() : 'Unknown Date';
        const achievement = milestone.strMilestone || 'Achievement';
        return `**${date}** - ${achievement}`;
      }).join('\n');

      embed.setDescription(achievementsList);
    }

    embed.setFooter({ text: `Milestones found: ${milestones.length}` });

    await interaction.editReply({ embeds: [embed] });
  },

  /**
   * Display player's former teams
   */
  async handleFormerTeams(interaction, playerId) {
    const formerTeams = await sportsdb.getPlayerFormerTeams(playerId);
    
    const embed = new EmbedBuilder()
      .setTitle('🔄 Former Teams')
      .setColor(0x013369);

    if (formerTeams.length === 0) {
      embed.setDescription('No former team information available for this player.');
    } else {
      const teamsList = formerTeams.map(team => {
        const teamName = team.strFormerTeam || 'Unknown Team';
        const period = team.strMoved || 'Unknown Period';
        const joinedDate = team.strJoined || '';
        
        let teamInfo = `**${teamName}**`;
        if (period) teamInfo += `\n📅 ${period}`;
        if (joinedDate) teamInfo += `\n🔗 Joined: ${joinedDate}`;
        
        return teamInfo;
      }).join('\n\n');

      embed.setDescription(teamsList);
    }

    embed.setFooter({ text: `Former teams: ${formerTeams.length}` });

    await interaction.editReply({ embeds: [embed] });
  },

  /**
   * Display career statistics (placeholder - would need additional API endpoints)
   */
  async handleCareerStats(interaction, playerId) {
    const player = await sportsdb.getPlayer(playerId);
    
    const embed = new EmbedBuilder()
      .setTitle('📊 Career Statistics')
      .setColor(0x013369);

    if (!player) {
      embed.setDescription('Player statistics not available.');
    } else {
      // Basic player info as stats placeholder
      const statsFields = [];
      
      if (player.strPosition) {
        statsFields.push({ name: 'Position', value: player.strPosition, inline: true });
      }
      if (player.strTeam) {
        statsFields.push({ name: 'Current Team', value: player.strTeam, inline: true });
      }
      if (player.dateSigned) {
        statsFields.push({ name: 'Date Signed', value: new Date(player.dateSigned).toLocaleDateString(), inline: true });
      }
      if (player.strWage) {
        statsFields.push({ name: 'Salary', value: player.strWage, inline: true });
      }

      if (statsFields.length > 0) {
        embed.addFields(statsFields);
      } else {
        embed.setDescription('Detailed career statistics are not available through the current API.');
      }
      
      embed.addFields({
        name: '📝 Note',
        value: 'For detailed NFL statistics, visit official NFL.com or ESPN.com',
        inline: false
      });
    }

    await interaction.editReply({ embeds: [embed] });
  }
};