const { EmbedBuilder } = require('discord.js');
const sportsDB = require('../services/sportsdb');

class ButtonHandler {
  static async handleTeamButtons(interaction) {
    const [action, type, teamId] = interaction.customId.split('_');
    
    if (action !== 'team') return false;

    await interaction.deferReply({ ephemeral: true });

    try {
      switch (type) {
        case 'stats':
          await this.handleTeamStats(interaction, teamId);
          break;
        case 'schedule':
          await this.handleTeamSchedule(interaction, teamId);
          break;
        case 'full':
          await this.handleFullRoster(interaction, teamId);
          break;
        default:
          await interaction.editReply({ content: '❌ Unknown team action.' });
      }
    } catch (error) {
      console.error('Error handling team button:', error);
      await interaction.editReply({ content: '❌ An error occurred processing your request.' });
    }

    return true;
  }

  static async handlePlayerButtons(interaction) {
    const [action, type, playerId] = interaction.customId.split('_');
    
    if (action !== 'player') return false;

    await interaction.deferReply({ ephemeral: true });

    try {
      switch (type) {
        case 'stats':
          await this.handlePlayerStats(interaction, playerId);
          break;
        case 'contracts':
          await this.handlePlayerContracts(interaction, playerId);
          break;
        case 'teams':
          await this.handlePlayerFormerTeams(interaction, playerId);
          break;
        case 'milestones':
          await this.handlePlayerMilestones(interaction, playerId);
          break;
        case 'results':
          await this.handlePlayerResults(interaction, playerId);
          break;
        default:
          await interaction.editReply({ content: '❌ Unknown player action.' });
      }
    } catch (error) {
      console.error('Error handling player button:', error);
      await interaction.editReply({ content: '❌ An error occurred processing your request.' });
    }

    return true;
  }

  static async handleTeamStats(interaction, teamId) {
    const nextEvents = await sportsDB.getTeamNextEvents(teamId);
    const lastEvents = await sportsDB.getTeamLastEvents(teamId);

    const embed = new EmbedBuilder()
      .setTitle('📊 Team Schedule & Recent Games')
      .setColor(0x013369);

    if (nextEvents.length > 0) {
      const upcoming = nextEvents.slice(0, 5).map(event => {
        const date = new Date(event.dateEvent).toLocaleDateString();
        const opponent = event.strAwayTeam === event.strHomeTeam ? 'vs TBD' : 
          event.strHomeTeam.includes(teamId) ? `vs ${event.strAwayTeam}` : `@ ${event.strHomeTeam}`;
        return `${date} - ${opponent}`;
      }).join('\n');

      embed.addFields({
        name: '📅 Upcoming Games',
        value: upcoming || 'No upcoming games scheduled',
        inline: false
      });
    }

    if (lastEvents.length > 0) {
      const recent = lastEvents.slice(0, 5).map(event => {
        const date = new Date(event.dateEvent).toLocaleDateString();
        const score = event.intHomeScore && event.intAwayScore ? 
          `${event.intHomeScore}-${event.intAwayScore}` : 'Score N/A';
        return `${date} - ${score}`;
      }).join('\n');

      embed.addFields({
        name: '📈 Recent Games',
        value: recent || 'No recent games found',
        inline: false
      });
    }

    if (nextEvents.length === 0 && lastEvents.length === 0) {
      embed.setDescription('No schedule information available for this team.');
    }

    await interaction.editReply({ embeds: [embed] });
  }

  static async handleTeamSchedule(interaction, teamId) {
    const nextEvents = await sportsDB.getTeamNextEvents(teamId);
    
    const embed = new EmbedBuilder()
      .setTitle('📅 Team Schedule')
      .setColor(0x013369);

    if (nextEvents.length === 0) {
      embed.setDescription('No upcoming games scheduled.');
    } else {
      const schedule = nextEvents.slice(0, 10).map(event => {
        const date = new Date(event.dateEvent);
        const dateStr = date.toLocaleDateString();
        const timeStr = event.strTime || '';
        const opponent = event.strAwayTeam === event.strHomeTeam ? 'vs TBD' : 
          event.strHomeTeam.includes(teamId) ? `vs ${event.strAwayTeam}` : `@ ${event.strHomeTeam}`;
        return `**${dateStr}** ${timeStr}\n${opponent}`;
      }).join('\n\n');

      embed.setDescription(schedule);
    }

    await interaction.editReply({ embeds: [embed] });
  }

