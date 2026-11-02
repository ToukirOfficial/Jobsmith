import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { AiProviderName } from '@jobsmith/shared';
import { config } from '../config.js';
import { isPublicAddress } from '../job-fetch/safe-fetch.js';

export interface AiRequest {
  system: string;
  user: string;
  json: boolean;
  maxTokens?: number;
}
export interface AiResponse {
  text: string;
  tokensIn: number;
  tokensOut: number;
}
export interface AiTarget {
  provider: AiProviderName;
  model: string;
  apiKey: string;
  baseUrl: string | null;
}

export class AiError extends Error {
  constructor(
    public code: 'NO_KEY' | 'AUTH' | 'RATE_LIMIT' | 'PROVIDER' | 'TIMEOUT' | 'BAD_OUTPUT' | 'LIMIT' | 'BLOCKED_ENDPOINT',
    message: string,
  ) {
    super(message);
  }
}

/** One small interface over four providers, using plain fetch (no SDKs). Model names come from settings. */
export async function complete(t: AiTarget, req: AiRequest): Promise<AiResponse> {
  const signal = AbortSignal.timeout(config().AI_TIMEOUT_MS);
  const max = req.maxTokens ?? 1500;
  let res: Response;
  try {
    if (t.provider === 'GEMINI') {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(t.model)}:generateContent`, {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': t.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: 'user', parts: [{ text: req.user }] }],
          generationConfig: { maxOutputTokens: max * 3, temperature: 0.4, ...(req.json ? { responseMimeType: 'application/json' } : {}) },
        }),
      });
    } else if (t.provider === 'ANTHROPIC') {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', 'x-api-key': t.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: t.model, max_tokens: max, system: req.system + (req.json ? '\n\nReply with the JSON object only, no other text.' : ''), messages: [{ role: 'user', content: req.user }] }),
      });
    } else {
      const base = t.provider === 'OPENAI' ? 'https://api.openai.com/v1' : await checkedBaseUrl(t.baseUrl);
      res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', ...(t.apiKey ? { authorization: `Bearer ${t.apiKey}` } : {}) },
        body: JSON.stringify({
          model: t.model,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
          ...(t.provider === 'OPENAI' ? { max_completion_tokens: max * 3 } : { max_tokens: max }),
          ...(req.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
    }
  } catch (e) {
    if (e instanceof AiError) throw e;
    if ((e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError') throw new AiError('TIMEOUT', 'The AI provider took too long to answer.');
    throw new AiError('PROVIDER', 'Couldn’t reach the AI provider. Check the provider settings and your connection.');
  }
  if (res.status === 401 || res.status === 403) throw new AiError('AUTH', 'The AI provider refused the key. Check it in Settings → AI.');
  if (res.status === 429) throw new AiError('RATE_LIMIT', 'The AI provider says you’ve hit its rate limit or quota. Try again later.');
  if (!res.ok) throw new AiError('PROVIDER', `The AI provider answered with an error (${res.status}). Check the model name in Settings → AI.`);
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) throw new AiError('PROVIDER', 'The AI provider sent an unreadable answer.');
  return readResponse(t.provider, body);
}

/** Reads a nested value from provider JSON without trusting its shape. */
function at(o: unknown, ...path: (string | number)[]): unknown {
  let cur = o;
  for (const k of path) cur = cur && typeof cur === 'object' ? (cur as Record<string | number, unknown>)[k] : undefined;
  return cur;
}
const texts = (parts: unknown, onlyText = false) =>
  (Array.isArray(parts) ? parts : [])
    .filter((p) => !onlyText || at(p, 'type') === 'text')
    .map((p) => String(at(p, 'text') ?? ''))
    .join('');

function readResponse(provider: AiProviderName, b: Record<string, unknown>): AiResponse {
  if (provider === 'GEMINI') {
    return { text: texts(at(b, 'candidates', 0, 'content', 'parts')), tokensIn: Number(at(b, 'usageMetadata', 'promptTokenCount') ?? 0), tokensOut: Number(at(b, 'usageMetadata', 'candidatesTokenCount') ?? 0) };
  }
  if (provider === 'ANTHROPIC') {
    return { text: texts(at(b, 'content'), true), tokensIn: Number(at(b, 'usage', 'input_tokens') ?? 0), tokensOut: Number(at(b, 'usage', 'output_tokens') ?? 0) };
  }
  return { text: String(at(b, 'choices', 0, 'message', 'content') ?? ''), tokensIn: Number(at(b, 'usage', 'prompt_tokens') ?? 0), tokensOut: Number(at(b, 'usage', 'completion_tokens') ?? 0) };
}

/**
 * An OpenAI-compatible base URL is chosen by the user, so it is checked like a job link: private and local
 * addresses are refused unless the server owner allowed them (AI_ALLOW_LOCAL_ENDPOINTS, for Ollama).
 */
export async function checkedBaseUrl(raw: string | null): Promise<string> {
  if (!raw) throw new AiError('BLOCKED_ENDPOINT', 'Add the endpoint URL for your OpenAI-compatible provider.');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AiError('BLOCKED_ENDPOINT', 'The endpoint URL isn’t valid.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new AiError('BLOCKED_ENDPOINT', 'The endpoint must use http or https.');
  if (url.username || url.password) throw new AiError('BLOCKED_ENDPOINT', 'Put the key in the API key field, not in the URL.');
  if (!config().AI_ALLOW_LOCAL_ENDPOINTS) {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
    if (!addresses.length || addresses.some((a) => !isPublicAddress(a))) {
      throw new AiError('BLOCKED_ENDPOINT', 'That endpoint is on a private or local address. The server owner can allow this with AI_ALLOW_LOCAL_ENDPOINTS=true (for Ollama).');
    }
  }
  return url.href;
}

/** Models sometimes wrap JSON in prose or code fences: take the first complete object. */
export function parseJsonObject(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
