# ClaudeStatusLine

A two-line status bar for Claude Code with rate limits, session timer, context usage, and git branch.

```
⬡ Opus 4.6 | ⏱ 2h 3m | ⌁ 174.1k 23% ctx | ⎇ main
◴ 27% · 5h (9m) | ◷ 13% · 7d (4d 8h)
```

## What it shows

**Line 1:** model, session duration, token count + context %, git branch

**Line 2:** 5-hour rate limit with reset time, 7-day rate limit with reset time

Rate limits are fetched from the Anthropic OAuth API using your existing Claude Code credentials. Results are cached for 60 seconds. If credentials are unavailable, line 2 is simply hidden.

## Install

1. Copy `statusline.mjs` to `~/.claude/`:

```bash
curl -o ~/.claude/statusline.mjs https://raw.githubusercontent.com/Meldren/ClaudeStatusLine/master/statusline.mjs
```

2. Add to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node ~/.claude/statusline.mjs",
    "padding": 0
  }
}
```

3. Restart Claude Code.

## Requirements

- Node.js 18+
- Claude Code (logged in)

## Customization

Edit the `colors` object in `statusline.mjs` — just hex values:

```js
const colors = {
  model:      '2D9B14', // model name
  timer:      'F0D23C', // session duration
  ctx:        'FF0000', // context usage
  git:        '9966CC', // git branch
  rateLimit:  '4052D6', // rate limit %
  separator:  '6C6C6C', // separators & reset times
};
```
