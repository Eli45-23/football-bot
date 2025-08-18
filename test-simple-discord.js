const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const config = require('./config/config.js');

async function testSimpleDiscordPost() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });

  client.on('ready', async () => {
    console.log(`✅ Bot ready! Logged in as ${client.user.tag}`);
    console.log(`🔍 Channel ID: ${config.discord.nflUpdatesChannelId}`);
    
    try {
      // Test channel access first
      const channel = await client.channels.fetch(config.discord.nflUpdatesChannelId);
      console.log(`✅ Channel found: ${channel.name}`);
      
      // Create simple test NFL data like the real updater would create
      const nflData = {
        injuries: {
          bullets: ['Player A (hamstring) expected to miss 2-3 weeks', 'Player B dealing with knee soreness'],
          totalCount: 2,
          overflow: 0
        },
        rosterChanges: {
          bullets: ['Team X signs WR John Doe', 'Team Y places CB Jane Smith on IR'],
          totalCount: 2,
          overflow: 0
        },
        scheduledGames: {
          bullets: ['Today 8:00 PM EDT: Cincinnati Bengals @ Washington Commanders', 'Thu 8/21: Pittsburgh Steelers @ Carolina Panthers'],
          totalCount: 2,
          overflow: 0
        },
        breakingNews: {
          bullets: ['Breaking: Trade completed between two teams', 'Report: Star player expected back soon'],
          totalCount: 2,
          overflow: 0
        },
        sourcesLine: '🗂 Sources: TheSportsDB, ESPN, NFL.com'
      };
      
      console.log('\n🧪 Testing Discord posting with sample NFL data...');
      
      // Create and post header embed
      const headerEmbed = new EmbedBuilder()
        .setTitle('📢 NFL Test Update – Aug 18, 10:59 AM EDT')
        .setDescription('🧪 This is a test update to verify Discord posting works\n\n📅 Schedule: League mode • Window: 7 days\n🤖 AI polish: **OFF** (rule-based categorization)')
        .setColor(0x013369)
        .setTimestamp();
      
      await channel.send({ embeds: [headerEmbed] });
      console.log('✅ Posted header embed');
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Post injuries section
      const injuriesEmbed = new EmbedBuilder()
        .setTitle('🏥 Injuries (2)')
        .setDescription(nflData.injuries.bullets.join('\n'))
        .setColor(0x013369);
      
      await channel.send({ embeds: [injuriesEmbed] });
      console.log('✅ Posted injuries embed');
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Post roster changes section
      const rosterEmbed = new EmbedBuilder()
        .setTitle('🔁 Roster Changes (2)')
        .setDescription(nflData.rosterChanges.bullets.join('\n'))
        .setColor(0x013369);
      
      await channel.send({ embeds: [rosterEmbed] });
      console.log('✅ Posted roster changes embed');
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Post scheduled games section
      const gamesEmbed = new EmbedBuilder()
        .setTitle('📅 Scheduled Games (2)')
        .setDescription(nflData.scheduledGames.bullets.join('\n'))
        .setColor(0x013369);
      
      await channel.send({ embeds: [gamesEmbed] });
      console.log('✅ Posted scheduled games embed');
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Post breaking news section
      const newsEmbed = new EmbedBuilder()
        .setTitle('📰 Breaking News (2)')
        .setDescription(nflData.breakingNews.bullets.join('\n'))
        .setColor(0x013369);
      
      await channel.send({ embeds: [newsEmbed] });
      console.log('✅ Posted breaking news embed');
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Post footer
      const footerEmbed = new EmbedBuilder()
        .setDescription(nflData.sourcesLine)
        .setColor(0x013369);
      
      await channel.send({ embeds: [footerEmbed] });
      console.log('✅ Posted footer embed');
      
      console.log('\n🎉 SUCCESS: Full Discord posting test completed!');
      console.log('   All 6 messages posted successfully to Discord');
      
    } catch (error) {
      console.error('❌ Test failed:', error);
    }
    
    // Clean up
    setTimeout(() => {
      client.destroy();
      process.exit(0);
    }, 3000);
  });

  client.on('error', error => {
    console.error('❌ Discord client error:', error);
  });

  try {
    await client.login(config.discord.token);
  } catch (error) {
    console.error('❌ Failed to login:', error);
    process.exit(1);
  }
}

testSimpleDiscordPost().catch(console.error);