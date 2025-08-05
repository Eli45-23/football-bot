require('dotenv').config();

/**
 * Central configuration for the NFL Discord Bot
 * Contains all API endpoints, Discord settings, and bot configuration
 */
const config = {
  // Discord Bot Configuration
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.DISCORD_GUILD_ID || null, // null for global commands
    nflUpdatesChannelId: process.env.NFL_UPDATES_CHANNEL_ID
  },

  // TheSportsDB API Configuration
  sportsdb: {
    baseUrl: 'https://www.thesportsdb.com/api/v1/json',
    key: process.env.SPORTSDB_KEY || '123', // Using provided key
    endpoints: {
      searchTeams: '/searchteams.php',
      lookupAllPlayers: '/lookup_all_players.php',
      lookupPlayer: '/lookupplayer.php',
      searchPlayers: '/searchplayers.php',
      eventsNext: '/eventsnext.php',
      eventsLast: '/eventslast.php',
      lookupTimeline: '/lookuptimeline.php',
      lookupContracts: '/lookupcontracts.php',
      lookupMilestones: '/lookupmilestones.php',
      lookupFormerTeams: '/lookupformerteams.php'
    }
  },

  // OpenAI Configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4', // Using GPT-4 as requested
    maxTokens: 300,
    temperature: 0.3
  },

  // All 32 NFL Teams for Daily Updates
  nflTeams: [
    // AFC East
    'Buffalo Bills',
    'Miami Dolphins', 
    'New England Patriots',
    'New York Jets',
    // AFC North
    'Baltimore Ravens',
    'Cincinnati Bengals',
    'Cleveland Browns',
    'Pittsburgh Steelers',
    // AFC South
    'Houston Texans',
    'Indianapolis Colts',
    'Jacksonville Jaguars',
    'Tennessee Titans',
    // AFC West
    'Denver Broncos',
    'Kansas City Chiefs',
    'Las Vegas Raiders',
    'Los Angeles Chargers',
    // NFC East
    'Dallas Cowboys',
    'New York Giants',
    'Philadelphia Eagles',
    'Washington Commanders',
    // NFC North
    'Chicago Bears',
    'Detroit Lions',
    'Green Bay Packers',
    'Minnesota Vikings',
    // NFC South
    'Atlanta Falcons',
    'Carolina Panthers',
    'New Orleans Saints',
    'Tampa Bay Buccaneers',
    // NFC West
    'Arizona Cardinals',
    'Los Angeles Rams',
    'San Francisco 49ers',
    'Seattle Seahawks'
  ],

  // Cron Schedules (8 AM, 2 PM, 8 PM EST)
  cronSchedules: {
    morning: '0 8 * * *',   // 8:00 AM EST
    afternoon: '0 14 * * *', // 2:00 PM EST  
    evening: '0 20 * * *'    // 8:00 PM EST
  },
  timezone: 'America/New_York',
  testMode: process.env.TEST_MODE === 'true'
};

// Validation
if (!config.discord.token) {
  throw new Error('DISCORD_TOKEN is required in .env file');
}

// OpenAI is no longer required - we're using only TheSportsDB + fallbacks
// if (!config.openai.apiKey) {
//   console.warn('⚠️ OPENAI_API_KEY not set - using TheSportsDB only mode');
// }

module.exports = config;