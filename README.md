# 🏈 NFL Discord Bot

Production-grade Discord bot that delivers daily NFL player updates, game summaries, and comprehensive player profiles using TheSportsDB and OpenAI GPT-4 APIs.

## ✨ Features

### 🔄 Daily NFL Updates (8 AM EST)
- **Automated Data Collection**: Monitors 12+ NFL teams using TheSportsDB API
- **Smart Analysis**: Uses GPT-4 to analyze timeline data for injuries, trades, and roster moves  
- **Discord Integration**: Posts formatted updates to `#nfl-updates` channel
- **Customizable Teams**: Easy configuration of monitored teams

### 🧠 Interactive Slash Commands

#### `/team [team_name]`
- Complete roster organized by position
- Team information (stadium, founded year, division)
- Interactive buttons for:
  - Full roster breakdown
  - Schedule (upcoming/recent games)
  - Team statistics

#### `/player [player_name]`
- Comprehensive player profiles with AI-generated summaries
- Interactive buttons for detailed information:
  - **Bio**: Extended biography and career highlights
  - **Contracts**: Contract history and salary information
  - **Milestones**: Career achievements and records
  - **Former Teams**: Team history and transfers
  - **Career Stats**: Performance data and statistics

#### `/updates`
- **On-demand NFL briefing** for all monitored teams
- Scans latest events and timeline data in real-time
- GPT-4 powered analysis of injuries, trades, and roster moves
- Formatted Discord embed with progress tracking
- Manual trigger alternative to daily 8 AM updates

#### `/status [target]`
- **Smart team/player status detection** with single input
- Automatically detects if input is team name or player name
- **Enhanced resilience** with RSS fallback system and SQLite caching
- **Rate limiting protection** with exponential backoff and jitter
- **Transparent source attribution** (SportsDB/RSS/Cached)
- Team status: latest substitutions, signings, and injury reports
- Player status: individual injury reports and game participation

#### `/injuries [target]`
- **Dedicated injury and roster change reports** for teams or league-wide
- **Intelligent filtering** of RSS feeds for injury-related content only
- **Categorized reporting**: Injuries/DNPs, Roster Moves, Practice Reports
- **Severity assessment** with color-coded Discord embeds
- Team-specific: `/injuries eagles` for Philadelphia Eagles injury report
- League-wide: `/injuries all` for NFL-wide injury and roster updates
- **Focused GPT analysis** with injury-specific prompts for accurate extraction

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Discord Bot with `application.commands` scope
- OpenAI API Key (GPT-4 access)
- TheSportsDB API access

### Installation

1. **Clone and Setup**
```bash
git clone <repository>
cd football-discord
npm install
```

2. **Configure Environment**
The `.env` file is already configured with your API keys:
```env
DISCORD_TOKEN=MTQwMjA1OTEwODk5NTE3NDQzMQ.Ge2FSz...
DISCORD_CLIENT_ID=1402059108995174431
SPORTSDB_KEY=123
OPENAI_API_KEY=sk-proj-kT0y3nqc_v4xSVosP9DD9I...

# Optional: Set for specific server deployment
DISCORD_GUILD_ID=your_server_id
NFL_UPDATES_CHANNEL_ID=your_channel_id
```

3. **Deploy Commands**
```bash
npm run deploy
```

4. **Start Bot**
```bash
npm start
# or for development
npm run dev
```

## 🔧 Configuration

### NFL Teams
Edit `config/config.js` to modify monitored teams:
```javascript
nflTeams: [
  'Dallas Cowboys',
  'Philadelphia Eagles',
  'New York Giants',
  // Add more teams...
]
```

### Update Schedule
Modify cron schedule in `config/config.js`:
```javascript
cronSchedule: '0 8 * * *', // 8 AM EST daily
timezone: 'America/New_York'
```

## 🧪 Testing

### Test Daily Updates
```bash
npm run test
# or
node test-updates.js
```

### Test with Command Line
```bash
node index.js --test-update
```

## 📖 API Integration

### TheSportsDB Endpoints
- `searchteams.php` - Find NFL teams
- `lookup_all_players.php` - Team rosters  
- `lookupplayer.php` - Player details
- `eventsnext.php` / `eventslast.php` - Game schedules
- `lookuptimeline.php` - Game timelines for injury detection
- `lookupcontracts.php` - Contract information
- `lookupmilestones.php` - Player achievements

### OpenAI GPT-4 Integration
- **Timeline Analysis**: Converts raw game data into readable injury reports
- **Player Profiles**: Generates engaging player summaries
- **Team Summaries**: Creates roster overviews and team insights

## 🏗️ Architecture

