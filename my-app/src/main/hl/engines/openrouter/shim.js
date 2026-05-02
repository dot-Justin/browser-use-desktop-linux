#!/usr/bin/env node
/* eslint-disable no-console */

const https = require('node:https');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemini-2.5-flash';
const MAX_TURNS = 50;
const MAX_BUFFER = 1024 * 1024;
const DEFAULT_TOOL_TIMEOUT_MS = 120_000;
const MAX_TOOL_TIMEOUT_MS = 300_000;

function emit(evt) {
  process.stdout.write(`${JSON.stringify(evt)}\n`);
}

function sessionId() {
  if (typeof crypto.randomUUID === 'function') return `or-${crypto.randomUUID()}`;
  return `or-${crypto.randomBytes(16).toString('hex')}`;
}

function errMessage(err) {
  return err && typeof err.message === 'string' ? err.message : String(err);
}

function normalizeTimeout(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_TOOL_TIMEOUT_MS;
  return Math.max(1_000, Math.min(MAX_TOOL_TIMEOUT_MS, Math.floor(value)));
}

function safeJsonParse(raw, fallback) {
  if (!raw || typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function executeBash(args) {
  const command = args && typeof args.command === 'string' ? args.command : '';
  const timeout = normalizeTimeout(args && args.timeout);
  const started = Date.now();
  if (!command.trim()) {
    return { ok: false, output: 'Missing required bash argument: command', ms: Date.now() - started };
  }

  const result = spawnSync('bash', ['-c', command], {
    encoding: 'utf8',
    timeout,
    maxBuffer: MAX_BUFFER,
    env: process.env,
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const output = `${stdout}${stderr ? `${stdout ? '\n' : ''}${stderr}` : ''}`;
  const timedOut = result.error && result.error.code === 'ETIMEDOUT';
  const ok = !timedOut && !result.error && result.status === 0;
  const detail = result.error && !timedOut ? `\n[error] ${result.error.message}` : '';
  const status = typeof result.status === 'number' ? `\n[exit ${result.status}]` : '';
  return {
    ok,
    output: `${output}${timedOut ? `\n[timeout after ${timeout}ms]` : ''}${detail}${ok ? '' : status}`.trim(),
    ms: Date.now() - started,
  };
}

function requestChat(body, apiKey) {
  return new Promise((resolve, reject) => {
    const req = https.request(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        accept: 'text/event-stream',
        'x-title': 'Browser Use Desktop',
      },
    }, (res) => {
      res.setEncoding('utf8');
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        let failure = '';
        res.on('data', (chunk) => {
          failure += chunk;
          if (failure.length > 8192) failure = failure.slice(-8192);
        });
        res.on('end', () => reject(new Error(`OpenRouter HTTP ${res.statusCode}: ${failure.trim()}`)));
        return;
      }

      const toolCalls = new Map();
      let assistantText = '';
      let usage = null;
      let buffer = '';
      let failed = false;

      function handlePayload(payload) {
        if (!payload || payload === '[DONE]') return;
        const json = safeJsonParse(payload, null);
        if (!json) return;
        if (json.error) {
          const msg = typeof json.error.message === 'string' ? json.error.message : JSON.stringify(json.error);
          throw new Error(msg);
        }
        if (json.usage) usage = json.usage;
        const choices = Array.isArray(json.choices) ? json.choices : [];
        for (const choice of choices) {
          const delta = choice && choice.delta ? choice.delta : {};
          if (typeof delta.content === 'string' && delta.content.length > 0) {
            assistantText += delta.content;
            emit({ type: 'text_delta', text: delta.content });
          }
          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const index = typeof tc.index === 'number' ? tc.index : toolCalls.size;
              const existing = toolCalls.get(index) || {
                id: '',
                type: 'function',
                function: { name: '', arguments: '' },
              };
              if (typeof tc.id === 'string') existing.id += tc.id;
              if (typeof tc.type === 'string') existing.type = tc.type;
              if (tc.function) {
                if (typeof tc.function.name === 'string') existing.function.name += tc.function.name;
                if (typeof tc.function.arguments === 'string') existing.function.arguments += tc.function.arguments;
              }
              toolCalls.set(index, existing);
            }
          }
        }
      }

      res.on('data', (chunk) => {
        if (failed) return;
        try {
          buffer += chunk;
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;
            handlePayload(trimmed.slice(5).trim());
          }
        } catch (err) {
          failed = true;
          req.destroy();
          reject(err);
        }
      });
      res.on('end', () => {
        if (failed) return;
        try {
          if (buffer.trim().startsWith('data:')) handlePayload(buffer.trim().slice(5).trim());
          resolve({ assistantText, usage, toolCalls: Array.from(toolCalls.values()) });
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(120_000, () => {
      req.destroy(new Error('OpenRouter request timed out'));
    });
    req.write(JSON.stringify(body));
    req.end();
  });
}

const tools = [
  {
    type: 'function',
    function: {
      name: 'bash',
      description: 'Execute a bash command in the Browser Use harness working directory.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to execute with bash -c.' },
          timeout: { type: 'number', description: 'Optional timeout in milliseconds, maximum 300000.' },
        },
        required: ['command'],
        additionalProperties: false,
      },
    },
  },
];

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const prompt = process.env.OPENROUTER_PROMPT || '';
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is required');
  if (!prompt) throw new Error('OPENROUTER_PROMPT is required');

  emit({ type: 'init', session_id: sessionId(), model });

  const messages = [{ role: 'user', content: prompt }];
  let lastAssistantText = '';

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await requestChat({
      model,
      messages,
      tools,
      tool_choice: 'auto',
      stream: true,
      stream_options: { include_usage: true },
    }, apiKey);

    const inputTokens = typeof response.usage?.prompt_tokens === 'number'
      ? response.usage.prompt_tokens
      : typeof response.usage?.input_tokens === 'number' ? response.usage.input_tokens : 0;
    const outputTokens = typeof response.usage?.completion_tokens === 'number'
      ? response.usage.completion_tokens
      : typeof response.usage?.output_tokens === 'number' ? response.usage.output_tokens : 0;
    emit({ type: 'usage', input_tokens: inputTokens, output_tokens: outputTokens });

    const callableTools = response.toolCalls.filter((tc) => tc && tc.function && tc.function.name);
    if (response.assistantText.trim()) lastAssistantText = response.assistantText.trim();

    if (callableTools.length === 0) {
      emit({ type: 'done', summary: (lastAssistantText || 'Task completed').slice(0, 500) });
      return;
    }

    const assistantMessage = {
      role: 'assistant',
      content: response.assistantText || null,
      tool_calls: callableTools.map((tc, idx) => ({
        id: tc.id || `call_${turn}_${idx}`,
        type: 'function',
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments || '{}',
        },
      })),
    };
    messages.push(assistantMessage);

    for (const tc of assistantMessage.tool_calls) {
      const parsedArgs = safeJsonParse(tc.function.arguments, {});
      emit({ type: 'tool_call', id: tc.id, name: tc.function.name, args: parsedArgs });
      let result;
      if (tc.function.name === 'bash') {
        result = executeBash(parsedArgs);
      } else {
        result = { ok: false, output: `Unknown tool: ${tc.function.name}`, ms: 0 };
      }
      emit({ type: 'tool_result', id: tc.id, ok: result.ok, output: result.output, ms: result.ms });
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: result.output || (result.ok ? '(no output)' : '(failed with no output)'),
      });
    }
  }

  emit({ type: 'done', summary: 'Stopped after 50 OpenRouter turns to prevent runaway execution.' });
}

main().catch((err) => {
  emit({ type: 'error', message: errMessage(err) });
  process.exitCode = 1;
});
