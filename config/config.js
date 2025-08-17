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
      eventsNextLeague: '/eventsnextleague.php',
      eventsPastLeague: '/eventspastleague.php',
      eventsSeason: '/eventsseason.php',
      eventsDay: '/eventsday.php',
      lookupTimeline: '/lookuptimeline.php',
      lookupContracts: '/lookupcontracts.php',
      lookupMilestones: '/lookupmilestones.php',
      lookupFormerTeams: '/lookupformerteams.php'
    },
    nflLeagueId: '4391', // NFL League ID for TheSportsDB
    getCurrentSeason: () => {
      // Auto-detect current NFL season based on date
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth(); // 0-based: 0=Jan, 7=Aug
      
      // NFL season runs from August of year X to February of year X+1
      // In August 2025, we're looking for 2024-2025 season data
      if (month >= 7) { // August or later
        return (year - 1).toString(); // Use previous year (2024 for Aug 2025)
      } else { // January through July
        return (year - 1).toString(); // Use previous year
      }
    },
    get currentSeason() {
      return this.getCurrentSeason();
    }
  },

  // OpenAI Configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.GPT_MODEL || 'gpt-4o-mini',
    maxTokens: parseInt(process.env.GPT_MAX_OUTPUT_TOKENS) || 600,
    temperature: 0.1,
    enabled: process.env.GPT_ENABLED === 'true',
    maxInputTokens: parseInt(process.env.GPT_MAX_INPUT_TOKENS) || 3000,
    runsPerUpdate: parseInt(process.env.GPT_RUNS_PER_UPDATE) || 3,
    timeoutMs: parseInt(process.env.GPT_TIMEOUT_MS) || 12000
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
  
  // Schedule Window Configuration  
  schedule: {
    windowDays: 7,            // 7-day total window (focus on current week)
    minGamesThreshold: 5,     // Expand window if fewer than 5 games found
    maxExpansionDays: 10,     // Maximum expansion to 10 days (was 21)
    maxMessagesPerCategory: 5, // Max Discord messages per category
    pagination: {
      injuries: 8,            // Items per injuries message
      roster: 6,              // Items per roster message
      breaking: 5,            // Items per breaking message
      games: 15               // Items per games message
    }
  },

  // RSS Pipeline Configuration
  rss: {
    // Main RSS feed URLs for news aggregation
    feedUrls: [
      'https://www.espn.com/espn/rss/nfl/news',
      'https://www.nfl.com/feeds/news',
      'https://sports.yahoo.com/nfl/rss.xml',
      'https://www.cbssports.com/rss/nfl/news',
      'https://profootballtalk.nbcsports.com/feed/',
      'https://www.profootballrumors.com/feed'
    ],
    
    // Team-specific feeds (from environment variable if configured)
    teamFeeds: process.env.TEAM_FEEDS ? process.env.TEAM_FEEDS.split(',').map(url => url.trim()) : [],
    
    // Lookback hours by run type
    lookback: {
      morning: 24,    // 24h lookback for morning runs
      afternoon: 12,  // 12h lookback for afternoon runs
      evening: 12     // 12h lookback for evening runs
    },
    
    // Widened lookback when sections are sparse (<2 items)
    fallbackLookback: {
      morning: 48,    // Expand to 48h for sparse morning sections
      afternoon: 18,  // Expand to 18h for sparse afternoon sections
      evening: 18     // Expand to 18h for sparse evening sections
    },
    
    // Content extraction settings
    maxBulletLength: 320,        // Soft limit for bullet length (~320 chars)
    articleTimeoutMs: 10000,     // 10s timeout for article fetching
    concurrency: 5,              // Max concurrent article extractions
    
    // Category limits
    limits: {
      injuries: 20,   // Max 20 injury bullets
      roster: 12,     // Max 12 roster bullets
      breaking: 10    // Max 10 breaking news bullets
    }
  },

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