```
football-discord/
├── index.js              # Main bot entry point
├── deploy-commands.js    # Command deployment script
├── test-updates.js       # Testing utilities
├── config/
│   └── config.js         # Central configuration
├── lib/
│   ├── http.js           # Rate-limited HTTP client
│   └── cache.js          # SQLite caching system
├── services/
│   ├── statusService.js  # Orchestrates fallback chain
│   ├── sportsdb.js       # Enhanced TheSportsDB client
│   ├── rssFallback.js    # RSS news feed fallback
│   └── summarizer.js     # Enhanced GPT summarizer
├── commands/
│   ├── team.js           # /team slash command
│   ├── player.js         # /player slash command
│   ├── updates.js        # /updates slash command
│   ├── status.js         # /status slash command
│   └── injuries.js       # /injuries slash command
└── utils/
    ├── gptSummarizer.js  # OpenAI GPT-4 integration
    └── dailyUpdater.js   # Cron job scheduler
```

## 📋 Example Output

### Daily Update Format
```
🟢 NFL Update – Aug 4

🛑 Eagles WR AJ Brown ruled out for Week 1 (hamstring)
🔁 Patriots sign WR Kenny Golladay after preseason injury
🏈 Jets QB Aaron Rodgers left practice early with calf tightness

Use `/team jets` or `/player AJ Brown` for full bio and updates.
```

### Command Examples
- `/team cowboys` - Dallas Cowboys roster and info
- `/player aaron rodgers` - Aaron Rodgers complete profile
- `/team eagles` - Philadelphia Eagles current lineup
- `/updates` - Get instant NFL briefing for all monitored teams
- `/status eagles` - Eagles injury/roster status
- `/status aaron rodgers` - Aaron Rodgers current status
- `/injuries eagles` - Philadelphia Eagles injury report
- `/injuries all` - League-wide injury and roster updates

## 🚀 Deployment

### Production Setup
```bash
# Install PM2 for process management
npm install -g pm2

# Start bot with PM2
pm2 start index.js --name "nfl-bot"
pm2 save
pm2 startup
```

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
CMD ["npm", "start"]
```

### Environment Variables
```env
NODE_ENV=production
DISCORD_TOKEN=your_token
DISCORD_CLIENT_ID=your_client_id
OPENAI_API_KEY=your_openai_key
NFL_UPDATES_CHANNEL_ID=your_channel_id

# Enhanced Error Handling & Performance
RATE_LIMIT_MIN_INTERVAL_MS=1400
CACHE_TTL_MIN=30
FALLBACK_FEEDS=https://www.espn.com/espn/rss/nfl/news,https://profootballtalk.nbcsports.com/feed/
```

## 📊 Monitoring

The bot provides comprehensive logging:
- Daily update execution status
- API call success/failure rates
- Command usage statistics
- Error tracking and debugging info

### Status Command (Admin)
Check bot status programmatically:
```javascript
const bot = require('./index.js');
console.log(bot.getStatus());
```

## 🔧 Customization

### Adding New Commands
1. Create command file in `commands/` directory
2. Export `data` (SlashCommandBuilder) and `execute` function
3. Run `npm run deploy` to register with Discord

### Modifying Update Format
Edit `utils/gptSummarizer.js` to customize:
- Update message format
- AI prompt templates  
- Team selection logic
- Content filtering

### Adding New Data Sources
Extend `api/sportsdb.js` with additional endpoints or create new API service modules.

## 🛠️ Development

### Available Scripts
- `npm start` - Start production bot
- `npm run dev` - Start with nodemon (auto-restart)
- `npm run deploy` - Deploy slash commands
- `npm run test` - Run daily update tests
- `npm run test-updates-command` - Test /updates command logic
- `npm run test-status-command` - Test /status command logic
- `npm run test-injuries` - Test /injuries command logic

### Debug Mode
Set `NODE_ENV=development` for additional logging and test features.

## ❓ Troubleshooting

### Common Issues

**Commands not appearing:**
- Run `npm run deploy` to register commands
- Check bot has `application.commands` scope
- Guild commands update instantly, global commands take up to 1 hour

**Daily updates not posting:**
- Verify `NFL_UPDATES_CHANNEL_ID` is set
- Check bot has `Send Messages` permission in channel
- Updates will log to console if channel not configured

**API Errors:**
- Verify OpenAI API key has GPT-4 access
- Check TheSportsDB API status
- **Enhanced protection**: Built-in rate limiting, exponential backoff, RSS fallbacks, and caching
- Monitor console for fallback chain usage (SportsDB → RSS → Cache)

### Logs
Check console output for detailed error messages and status updates.

## 📄 License

MIT License - See LICENSE file for details.

## 🤝 Support

- Check logs for detailed error information
- Verify all API keys are valid and have required permissions
- Test individual components using provided test scripts

---

**Ready to deploy!** 🚀 Your production-grade NFL Discord bot is configured and ready to serve daily updates and comprehensive player information to your Discord community.