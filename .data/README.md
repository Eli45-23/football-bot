# Runtime Data Directory

This directory contains runtime data files used by the NFL Discord Bot:

## Files Created Automatically

- `lastHash.json` - Content hashes to prevent duplicate posts
- `schedule.json` - Last run timestamps for scheduled updates  
- `lastContent.json` - Cached content for performance

## Important Notes

- These files are created automatically by the application
- Do not manually edit these files
- They are ignored by git (see .gitignore)
- On Render, these files persist using mounted disk storage