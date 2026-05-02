/**
 * OpenRouter engine adapter.
 *
 * OpenRouter is HTTP-only, so this adapter spawns a small Node.js shim that
 * runs the agent/tool loop and emits NDJSON matching the engine runner.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { app } from 'electron';
import { mainLogger } from '../../../logger';
import { loadOpenRouterKey } from '../../../identity/authStore';
import { estimateCostUsd } from '../../pricing';
import { register } from '../registry';
import { enrichedEnv } from '../pathEnrich';
import type {
  AuthProbe,
  EngineAdapter,
  InstallProbe,
  ParseContext,
  ParseResult,
  SpawnContext,
} from '../types';
import type { HlEvent } from '../../../../shared/session-schemas';

const ID = 'openrouter';
const DISPLAY = 'OpenRouter';
const BIN = 'node';
const DEFAULT_MODEL = 'google/gemini-2.5-flash';

function runCli(args: string[], timeoutMs = 5000): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let child;
    try { child = spawn(BIN, args, { stdio: ['ignore', 'pipe', 'pipe'], env: enrichedEnv() }); }
    catch { resolve({ ok: false, stdout: '', stderr: 'spawn failed' }); return; }
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (d) => (stdout += String(d)));
    child.stderr.on('data', (d) => (stderr += String(d)));
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.on('error', () => { clearTimeout(timer); resolve({ ok: false, stdout, stderr }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ ok: code === 0, stdout, stderr }); });
  });
}

function buildPrompt(ctx: SpawnContext): string {
  const lines: string[] = [
    'You are driving a specific Chromium browser view on this machine.',
    `Your target is CDP target_id=${ctx.targetId} on port ${ctx.cdpPort} (env BU_TARGET_ID / BU_CDP_PORT).`,
    'You have one tool: bash(command: string, timeout?: number). Use it to run Node.js scripts and inspect files in the Browser Use harness working directory.',
    'Read `./AGENTS.md` for how to drive the browser in this harness.',
    'Always read `./helpers.js` before writing scripts — that is where the functions live. Edit it if a helper is missing.',
  ];
  if (ctx.attachmentRefs.length > 0) {
    lines.push('', 'The user attached these files for this task. Read each one before acting:');
    for (const a of ctx.attachmentRefs) lines.push(`  - ${a.relPath} (${a.mime}, ${a.size} bytes)`);
  }
  lines.push(
    '',
    `When the user asks you to produce a file (a report, CSV, screenshot, transcript, etc.), save it to \`./outputs/${ctx.sessionId}/\`. Mention the filename in your final answer.`,
    '',
    `Task: ${ctx.prompt}`,
  );
  return lines.join('\n');
}

function splitSavedCredentials(savedApiKey: string | undefined): { apiKey: string; model: string } {
  const [apiKey = '', model = ''] = (savedApiKey ?? '\n').split('\n');
  return { apiKey, model: model || DEFAULT_MODEL };
}

export function resolveShimPath(): string {
  if (app.isPackaged) {
    const preferred = path.join(process.resourcesPath, 'openrouter-shim.js');
    if (fs.existsSync(preferred)) return preferred;
    return path.join(process.resourcesPath, 'shim.js');
  }
  return path.join(app.getAppPath(), 'src/main/hl/engines/openrouter/shim.js');
}

const openrouterAdapter: EngineAdapter = {
  id: ID,
  displayName: DISPLAY,
  binaryName: BIN,

  async probeInstalled(): Promise<InstallProbe> {
    const r = await runCli(['--version']);
    if (!r.ok) return { installed: false, error: r.stderr || 'node not found on PATH' };
    const version = (r.stdout || r.stderr).trim().replace(/^v/, '');
    return { installed: true, version: version || undefined };
  },

  async probeAuthed(): Promise<AuthProbe> {
    try {
      const key = await loadOpenRouterKey();
      return key ? { authed: true } : { authed: false, error: 'OpenRouter API key not configured' };
    } catch (err) {
      return { authed: false, error: (err as Error).message };
    }
  },

  async openLoginInTerminal(): Promise<{ opened: boolean; error?: string }> {
    return { opened: true };
  },

  wrapPrompt(ctx: SpawnContext): string {
    return buildPrompt(ctx);
  },

  buildSpawnArgs(): string[] {
    return [resolveShimPath()];
  },

  buildEnv(ctx: SpawnContext, baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const env = enrichedEnv(baseEnv);
    const { apiKey, model } = splitSavedCredentials(ctx.savedApiKey);
    env.OPENROUTER_API_KEY = apiKey;
    env.OPENROUTER_MODEL = model;
    env.OPENROUTER_PROMPT = buildPrompt(ctx);
    env.BU_TARGET_ID = ctx.targetId;
    env.BU_CDP_PORT = String(ctx.cdpPort);
    return env;
  },

  parseLine(line: string, ctx: ParseContext): ParseResult {
    let evt: unknown;
    try { evt = JSON.parse(line); } catch { return { events: [] }; }
    if (!evt || typeof evt !== 'object') return { events: [] };
    const e = evt as Record<string, unknown>;
    const type = e.type as string | undefined;
    const events: HlEvent[] = [];
    let capturedSessionId: string | undefined;
    let terminalError: string | undefined;

    if (type === 'init') {
      if (typeof e.session_id === 'string') capturedSessionId = e.session_id;
      if (typeof e.model === 'string') ctx.currentModel = e.model;
      mainLogger.info('openrouter.init', { session_id: capturedSessionId, model: ctx.currentModel });
      return { events, capturedSessionId };
    }

    if (type === 'text_delta') {
      if (typeof e.text === 'string' && e.text.length > 0) {
        events.push({ type: 'thinking', text: e.text });
        ctx.lastNarrative = `${ctx.lastNarrative ?? ''}${e.text}`;
      }
      return { events };
    }

    if (type === 'tool_call') {
      const id = typeof e.id === 'string' ? e.id : `openrouter-tool-${Date.now()}`;
      const name = typeof e.name === 'string' ? e.name : 'unknown';
      const args = e.args && typeof e.args === 'object' ? e.args as Record<string, unknown> : {};
      ctx.pendingTools.set(id, { name, startedAt: Date.now(), iter: ctx.iter });
      events.push({
        type: 'tool_call',
        name,
        args: { preview: typeof args.command === 'string' ? args.command : JSON.stringify(args), ...args },
        iteration: ctx.iter,
      });
      return { events };
    }

    if (type === 'tool_result') {
      const id = typeof e.id === 'string' ? e.id : '';
      const match = ctx.pendingTools.get(id);
      const output = typeof e.output === 'string' ? e.output : '';
      const ok = e.ok === true;
      const ms = typeof e.ms === 'number' ? e.ms : match ? Date.now() - match.startedAt : 0;
      const name = match?.name ?? 'unknown';
      events.push({ type: 'tool_result', name, ok, preview: output.slice(0, 2000), ms });
      if (id) ctx.pendingTools.delete(id);
      return { events };
    }

    if (type === 'usage') {
      const inputTokens = typeof e.input_tokens === 'number' ? e.input_tokens : 0;
      const outputTokens = typeof e.output_tokens === 'number' ? e.output_tokens : 0;
      if (inputTokens > 0 || outputTokens > 0) {
        const costUsd = estimateCostUsd(ctx.currentModel, { inputTokens, outputTokens, cachedInputTokens: 0 });
        events.push({
          type: 'turn_usage',
          inputTokens,
          outputTokens,
          cachedInputTokens: 0,
          costUsd,
          model: ctx.currentModel,
          source: 'estimated',
        });
      }
      ctx.iter++;
      return { events };
    }

    if (type === 'done') {
      const summary = typeof e.summary === 'string' && e.summary.trim()
        ? e.summary
        : (ctx.lastNarrative ?? '').trim() || 'Task completed';
      events.push({ type: 'done', summary, iterations: ctx.iter });
      ctx.lastNarrative = undefined;
      return { events, terminalDone: true };
    }

    if (type === 'error') {
      const msg = typeof e.message === 'string' ? e.message : 'openrouter_error';
      terminalError = `openrouter_error: ${msg}`;
      events.push({ type: 'error', message: terminalError });
      return { events, terminalError };
    }

    return { events };
  },
};

register(openrouterAdapter);
