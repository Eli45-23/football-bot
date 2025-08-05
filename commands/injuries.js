const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const injuryService = require('../services/injuryService');

/**
 * /injuries command - Get latest injury reports and roster changes
 * Focuses specifically on injuries, DNPs, roster moves, and practice reports
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('injuries')
    .setDescription('Get latest NFL injury reports and roster changes')
    .addStringOption(option =>
      option.setName('target')
        .setDescription('Team name (e.g., "eagles") or "all" for league-wide updates')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const target = interaction.options.getString('target').toLowerCase();

    try {
      console.log(`🏥 Injury report request for: ${target}`);
      
      let injuryData;
      
      if (target === 'all' || target === 'league') {
        // Get league-wide injury updates
        injuryData = await injuryService.getLeagueInjuries();
      } else {
        // Get team-specific injury updates
        injuryData = await injuryService.getTeamInjuries(target);
      }
      
      // Create injury report embed
      const embed = new EmbedBuilder()
        .setTitle(injuryData.title)
        .setColor(injuryData.severity === 'high' ? 0xFF0000 : 
                  injuryData.severity === 'medium' ? 0xFFA500 : 0x00FF00)
        .setFooter({
          text: `Source: ${injuryData.source} • Updated: ${new Date(injuryData.lastUpdated).toLocaleTimeString()}`,
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();

      // Add team logo if available
      if (injuryData.teamData?.logo) {
        embed.setThumbnail(injuryData.teamData.logo);
      }

      // Format injury report sections
      if (injuryData.injuries && injuryData.injuries.length > 0) {
        embed.addFields({
          name: '🏥 Injury Report',
          value: injuryData.injuries.join('\n').substring(0, 1024) || 'No injuries reported',
          inline: false
        });
      }

      if (injuryData.rosterMoves && injuryData.rosterMoves.length > 0) {
        embed.addFields({
          name: '🔄 Roster Moves',
          value: injuryData.rosterMoves.join('\n').substring(0, 1024) || 'No roster moves',
          inline: false
        });
      }

      if (injuryData.practiceReport && injuryData.practiceReport.length > 0) {
        embed.addFields({
          name: '📋 Practice Report',
          value: injuryData.practiceReport.join('\n').substring(0, 1024) || 'No practice report',
          inline: false
        });
      }

      // Show uncategorized items if any (to catch items we might have missed)
      if (injuryData.uncategorized && injuryData.uncategorized.length > 0) {
        embed.addFields({
          name: '📄 Additional Updates',
          value: injuryData.uncategorized.join('\n').substring(0, 1024),
          inline: false
        });
      }

      // Add injury summary
      if (injuryData.summary) {
        embed.setDescription(injuryData.summary);
      }

      // Show full GPT report if available and has content
      if (injuryData.fullReport && 
          injuryData.fullReport.length > 10 && 
          !injuryData.fullReport.includes('No injury updates found')) {
        const reportText = injuryData.fullReport.substring(0, 1024);
        embed.addFields({
          name: '📋 Detailed Report',
          value: reportText,
          inline: false
        });
      }

      // Add data source info
      if (injuryData.itemCount) {
        embed.addFields({
          name: '📊 Data Sources',
          value: `Analyzed ${injuryData.itemCount} recent reports`,
          inline: true
        });
      }

      // Add helpful tips for no data
      if (injuryData.error || (!injuryData.injuries?.length && !injuryData.rosterMoves?.length)) {
        embed.addFields({
          name: '💡 Tips',
          value: '• Try a different team name\n• Use "all" for league-wide updates\n• Check back later for new reports',
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });
      console.log(`✅ Injury report delivered for "${target}" (source: ${injuryData.source})`);

    } catch (error) {
      console.error('❌ Error in injuries command:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Injury Report Error')
        .setDescription('An error occurred while fetching injury reports. Please try again later.')
        .setColor(0xFF0000)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};