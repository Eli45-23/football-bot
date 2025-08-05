const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getStatus } = require('../services/statusService');

/**
 * /status command - Get current status for NFL team or player
 * Intelligently detects whether input is a team or player and provides targeted updates
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Get current injury/roster status for an NFL team or player')
    .addStringOption(option =>
      option.setName('target')
        .setDescription('Team name (e.g., "eagles") or player name (e.g., "aaron rodgers")')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const target = interaction.options.getString('target');

    try {
      console.log(`🔍 Status request for: ${target}`);
      
      // Use the new resilient status service with fallback chain
      const statusResult = await getStatus(target);
      
      // Create Discord embed from status result
      const embed = new EmbedBuilder()
        .setTitle(statusResult.title)
        .setColor(statusResult.error ? 0xFF0000 : 
                  statusResult.source === 'SportsDB' ? 0x013369 :
                  statusResult.source === 'RSS fallback' ? 0xFFA500 : 0x808080)
        .setFooter({
          text: `Source: ${statusResult.source} • Last updated: ${new Date(statusResult.lastUpdated).toLocaleTimeString()}`,
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();

      // Add full status report as main field (not description to avoid length limits)
      if (statusResult.summary && statusResult.summary.length > 0) {
        embed.addFields({
          name: '📋 Status Report',
          value: statusResult.summary.substring(0, 1024),
          inline: false
        });
      }

      // Add team/player specific data if available
      if (statusResult.teamData) {
        if (statusResult.teamData.logo) {
          embed.setThumbnail(statusResult.teamData.logo);
        }
        embed.addFields({
          name: '🏟️ Team Info',
          value: `ID: ${statusResult.teamData.id}\nName: ${statusResult.teamData.name}`,
          inline: true
        });
      }

      if (statusResult.playerData) {
        if (statusResult.playerData.image) {
          embed.setThumbnail(statusResult.playerData.image);
        }
        const playerInfo = [];
        if (statusResult.playerData.team) playerInfo.push(`Team: ${statusResult.playerData.team}`);
        if (statusResult.playerData.position) playerInfo.push(`Position: ${statusResult.playerData.position}`);
        
        if (playerInfo.length > 0) {
          embed.addFields({
            name: '👤 Player Info',
            value: playerInfo.join('\n'),
            inline: true
          });
        }
      }

      // Add RSS item count for fallback sources
      if (statusResult.rssItemCount) {
        embed.addFields({
          name: '📰 News Sources',
          value: `Found ${statusResult.rssItemCount} relevant news items`,
          inline: true
        });
      }

      // Add helpful suggestions for errors
      if (statusResult.error && statusResult.source === 'Search Failed') {
        embed.addFields({
          name: '💡 Try these formats:',
          value: '• Team: `eagles`, `dallas cowboys`, `patriots`\n• Player: `aaron rodgers`, `travis kelce`, `aj brown`',
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });
      console.log(`✅ Status delivered for "${target}" (source: ${statusResult.source})`);

    } catch (error) {
      console.error('❌ Error in status command:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Status Error')
        .setDescription('An unexpected error occurred while fetching status information. Please try again later.')
        .setColor(0xFF0000)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};