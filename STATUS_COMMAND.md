# 🔧 /status Command Documentation

## Overview
The `/status` command provides intelligent team or player status detection with GPT-4 powered analysis of recent injuries, roster moves, and performance updates.

## Features
- **Smart Detection**: Automatically determines if input is a team or player name
- **Team Status**: Latest injuries, substitutions, and roster changes from recent games
- **Player Status**: Individual player injury reports and performance updates from team activity
- **GPT-4 Analysis**: Converts raw timeline data into readable status summaries
- **Error Handling**: Graceful fallback when teams/players aren't found

## Usage

### Command Syntax
```
/status <target>
```

**Parameters:**
- `target` (required): Team name or player name

### Examples
```bash
# Team status
/status eagles
/status dallas cowboys
/status patriots

# Player status  
/status aaron rodgers
/status travis kelce
/status aj brown
```

## Logic Flow

### 1. Smart Detection Process
```
User Input → Try Team Search → If found: Team Status
                ↓
            Try Player Search → If found: Player Status
                ↓
            Neither Found → Error Message
```

### 2. Team Status Process
1. Search team using `searchteams.php?t=INPUT`
2. Get `idTeam` from results
3. Fetch latest event: `eventslast.php?id=TEAM_ID`
4. Get timeline: `lookuptimeline.php?id=EVENT_ID`
5. Send data to GPT-4 with team-specific prompt
6. Format as team status embed

### 3. Player Status Process  
1. Search player using `searchplayers.php?p=INPUT`
2. Get `idPlayer` from results
3. Fetch player details: `lookupplayer.php?id=PLAYER_ID`
4. Get player's current team events and timeline
5. Send data to GPT-4 with player-specific prompt
6. Format as player status embed

## Output Formats

### Team Status Example
```
🟢 Eagles Status (Aug 4)

- 🛑 AJ Brown ruled OUT (hamstring)
- 🔁 New CB signing: Casey Hayward
- 🟢 Next game: vs Giants on Monday

🏈 Last Game: Eagles vs Cowboys - Aug 2
💡 More Info: Use `/team Eagles` for full roster details
```

### Player Status Example
```
👤 Aaron Rodgers – Status as of Aug 4

- 🛑 Left practice early (calf tightness)
- 🏈 Played only Q1 last game
- 🛑 Questionable for Week 1

🏟️ Current Team: New York Jets
📍 Position: Quarterback
🏈 Team's Last Game: Jets vs Giants - Aug 2
💡 More Info: Use `/player Aaron Rodgers` for complete profile
```

### Error Handling
```
❌ Not Found
Player or team not found for "invalid name".

💡 Try these formats:
• Team: eagles, dallas cowboys, patriots
• Player: aaron rodgers, travis kelce, aj brown
```

## Technical Implementation

### Files Created/Modified
1. **`commands/status.js`** - Main command handler
2. **`utils/gptSummarizer.js`** - Added `summarizeTeamStatus()` and `summarizePlayerStatus()` methods
3. **`test-status-command.js`** - Testing utilities
4. **`package.json`** - Added test script

### API Integration
**TheSportsDB Endpoints Used:**
- `/searchteams.php?t=INPUT` - Team detection
- `/searchplayers.php?p=INPUT` - Player detection  
- `/eventslast.php?id=TEAM_ID` - Latest team events
- `/lookuptimeline.php?id=EVENT_ID` - Game timeline data
- `/lookupplayer.php?id=PLAYER_ID` - Player details

### GPT-4 Prompts

#### Team Status Prompt
```
Summarize key injuries, substitutions, or player absences for the [TEAM_NAME] 
from this timeline and last event.

Focus on:
- Player injuries (ruled out, questionable, day-to-day)
- Roster changes (signings, releases, trades)  
- Key substitutions or absences from recent games
- Practice participation updates
- Return-to-play status

Format: Clean bullet points with emojis (🛑🟢🔁🏈)
Length: Under 150 words
```

