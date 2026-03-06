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
curl -o ~/.claude/statusline.mjs https://raw.githubusercontent.com/Meldren/ClaudeStatusLine/main/statusline.mjs
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

Edit the `C` object in `statusline.mjs` to change colors. Values are RGB via ANSI escape codes:

```js
const C = {
  modelGreen: '\x1b[38;2;45;155;20m',   // model name
  timer:      '\x1b[38;2;240;210;60m',   // session timer
  ctx:        '\x1b[38;2;255;0;0m',       // context usage
  git:        '\x1b[38;2;153;102;204m',   // git branch
  blue:       '\x1b[38;2;64;82;214m',     // rate limit %
  gray:       '\x1b[38;5;243m',           // separators & reset times
};
```

Format: `\x1b[38;2;R;G;Bm` where R, G, B are 0-255.
