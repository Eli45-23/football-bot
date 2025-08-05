require('dotenv').config();

const config = {
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.DISCORD_GUILD_ID,
    nflUpdatesChannelId: process.env.NFL_UPDATES_CHANNEL_ID
  },
  ai: {
    provider: process.env.AI_PROVIDER || 'openai',
    openai: {
      apiKey: process.env.OPENAI_API_KEY
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY
    }
  },
  sportsDb: {
    baseUrl: 'https://www.thesportsdb.com/api/v1/json/3',
    apiKey: process.env.SPORTS_DB_API_KEY || null
  },
  nfl: {
    teams: [
      { name: 'Philadelphia Eagles', searchName: 'Philadelphia Eagles' },
      { name: 'Dallas Cowboys', searchName: 'Dallas Cowboys' },
      { name: 'New York Giants', searchName: 'New York Giants' },
      { name: 'Kansas City Chiefs', searchName: 'Kansas City Chiefs' },
      { name: 'New York Jets', searchName: 'New York Jets' }
    ],
    cronSchedule: '0 8 * * *' // 8 AM EST daily
  }
};

// Validation
if (!config.discord.token) {
  throw new Error('DISCORD_TOKEN is required');
}

if (!config.discord.clientId) {
  throw new Error('DISCORD_CLIENT_ID is required');
}

if (config.ai.provider === 'openai' && !config.ai.openai.apiKey) {
  throw new Error('OPENAI_API_KEY is required when using OpenAI');
}

if (config.ai.provider === 'anthropic' && !config.ai.anthropic.apiKey) {
  throw new Error('ANTHROPIC_API_KEY is required when using Anthropic');
}

module.exports = config;