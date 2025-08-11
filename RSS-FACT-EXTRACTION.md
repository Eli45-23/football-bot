# NFL Discord Bot - Enhanced RSS Fact Extraction

## Overview

The NFL Discord Bot now features **advanced fact extraction** from RSS feeds, providing users with **real, structured facts** instead of generic headlines and links. This system fetches full article content, extracts meaningful information using rule-based parsing, and categorizes it strictly.

## 🎯 Key Features

### ✅ **Full-Text Article Processing**
- Fetches complete article content (not just RSS summaries)
- Uses @mozilla/readability for clean text extraction
- Handles redirects and canonical URLs
- Concurrent processing with rate limiting (4 articles at once)

### ✅ **Intelligent Fact Extraction** 
- **Player Recognition**: Identifies NFL players by name patterns
- **Team Recognition**: Maps teams to standard abbreviations (LAR, KC, etc.)
- **Status Extraction**: Finds key phrases around injury/roster keywords
- **Context Awareness**: Extracts ±80 characters around relevant keywords

### ✅ **Strict Categorization**
- **🏥 Injuries**: Only items with injury keywords + player/team mentions
- **🔁 Roster Changes**: Only transactions (sign/waive/trade/activate/IR)
- **📰 Breaking News**: Major announcements (not injuries/transactions)
- **📅 Scheduled Games**: Unchanged (from TheSportsDB)

### ✅ **Noise Filtering**
Automatically filters out:
- "Takeaways", "debut", "preseason observations"
- Stat blurbs, highlights, fantasy content
- Training camp notes (unless injury/roster keywords present)

### ✅ **Clean Output Format**
- **Fact-based bullets**: "Matthew Stafford (LAR) – limited in practice with back issue (ESPN)"
- **No raw URLs**: Source attribution only
- **Structured format**: Player (Team) – status phrase (Source)
- **Capped results**: Max 5 per category with "+N more" overflow

## 📊 Example Output

### Before (Generic Headlines)
```
🏥 Injuries
• NFL preseason Week 1 takeaways: Travis Hunter sees action – https://espn.com/story/123
• Stafford injury update: Rams QB status – https://nfl.com/news/456
• Training camp notes from around the league – https://yahoo.com/789
```

### After (Extracted Facts)
```
🏥 Injuries
• Travis Hunter (JAX) – nervous before solid debut, took hits at WR and CB (ESPN)
• Matthew Stafford (LAR) – limited in practice with back issue, questionable for Sunday (NFL.com)
• Rondale Moore (MIN) – carted off with knee injury on punt return (Yahoo)
(+2 more)
```

## 🏗️ Architecture

### Core Components

1. **`services/rssFullText.js`** - Full article fetching
2. **`services/newsClassifier.js`** - Fact extraction and categorization  
3. **`utils/aggregateNews.js`** - News aggregation pipeline
4. **Updated `utils/dailyUpdater.js`** - Integration with existing system

### Processing Pipeline

```
RSS Feeds → Full Article Fetch → Text Extraction → Classification → Fact Extraction → Discord Output
```

1. **Feed Processing**: Fetches from 5 RSS sources with 24h lookback
2. **Content Extraction**: Uses Readability to get clean article text
3. **Classification**: Keyword matching + noise filtering  
4. **Fact Extraction**: Player/team recognition + status phrase extraction
5. **Categorization**: Strict rules for injuries, roster, breaking news
6. **Deduplication**: Article-level and payload-level duplicate prevention

## 📋 Configuration

### Environment Variables
```bash
# RSS configuration (optional - defaults provided)
RSS_FEEDS="https://www.espn.com/espn/rss/nfl/news,https://www.nfl.com/rss/rsslanding?searchString=home,..."

# Performance tuning (optional)
MAX_FETCH_CONCURRENCY=4        # Concurrent article fetches
ARTICLE_TIMEOUT_MS=10000       # Per-article timeout
DEDUPE_WINDOW_MS=300000        # 5-minute duplicate prevention window
```

### RSS Sources (Default)
- **ESPN NFL News**: https://www.espn.com/espn/rss/nfl/news
- **NFL.com Headlines**: https://www.nfl.com/rss/rsslanding?searchString=home
- **Yahoo Sports NFL**: https://sports.yahoo.com/nfl/rss.xml
- **CBS Sports NFL**: https://www.cbssports.com/rss/headlines/nfl/
- **ProFootballTalk**: https://profootballtalk.nbcsports.com/feed/