  static async handleFullRoster(interaction, teamId) {
    const players = await sportsDB.getTeamPlayers(teamId);
    
    const embed = new EmbedBuilder()
      .setTitle('👥 Full Team Roster')
      .setColor(0x013369);

    if (players.length === 0) {
      embed.setDescription('No roster information available.');
    } else {
      const playersByPosition = {};
      
      players.forEach(player => {
        if (!player.strPlayer) return;
        const position = player.strPosition || 'Unknown';
        if (!playersByPosition[position]) {
          playersByPosition[position] = [];
        }
        playersByPosition[position].push(player.strPlayer);
      });

      Object.entries(playersByPosition).forEach(([position, playerList]) => {
        if (playerList.length > 0) {
          const players = playerList.slice(0, 10).join('\n');
          embed.addFields({
            name: position,
            value: players,
            inline: true
          });
        }
      });
    }

    await interaction.editReply({ embeds: [embed] });
  }

  static async handlePlayerStats(interaction, playerId) {
    const results = await sportsDB.getPlayerResults(playerId);
    
    const embed = new EmbedBuilder()
      .setTitle('📊 Player Career Stats')
      .setColor(0x013369);

    if (results.length === 0) {
      embed.setDescription('No career statistics available for this player.');
    } else {
      const stats = results.slice(0, 10).map(result => {
        const date = result.dateEvent ? new Date(result.dateEvent).toLocaleDateString() : 'N/A';
        const event = result.strEvent || 'Game';
        return `**${date}** - ${event}`;
      }).join('\n');

      embed.setDescription(stats);
    }

    await interaction.editReply({ embeds: [embed] });
  }

  static async handlePlayerContracts(interaction, playerId) {
    const contracts = await sportsDB.getPlayerContracts(playerId);
    
    const embed = new EmbedBuilder()
      .setTitle('💰 Player Contracts')
      .setColor(0x013369);

    if (contracts.length === 0) {
      embed.setDescription('No contract information available for this player.');
    } else {
      const contractInfo = contracts.slice(0, 5).map(contract => {
        const year = contract.strSeason || 'Unknown';
        const team = contract.strTeam || 'Unknown Team';
        const value = contract.strWage || 'Undisclosed';
        return `**${year}** - ${team}\nValue: ${value}`;
      }).join('\n\n');

      embed.setDescription(contractInfo);
    }

    await interaction.editReply({ embeds: [embed] });
  }

  static async handlePlayerFormerTeams(interaction, playerId) {
    const formerTeams = await sportsDB.getPlayerFormerTeams(playerId);
    
    const embed = new EmbedBuilder()
      .setTitle('🔄 Former Teams')
      .setColor(0x013369);

    if (formerTeams.length === 0) {
      embed.setDescription('No former team information available for this player.');
    } else {
      const teams = formerTeams.map(team => {
        const teamName = team.strFormerTeam || 'Unknown Team';
        const years = team.strMoved || 'Unknown Period';
        return `**${teamName}** (${years})`;
      }).join('\n');

      embed.setDescription(teams);
    }

    await interaction.editReply({ embeds: [embed] });
  }

  static async handlePlayerMilestones(interaction, playerId) {
    const milestones = await sportsDB.getPlayerMilestones(playerId);
    
    const embed = new EmbedBuilder()
      .setTitle('🏆 Career Milestones')
      .setColor(0x013369);

    if (milestones.length === 0) {
      embed.setDescription('No milestone information available for this player.');
    } else {
      const achievements = milestones.slice(0, 10).map(milestone => {
        const date = milestone.dateMilestone ? new Date(milestone.dateMilestone).toLocaleDateString() : 'N/A';
        const achievement = milestone.strMilestone || 'Achievement';
        return `**${date}** - ${achievement}`;
      }).join('\n');

      embed.setDescription(achievements);
    }

    await interaction.editReply({ embeds: [embed] });
  }

  static async handlePlayerResults(interaction, playerId) {
    const results = await sportsDB.getPlayerResults(playerId);
    
    const embed = new EmbedBuilder()
      .setTitle('📈 Recent Performance')
      .setColor(0x013369);

    if (results.length === 0) {
      embed.setDescription('No recent performance data available for this player.');
    } else {
      const performance = results.slice(0, 8).map(result => {
        const date = result.dateEvent ? new Date(result.dateEvent).toLocaleDateString() : 'N/A';
        const event = result.strEvent || 'Game';
        const result_text = result.strResult || 'Result N/A';
        return `**${date}** - ${event}\n${result_text}`;
      }).join('\n\n');

      embed.setDescription(performance);
    }

    await interaction.editReply({ embeds: [embed] });
  }
}

module.exports = ButtonHandler;