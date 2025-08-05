const { EmbedBuilder } = require('discord.js');
const sportsDB = require('./sportsdb');
const ai = require('./ai');
const config = require('../config');

class NFLUpdatesService {
  constructor(client) {
    this.client = client;
  }

  async generateDailyUpdate() {
    const updates = [];
    const today = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    console.log(`🔄 Starting daily NFL updates for ${today}...`);

    for (const teamConfig of config.nfl.teams) {
      try {
        console.log(`📡 Processing ${teamConfig.name}...`);
        
        const team = await sportsDB.searchTeam(teamConfig.searchName);
        if (!team) {
          console.warn(`⚠️ Could not find team: ${teamConfig.name}`);
          continue;
        }

        const teamInfo = sportsDB.formatTeamInfo(team);
        
        const [nextEvents, lastEvents] = await Promise.all([
          sportsDB.getTeamNextEvents(teamInfo.id),
          sportsDB.getTeamLastEvents(teamInfo.id)
        ]);

        const allEvents = [...nextEvents.slice(0, 2), ...lastEvents.slice(0, 2)];
        
        if (allEvents.length === 0) {
          console.log(`📝 No events found for ${teamConfig.name}`);
          continue;
        }

        let timelineData = [];
        for (const event of allEvents) {
          if (event.idEvent) {
            const timeline = await sportsDB.getEventTimeline(event.idEvent);
            timelineData = [...timelineData, ...timeline];
          }
        }

        if (timelineData.length > 0) {
          const summary = await ai.summarizeTimeline(teamConfig.name, timelineData);
          
          if (summary && summary !== 'No significant updates' && !summary.includes('API error')) {
            updates.push({
              team: teamConfig.name,
              summary: summary
            });
            console.log(`✅ Generated update for ${teamConfig.name}`);
          } else {
            console.log(`📝 No significant updates for ${teamConfig.name}`);
          }
        }

        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`❌ Error processing ${teamConfig.name}:`, error.message);
      }
    }

    return { updates, date: today };
  }

  async postDailyUpdate() {
    try {
      const { updates, date } = await this.generateDailyUpdate();

      if (!config.discord.nflUpdatesChannelId) {
        console.warn('⚠️ NFL_UPDATES_CHANNEL_ID not configured, logging updates to console');
        this.logUpdatesToConsole(updates, date);
        return;
      }

      const channel = await this.client.channels.fetch(config.discord.nflUpdatesChannelId);
      if (!channel) {
        console.error('❌ Could not find NFL updates channel');
        return;
      }

      if (updates.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle('🏈 NFL Daily Update')
          .setDescription(`**${date}**\n\nNo significant player updates or news found today for monitored teams.`)
          .setColor(0x013369)
          .setFooter({
            text: 'Use /team [name] or /player [name] for detailed information',
            iconURL: this.client.user.displayAvatarURL()
          })
          .setTimestamp();

        await channel.send({ embeds: [embed] });
        console.log('📤 Posted "no updates" message to Discord');
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('🏈 NFL Daily Update')
        .setDescription(`**${date}**\n\n${updates.map(update => update.summary).join('\n\n')}`)
        .setColor(0x013369)
        .setFooter({
          text: 'Use /team [name] or /player [name] for detailed breakdowns',
          iconURL: this.client.user.displayAvatarURL()
        })
        .setTimestamp();

      if (updates.length > 3) {
        embed.addFields({
          name: '📊 Teams Monitored',
          value: config.nfl.teams.map(t => t.name).join(' • '),
          inline: false
        });
      }

      await channel.send({ embeds: [embed] });
      console.log(`📤 Posted daily update to Discord with ${updates.length} team updates`);

    } catch (error) {
      console.error('❌ Error posting daily update:', error);
    }
  }

  logUpdatesToConsole(updates, date) {
    console.log('\n🏈 ===== NFL DAILY UPDATE =====');
    console.log(`📅 ${date}\n`);
    
    if (updates.length === 0) {
      console.log('📝 No significant updates found today.\n');
    } else {
      updates.forEach(update => {
        console.log(`${update.summary}\n`);
      });
    }
    
    console.log('===============================\n');
  }

  async testUpdate() {
    console.log('🧪 Running test update...');
    const { updates, date } = await this.generateDailyUpdate();
    this.logUpdatesToConsole(updates, date);
    return { updates, date };
  }
}

module.exports = NFLUpdatesService;