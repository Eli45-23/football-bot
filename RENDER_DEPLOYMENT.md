# NFL Discord Bot - Render Deployment Guide

## Overview

This guide walks you through deploying the NFL Discord Bot to Render's cloud platform.

## Prerequisites

1. **Render Account**: Sign up at [render.com](https://render.com) (free tier available)
2. **GitHub Repository**: Your code must be pushed to GitHub
3. **Discord Bot Credentials**: Discord token, client ID, guild ID, channel ID
4. **OpenAI API Key**: For GPT-powered content summarization

## Step-by-Step Deployment

### 1. Connect GitHub to Render

1. Log into your Render dashboard
2. Click "New +" → "Web Service"
3. Connect your GitHub account
4. Select your `football-discord` repository

### 2. Configure Web Service

**Basic Settings:**
- **Name**: `nfl-discord-bot`
- **Region**: Oregon (or preferred)
- **Branch**: `main`
- **Root Directory**: Leave blank
- **Environment**: Node
- **Build Command**: `npm install`
- **Start Command**: `npm start`

**Advanced Settings:**
- **Plan**: Free (or Starter for better performance)
- **Health Check Path**: `/health`
- **Auto-Deploy**: Enable

### 3. Set Environment Variables

Add these environment variables in Render dashboard:

#### Required Discord Configuration
```
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here
DISCORD_GUILD_ID=your_discord_guild_id_here
NFL_UPDATES_CHANNEL_ID=your_nfl_channel_id_here
```

#### Required API Keys
```
OPENAI_API_KEY=your_openai_api_key_here
SPORTSDB_KEY=123
```

#### Application Configuration
```
NODE_ENV=production
PORT=10000
TIMEZONE=America/New_York
```

#### GPT Configuration
```
GPT_ENABLED=true
GPT_MODEL=gpt-4o-mini
GPT_TEMPERATURE=0.1
GPT_MAX_INPUT_TOKENS=3000
GPT_MAX_OUTPUT_TOKENS=600
GPT_RUNS_PER_UPDATE=3
GPT_TIMEOUT_MS=12000
GPT_FORCE_MODE=true
```

#### Scheduling Configuration
```
MISSED_RUN_GRACE_MIN=60
OFFLINE_QUEUE_SPACING_MS=300
LOOKBACK_HOURS_MORNING=24
LOOKBACK_HOURS_AFTERNOON=12
LOOKBACK_HOURS_EVENING=24
BREAKING_LOOKBACK_EVENING=36
```

#### Performance & Features
```
RATE_LIMIT_REQUESTS_PER_MINUTE=60
RATE_LIMIT_BURST=10
RECONNECT_DELAY_MS=5000
MAX_RECONNECT_ATTEMPTS=5
ENABLE_COMPREHENSIVE_LOGGING=true
ENABLE_SCHEDULE_PERSISTENCE=true
ENABLE_DUPLICATE_DETECTION=true
ENABLE_FALLBACK_EXPANSION=true
ENABLE_API_QUEUE=true
```

#### RSS Feeds
```
RSS_FEEDS=https://www.espn.com/espn/rss/nfl/news,https://www.nfl.com/rss/rsslanding?searchString=home,https://sports.yahoo.com/nfl/rss.xml,https://www.cbssports.com/rss/headlines/nfl/,https://profootballtalk.nbcsports.com/feed/
```

### 4. Configure Persistent Storage

1. In the Render dashboard, go to your service settings
2. Add a new disk:
   - **Name**: `nfl-bot-data`
   - **Mount Path**: `/opt/render/project/src/.data`
   - **Size**: 1GB
3. This ensures runtime data persists across deployments

### 5. Deploy

1. Click "Create Web Service"
2. Render will automatically:
   - Clone your repository
   - Run `npm install`
   - Start the bot with `npm start`
   - Monitor the `/health` endpoint

## Monitoring & Verification

### Check Deployment Status

1. **Logs**: View real-time logs in Render dashboard
2. **Health Check**: Visit your service URL + `/health`
3. **Discord**: Verify bot appears online in your Discord server

### Expected Log Output

Look for these success indicators:
```
✅ Discord gateway DNS resolution successful
✅ Discord API connectivity test successful
✅ Logged in as NFL UPDATES!!#2312
🤖 Bot ID: 1406013996892426301
⏰ Scheduled morning: [timestamp]
⏰ Scheduled afternoon: [timestamp]  
⏰ Scheduled evening: [timestamp]
```

### Scheduled Updates

The bot runs automatically at:
- **8:00 AM EST** - Morning update (24h lookback)
- **2:00 PM EST** - Afternoon update (12h lookback)
- **8:00 PM EST** - Evening update (12h lookback)

## Troubleshooting

### Common Issues

1. **Port Already in Use**: Render automatically assigns ports
2. **Environment Variables**: Double-check all required variables are set
3. **Discord Token**: Ensure token is valid and has proper permissions
4. **Health Check Failing**: Verify `/health` endpoint responds

### Bot Not Connecting to Discord

1. Check Discord token in environment variables
2. Verify bot has necessary permissions in Discord server
3. Check logs for authentication errors

### Scheduled Updates Not Working

1. Verify timezone setting (`TIMEZONE=America/New_York`)
2. Check if bot has permission to post in the specified channel
3. Review logs during scheduled times

## Maintenance

### Updating the Bot

1. Push changes to your GitHub repository
2. Render will automatically redeploy (if auto-deploy is enabled)
3. Monitor logs to ensure successful deployment

### Environment Variables

- Update in Render dashboard under service settings
- Changes require a manual redeploy

### Scaling

- Free tier: 512MB RAM, shared CPU
- Starter tier: 1GB RAM, dedicated CPU
- Upgrade for better performance if needed

## Security Notes

- Environment variables in Render are encrypted
- Never commit sensitive credentials to your repository
- Regularly rotate API keys and tokens
- Monitor logs for any security issues

## Support

For deployment issues:
- Check Render documentation
- Review service logs in dashboard
- Verify all environment variables are correctly set
- Test locally before deploying