## 🔍 Keyword Rules

### Injury Keywords (43 total)
```javascript
["injury", "injured", "carted off", "out for season", "questionable", "doubtful", 
 "ruled out", "limited practice", "did not practice", "concussion", "hamstring", 
 "ankle", "knee", "back", "shoulder", "pup", "ir", "surgery", "torn", "sprained"]
```

### Roster Keywords (37 total)  
```javascript
["sign", "signed", "re-sign", "waive", "waived", "release", "trade", "traded",
 "acquire", "promote", "elevate", "claim", "activate", "extension", "contract",
 "one-year deal", "practice squad", "futures contract"]
```

### Breaking News Keywords (30 total)
```javascript
["breaking", "sources", "announced", "official", "statement", "returning",
 "retirement", "suspended", "fine", "investigation", "Hall of Fame", "award",
 "milestone", "record", "coaching change", "fired", "hired"]
```

### Noise Filters (Excluded unless injury/roster keywords present)
```javascript
["takeaways", "observations", "debut", "first impression", "stat line", 
 "highlights", "preseason notes", "training camp", "fantasy", "betting", "odds"]
```

## 🧪 Testing

### Manual Testing
```bash
# Test the full fact extraction pipeline
node test-fact-extraction.js

# Test individual components
node test-simple-fact.js

# Test Discord integration
node trigger-discord-update.js
```

### Component Status
```javascript
// Get service status
const rssStatus = rssFullText.getStatus();
const classifierStatus = newsClassifier.getStatus();  
const aggregateStatus = await aggregateNews.getStatus();
```

## 🚀 Performance & Limits

### Concurrency Control
- **Article fetching**: Limited to 4 concurrent requests
- **Timeout handling**: 10-second timeout per article
- **Graceful degradation**: Skips failed articles, continues processing

### Caching Strategy
- **Seen articles**: 24-hour cache prevents re-processing
- **Payload deduplication**: 5-minute hash-based duplicate prevention
- **Schedule caching**: Existing 24-hour TheSportsDB cache preserved

### Rate Limiting
- **RSS feeds**: Standard HTTP requests (no special limits)
- **TheSportsDB**: Existing batched processing preserved (3 teams/batch, 45s delay)

## 📅 Scheduling

The enhanced system maintains the existing schedule:
- **🌅 8:00 AM EST** - Morning Update
- **🌞 2:00 PM EST** - Afternoon Update  
- **🌙 8:00 PM EST** - Evening Update

Each update now includes:
1. **Header** with timestamp and processing stats
2. **🏥 Injuries** with extracted facts (max 5)
3. **🔁 Roster Changes** with transaction details (max 5)
4. **📅 Scheduled Games** from TheSportsDB (max 10)
5. **📰 Breaking News** with major announcements (max 5)
6. **🗂 Sources** footer with full attribution

## 🛠️ Troubleshooting

### Common Issues

**No facts extracted**
- Check RSS feed availability
- Verify keyword matches in articles
- Review noise filtering logs

**HTTP fetch errors**
- Articles may have paywalls or bot detection
- System gracefully skips failed fetches
- Check user-agent and timeout settings

**Classification issues**
- Review keyword lists for coverage
- Check player/team name recognition
- Verify text extraction quality

### Debugging Commands
```bash
# Check classifier status
node -e "console.log(require('./services/newsClassifier').getStatus())"

# Test single article classification
node -e "const classifier = require('./services/newsClassifier'); console.log(classifier.classify({title: 'Test', text: 'injury report', source: 'TEST'}))"

# Clear article cache for testing
node -e "require('./utils/aggregateNews').clearSeenCache().then(() => console.log('Cache cleared'))"
```

## 🎯 Quality Assurance

The system ensures high-quality output by:

1. **Strict keyword matching** - Only processes articles with relevant NFL keywords
2. **Entity recognition** - Identifies actual players and teams
3. **Context extraction** - Gets meaningful phrases around keywords  
4. **Noise filtering** - Removes generic takeaways and observations
5. **Length limits** - Caps fact bullets at ~120 characters for readability
6. **Source attribution** - Credits original source in every fact

This results in **actionable, structured facts** instead of generic headlines, providing Discord users with immediately useful NFL information.