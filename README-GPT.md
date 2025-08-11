# GPT Integration for NFL Discord Bot

This bot uses OpenAI GPT-4o-mini as a fact-extraction post-processor to enhance RSS and TheSportsDB data.

## Features

### ✅ What GPT Does:
- **Extract Facts**: Pulls detailed information from full-text RSS articles 
- **Fix Categorization**: Moves misclassified items to correct sections
- **Merge Duplicates**: Combines similar stories from different sources
- **Polish Format**: Creates consistent bullet format with proper source attribution
- **Fill Sparse Sections**: Recovers relevant content when rule-based extraction finds little

### ❌ What GPT Does NOT Do:
- **Never Invents Facts**: Only extracts information present in RSS/ESPN data
- **No Speculation**: Omits rumors, opinions, and unconfirmed reports
- **No Hallucination**: Strict prompting ensures factual accuracy

## Configuration

### Environment Variables (.env):
```bash
# Required
OPENAI_API_KEY=your_openai_key_here
GPT_ENABLED=true

# Optional (defaults shown)
GPT_MODEL=gpt-4o-mini
GPT_TEMPERATURE=0.1
GPT_MAX_INPUT_TOKENS=3000
GPT_MAX_OUTPUT_TOKENS=600
GPT_RUNS_PER_UPDATE=3
GPT_TIMEOUT_MS=12000
```

### Enabling/Disabling GPT:
```bash
# Enable GPT enhancement
GPT_ENABLED=true

# Disable GPT (pure rule-based)
GPT_ENABLED=false
```

## Cost Control

### Target: ≤ $0.01/day
- **Model**: gpt-4o-mini ($0.15 per 1M tokens)
- **Usage**: Max 3 calls per update × 3 updates daily = 9 calls/day
- **Tokens**: ~3,600 per call = 32,400 tokens/day
- **Daily Cost**: ~$0.005 (50% under budget)

### Built-in Safeguards:
- **Call Limits**: Maximum 3 GPT calls per scheduled run
- **Token Limits**: Input capped at 3k tokens, output at 600 tokens
- **Timeout Protection**: 12-second maximum per call
- **Fallback**: Returns to rule-based on any GPT failure

## How It Works

### 1. Data Sources (Unchanged):
- **TheSportsDB**: Schedule data, team timelines
- **ESPN Injuries**: Official injury table scraping
- **RSS Feeds**: ESPN, NFL.com, PFT, Yahoo, CBS, ProFootballRumors
- **PFR Transactions**: Roster move feed

### 2. GPT Enhancement Process:
1. **Rule-based extraction** runs first (existing logic)
2. **Sparse sections** (< 2 items) trigger GPT enhancement
3. **Excerpts prepared** from RSS content (500-700 chars each)
4. **GPT extracts facts** using strict prompting
5. **Results merged** with rule-based bullets (GPT preferred)
6. **Semantic deduplication** removes cross-source duplicates

### 3. Output Format:
```
🏥 Injuries
• Alexander Mattison (MIA) — Out for season (neck surgery) · Updated Aug 19 (ESPN)
• Landon Dickerson (PHI) — MRI scheduled Monday (ankle) · Updated Aug 19 (Yahoo)

🔁 Roster Changes  
• Commanders — Signed CBs Antonio Hamilton, Essang Bassey, LB Duke Riley (PFR)
• Panthers — Austin Corbett named starting center · Updated Aug 19 (PFT)

📰 Breaking News
• Cowboys — Jerry Jones calls team "soap opera 365 days a year" (ESPN)
• NFL — House Judiciary Committee reviewing Sunday Ticket practices (CBS)

🗂 Sources: TheSportsDB • ESPN • NFL.com • PFT • Yahoo • CBS • ProFootballRumors (+ GPT polish)
```

## Prompting Strategy

### System Prompt (Shared):
```
You are an NFL update assistant. Use ONLY the provided excerpts as ground truth. 
Do NOT invent facts. If a detail is not stated, omit it. Return short factual 
bullets (1–2 sentences, ≤ 280 chars) shaped like '<Player or TEAM> — <status/action> (<SOURCE>)'. 
No URLs. No bylines. No speculation.
```

### Category-Specific Instructions:
- **Injuries**: Extract only confirmed injury statuses/updates. Include team if present. Omit rumors.
- **Roster**: Extract ONLY transactions (sign/waive/release/trade/activate/IR/elevate/promote/claim/extension). Include team and player. Omit rumors.
- **Breaking**: Major announcements not already in injuries/roster (extensions, suspensions, official statements, returns). Omit opinion columns.

## Monitoring

### Logs Show:
- GPT enabled/disabled status
- Calls used per update (X/3)
- Token estimates per call
- Which categories were enhanced
- Fallback usage when GPT fails

### Example Log Output:
```
🤖 GPT Summarizer initialized: model=gpt-4o-mini, temp=0.1, max calls=3
📰 Enhanced aggregation starting (afternoon run, 12h base lookback)...
🏥 Processing injuries with fallback support...
   🤖 Enhancing injuries with GPT...
   ✅ GPT call 1/3: extracted 5 bullets
✅ Enhanced aggregation complete:
   🏥 Injuries: 8 found → 8 used (ESPN table + GPT)
   🤖 GPT: 1/3 calls used
```

## Testing

### Toggle Test:
```bash
# Test without GPT
GPT_ENABLED=false npm start

# Test with GPT  
GPT_ENABLED=true npm start
```

### Integration Test:
```bash
node test-gpt-integration.js
```

## Troubleshooting

### GPT Not Working?
1. Check `GPT_ENABLED=true` in `.env`
2. Verify `OPENAI_API_KEY` is set correctly
3. Check logs for "GPT Summarizer initialized" message
4. Look for timeout or API key errors in logs

### High Costs?
1. Verify `GPT_RUNS_PER_UPDATE=3` (not higher)
2. Check daily token usage in logs
3. Monitor OpenAI dashboard for actual usage
4. Temporarily set `GPT_ENABLED=false` to stop charges

### Quality Issues?
1. GPT only extracts from provided excerpts - check RSS feed quality
2. Increase `GPT_TIMEOUT_MS` if calls timing out
3. Review excerpt preparation logic in `aggregateNews.js`
4. Check prompt effectiveness for your specific content

## Architecture

```
RSS Feeds → Rule-based Extraction → GPT Enhancement → Discord
    ↓              ↓                      ↓              ↓
ESPN, PFT    Categorization         Fact Polish    Clean Bullets
NFL.com      Deduplication         Format Fix     Source Attribution  
Yahoo/CBS    Initial Bullets       Sparse Fill    280 char limit
PFR Trans    Fallback Ready        Semantic Merge  No URLs/Bylines
```

The system maintains RSS + TheSportsDB as the **ONLY** sources of truth while using GPT to make the presentation cleaner and more informative.