#### Player Status Prompt  
```
Is there any injury, trade, or status update for [PLAYER_NAME] based on this 
player info and the most recent timeline for their team?

Look for:
- Injury status (hurt, questionable, ruled out)
- Game participation (started, benched, limited snaps)
- Practice participation (full, limited, did not participate)
- Performance notes from recent games
- Any roster or contract changes

Format: Clean bullet points with emojis (🛑🏈🟢🔁)
Length: Under 120 words
```

### Rate Limiting & Error Handling
- **Inherits existing rate limiting** from API service with retry logic
- **Graceful degradation** when timeline data is unavailable
- **Comprehensive error handling** for API failures and invalid inputs
- **Fallback messages** when GPT analysis fails

## Performance Characteristics

### API Calls Per Request
**Team Status:**
- 1 team search call
- 1 events lookup call  
- 1 timeline lookup call
- 1 GPT-4 API call
- **Total: ~4 API calls**

**Player Status:**
- 1 player search call
- 1 player details call
- 1 team events call (if player has team)
- 1 timeline call (if events available)
- 1 GPT-4 API call
- **Total: ~5 API calls**

### Response Time
- **Team status**: 3-8 seconds
- **Player status**: 4-10 seconds  
- **Rate limiting delays**: Built-in with exponential backoff

## Testing

### Unit Tests
```bash
npm run test-status-command
```

### Test Scenarios Covered
- ✅ Valid team detection ("Dallas Cowboys")
- ✅ Valid player detection ("Aaron Rodgers")  
- ✅ Invalid input handling
- ✅ GPT summarizer functionality
- ✅ API error handling
- ✅ Rate limiting resilience

### Integration Testing
```bash
# Start bot
npm start

# Test in Discord
/status eagles           # Team detection
/status aaron rodgers    # Player detection  
/status invalid name     # Error handling
```

## Monitoring & Debugging

### Console Output
```
🔍 Status request for: eagles
✅ Found team: Philadelphia Eagles
📡 Fetching team status for Philadelphia Eagles...
✅ Generated team status for Philadelphia Eagles: - 🛑 AJ Brown ruled OUT...
✅ Team status delivered for Philadelphia Eagles
```

### Error Scenarios
- **Team/Player not found**: Returns helpful format suggestions
- **API failures**: Graceful error messages with retry suggestions
- **GPT failures**: Fallback to basic status messages
- **Rate limiting**: Automatic retry with exponential backoff

## Configuration

### Environment Variables
```env
# Required
OPENAI_API_KEY=your_openai_key_here
SPORTSDB_KEY=123

# Optional
DISCORD_TOKEN=your_discord_token
```

### Customization Options
- **GPT model**: Change in `config/config.js` (default: GPT-4)
- **Token limits**: Adjust in GPT summarizer methods
- **Rate limiting**: Modify delays in API service
- **Output formatting**: Customize embed colors and emojis

## Future Enhancements

### Potential Improvements
1. **Caching**: Cache status results for 5-10 minutes
2. **Historical tracking**: Compare status changes over time  
3. **Batch processing**: Handle multiple players/teams in one command
4. **Injury severity**: Color-code injuries by severity level
5. **Fantasy integration**: Add fantasy football relevance scores
6. **Notifications**: Subscribe to player/team status updates

### Alternative Data Sources
- **ESPN API**: Add as fallback data source
- **NFL.com**: Direct injury report integration
- **Twitter/X**: Social media injury monitoring
- **Team websites**: Official team injury reports

## Troubleshooting

### Common Issues

**"Player or team not found":**
- Try full team names: "Philadelphia Eagles" vs "Eagles"
- Check spelling of player names
- Some retired players may not be in current database

**Slow responses:**
- Normal due to multiple API calls and GPT processing
- Rate limiting may add 2-6 second delays
- Consider server location for API latency

**GPT responses seem generic:**
- Timeline data may be limited for some teams/games
- Off-season periods have less activity data
- Preseason vs regular season data availability varies

### Debug Commands
```bash
# Test specific functionality
npm run test-status-command

# Monitor API calls
grep "Error" logs.txt | grep "429"  # Rate limiting
grep "Generated.*status" logs.txt   # GPT success rate
```

---

**The `/status` command provides intelligent, GPT-4 powered NFL status updates with smart team/player detection and comprehensive error handling.** 🏈