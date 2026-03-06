#!/usr/bin/env node

import { execFileSync } from 'child_process';
import { readFile, writeFile, mkdir, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';

// --- Config ---
const CACHE_DIR = join(homedir(), '.cache', 'claude-statusline');
const CACHE_TTL_MS = 60_000;
const API_TIMEOUT_MS = 5_000;
const SESSION_DIR = join(CACHE_DIR, 'sessions');

// --- Colors ---
const hex = (h) => { const n = parseInt(h, 16); return `\x1b[38;2;${n>>16&255};${n>>8&255};${n&255}m`; };

const colors = {
  model:      '2D9B14', // model name
  timer:      'F0D23C', // session duration
  ctx:        'FF0000', // context usage
  git:        '9966CC', // git branch
  rateLimit:  '4052D6', // rate limit %
  separator:  '6C6C6C', // separators & reset times
};

const C = Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, hex(v)]));
C.reset = '\x1b[0m';
C.dim = '\x1b[2m';

function formatTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

// --- Stdin ---
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}

// --- Credentials ---
async function getToken() {
  try {
    if (process.platform === 'darwin') {
      const result = execFileSync(
        'security',
        ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();
      return JSON.parse(result)?.claudeAiOauth?.accessToken ?? null;
    }
    const content = await readFile(join(homedir(), '.claude', '.credentials.json'), 'utf-8');
    return JSON.parse(content)?.claudeAiOauth?.accessToken ?? null;
  } catch {
    return null;
  }
}

// --- Rate Limits API with file cache ---
function hashToken(token) {
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

async function fetchRateLimits() {
  const token = await getToken();
  if (!token) return null;

  const hash = hashToken(token);
  const cacheFile = join(CACHE_DIR, `cache-${hash}.json`);

  // Check file cache
  try {
    const raw = await readFile(cacheFile, 'utf-8');
    const cached = JSON.parse(raw);
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.data;
  } catch {}

  // Fetch from API
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    const limits = {
      five_hour: data.five_hour ?? null,
      seven_day: data.seven_day ?? null,
    };

    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cacheFile, JSON.stringify({ data: limits, timestamp: Date.now() }), { mode: 0o600 });
    return limits;
  } catch {
    return null;
  }
}

// --- Session Duration ---
async function getSessionDuration(sessionId) {
  if (!sessionId) return null;
  const safe = sessionId.replace(/[^a-zA-Z0-9-_]/g, '');
  const file = join(SESSION_DIR, `${safe}.json`);

  let startTime;
  try {
    const content = await readFile(file, 'utf-8');
    startTime = JSON.parse(content).startTime;
  } catch {
    startTime = Date.now();
    try {
      await mkdir(SESSION_DIR, { recursive: true });
      await writeFile(file, JSON.stringify({ startTime }));
    } catch {}
  }

  return Date.now() - startTime;
}

function formatDuration(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTimeRemaining(resetsAt) {
  if (!resetsAt) return null;
  const diff = new Date(resetsAt).getTime() - Date.now();
  if (diff <= 0) return null;

  const totalMin = Math.floor(diff / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// --- Git Branch ---
function getGitBranch(cwd) {
  if (!cwd) return null;
  try {
    return execFileSync('git', ['-C', cwd, 'symbolic-ref', '--short', 'HEAD'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim() || null;
  } catch {
    try {
      return execFileSync('git', ['-C', cwd, 'rev-parse', '--short', 'HEAD'], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim() || null;
    } catch {
      return null;
    }
  }
}

// --- Main ---
async function main() {
  const input = await readStdin();

  const model = input.model?.display_name ?? 'Unknown';
  const cwd = input.cwd ?? input.workspace?.current_dir ?? null;
  const usedPct = Math.round(input.context_window?.used_percentage ?? 0);
  const cw = input.context_window;
  const totalTokens = (cw?.current_usage?.input_tokens ?? 0)
    + (cw?.current_usage?.output_tokens ?? 0)
    + (cw?.current_usage?.cache_creation_input_tokens ?? 0)
    + (cw?.current_usage?.cache_read_input_tokens ?? 0);

  // Parallel fetches
  const [limits, elapsedMs] = await Promise.all([
    fetchRateLimits(),
    getSessionDuration(input.session_id),
  ]);

  const branch = getGitBranch(cwd);

  // --- Line 1 ---
  const line1Parts = [];
  line1Parts.push(`${C.model}\u2B21 ${model}${C.reset}`);

  if (elapsedMs != null) {
    line1Parts.push(`${C.timer}\u23F1 ${formatDuration(elapsedMs)}${C.reset}`);
  }

  line1Parts.push(`${C.ctx}\u2301 ${formatTokens(totalTokens)} ${usedPct}% ctx${C.reset}`);

  if (branch) {
    line1Parts.push(`${C.git}\u2387 ${branch}${C.reset}`);
  }

  // --- Line 2 ---
  const line2Parts = [];

  if (limits?.five_hour) {
    const pct = Math.round(limits.five_hour.utilization);
    const remaining = formatTimeRemaining(limits.five_hour.resets_at);
    let text = `${C.rateLimit}\u25F4 ${pct}%${C.reset} ${C.dim}\u00B7 5h${C.reset}`;
    if (remaining) text += ` ${C.separator}(${remaining})${C.reset}`;
    line2Parts.push(text);
  }

  if (limits?.seven_day) {
    const pct = Math.round(limits.seven_day.utilization);
    const remaining = formatTimeRemaining(limits.seven_day.resets_at);
    let text = `${C.rateLimit}\u25F7 ${pct}%${C.reset} ${C.dim}\u00B7 7d${C.reset}`;
    if (remaining) text += ` ${C.separator}(${remaining})${C.reset}`;
    line2Parts.push(text);
  }

  // --- Output ---
  const sep = ` ${C.separator}|${C.reset} `;
  let output = line1Parts.join(sep);
  if (line2Parts.length > 0) {
    output += '\n' + line2Parts.join(sep);
  }

  console.log(output);
}

main().catch(() => {
  console.log(`${C.timer}\u26A0\uFE0F${C.reset}`);
});
