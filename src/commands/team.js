const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const sportsDB = require('../services/sportsdb');
const ai = require('../services/ai');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('team')
    .setDescription('Get current roster and information for an NFL team')
    .addStringOption(option =>
      option.setName('name')
        .setDescription('NFL team name (e.g., "Eagles", "Cowboys", "Giants")')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const teamName = interaction.options.getString('name');
    
    try {
      const team = await sportsDB.searchTeam(teamName);
      
      if (!team) {
        await interaction.editReply({
          content: `❌ Could not find NFL team "${teamName}". Try using full team names like "Philadelphia Eagles" or "Dallas Cowboys".`
        });
        return;
      }

      const teamInfo = sportsDB.formatTeamInfo(team);
      const players = await sportsDB.getTeamPlayers(teamInfo.id);
      
      if (players.length === 0) {
        await interaction.editReply({
          content: `❌ No player data found for ${teamInfo.name}.`
        });
        return;
      }

      const activePlayers = players.filter(p => p.strPlayer && p.strPosition).slice(0, 25);
      const rosterSummary = await ai.generateTeamRosterSummary(activePlayers, teamInfo.name);

      const embed = new EmbedBuilder()
        .setTitle(`🏈 ${teamInfo.name} - Active Roster`)
        .setDescription(rosterSummary)
        .setColor(0x013369)
        .setThumbnail(teamInfo.logo || teamInfo.badge)
        .addFields(
          {
            name: '🏟️ Stadium',
            value: `${teamInfo.stadium || 'N/A'}\n${teamInfo.location || ''}`.trim(),
            inline: true
          },
          {
            name: '📅 Founded',
            value: teamInfo.founded ? teamInfo.founded.toString() : 'N/A',
            inline: true
          },
          {
            name: '👥 Active Players',
            value: activePlayers.length.toString(),
            inline: true
          }
        );

      const playerList = activePlayers
        .slice(0, 20)
        .map(player => {
          const position = player.strPosition ? `**${player.strPosition}**` : '';
          return `${position} ${player.strPlayer}`;
        })
        .join('\n');

      if (playerList) {
        embed.addFields({
          name: '📋 Key Players',
          value: playerList.length > 1024 ? playerList.substring(0, 1021) + '...' : playerList,
          inline: false
        });
      }

      const buttons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`team_stats_${teamInfo.id}`)
            .setLabel('Team Stats')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📊'),
          new ButtonBuilder()
            .setCustomId(`team_schedule_${teamInfo.id}`)
            .setLabel('Schedule')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📅'),
          new ButtonBuilder()
            .setCustomId(`team_full_roster_${teamInfo.id}`)
            .setLabel('Full Roster')
            .setStyle(ButtonStyle.Success)
            .setEmoji('👥')
        );

      if (teamInfo.fanart) {
        embed.setImage(teamInfo.fanart);
      }

      embed.setFooter({
        text: `Use /player [name] for detailed player info • Data from TheSportsDB`,
        iconURL: interaction.client.user.displayAvatarURL()
      });

      await interaction.editReply({
        embeds: [embed],
        components: [buttons]
      });

    } catch (error) {
      console.error('Error in team command:', error);
      await interaction.editReply({
        content: '❌ An error occurred while fetching team information. Please try again later.'
      });
    }
  }
};