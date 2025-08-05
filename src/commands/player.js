const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const sportsDB = require('../services/sportsdb');
const ai = require('../services/ai');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('player')
    .setDescription('Search for detailed NFL player information')
    .addStringOption(option =>
      option.setName('name')
        .setDescription('Player name (e.g., "Aaron Rodgers", "Travis Kelce")')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const playerName = interaction.options.getString('name');
    
    try {
      const players = await sportsDB.searchPlayer(playerName);
      
      if (players.length === 0) {
        await interaction.editReply({
          content: `❌ Could not find NFL player "${playerName}". Try using the player's full name.`
        });
        return;
      }

      let selectedPlayer = players[0];
      
      if (players.length > 1) {
        const currentPlayers = players.filter(p => p.strTeam && p.strTeam !== '');
        if (currentPlayers.length > 0) {
          selectedPlayer = currentPlayers[0];
        }
      }

      const playerDetails = await sportsDB.getPlayerDetails(selectedPlayer.idPlayer);
      
      if (!playerDetails) {
        await interaction.editReply({
          content: `❌ Could not fetch detailed information for ${selectedPlayer.strPlayer}.`
        });
        return;
      }

      const playerInfo = sportsDB.formatPlayerInfo(playerDetails);
      const profileSummary = await ai.summarizePlayerProfile(playerInfo);

      const embed = new EmbedBuilder()
        .setTitle(`🏈 ${playerInfo.name}`)
        .setDescription(profileSummary)
        .setColor(0x013369);

      if (playerInfo.image) {
        embed.setThumbnail(playerInfo.image);
      }

      const fields = [];
      
      if (playerInfo.team) {
        fields.push({
          name: '🏟️ Current Team',
          value: playerInfo.team,
          inline: true
        });
      }

      if (playerInfo.position) {
        fields.push({
          name: '📍 Position',
          value: playerInfo.position,
          inline: true
        });
      }

      if (playerInfo.nationality) {
        fields.push({
          name: '🌍 Nationality',
          value: playerInfo.nationality,
          inline: true
        });
      }

      if (playerInfo.birthDate) {
        fields.push({
          name: '🎂 Born',
          value: new Date(playerInfo.birthDate).toLocaleDateString(),
          inline: true
        });
      }

      if (playerInfo.height || playerInfo.weight) {
        const physicalStats = [
          playerInfo.height ? `Height: ${playerInfo.height}` : null,
          playerInfo.weight ? `Weight: ${playerInfo.weight}` : null
        ].filter(Boolean).join('\n');
        
        fields.push({
          name: '📏 Physical Stats',
          value: physicalStats,
          inline: true
        });
      }

      if (fields.length > 0) {
        embed.addFields(fields);
      }

      if (playerInfo.description) {
        const description = playerInfo.description.length > 500 
          ? playerInfo.description.substring(0, 497) + '...'
          : playerInfo.description;
        
        embed.addFields({
          name: '📖 Biography',
          value: description,
          inline: false
        });
      }

      const buttons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`player_stats_${playerInfo.id}`)
            .setLabel('Career Stats')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📊'),
          new ButtonBuilder()
            .setCustomId(`player_contracts_${playerInfo.id}`)
            .setLabel('Contracts')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('💰'),
          new ButtonBuilder()
            .setCustomId(`player_teams_${playerInfo.id}`)
            .setLabel('Former Teams')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🔄')
        );

      const buttons2 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`player_milestones_${playerInfo.id}`)
            .setLabel('Milestones')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🏆'),
          new ButtonBuilder()
            .setCustomId(`player_results_${playerInfo.id}`)
            .setLabel('Recent Results')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📈')
        );

      if (playerInfo.fanart) {
        embed.setImage(playerInfo.fanart);
      }

      embed.setFooter({
        text: `Player ID: ${playerInfo.id} • Data from TheSportsDB`,
        iconURL: interaction.client.user.displayAvatarURL()
      });

      await interaction.editReply({
        embeds: [embed],
        components: [buttons, buttons2]
      });

    } catch (error) {
      console.error('Error in player command:', error);
      await interaction.editReply({
        content: '❌ An error occurred while fetching player information. Please try again later.'
      });
    }
  }
};