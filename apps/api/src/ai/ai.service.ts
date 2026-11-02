import { BadRequestException, Injectable } from '@nestjs/common';
import type { z } from 'zod';
import { AI_PROVIDERS, dateKey, zonedTime, type AiProviderName, type AiSettingsDto, type aiSettingsSchema } from '@jobsmith/shared';
import { config } from '../config.js';
import { decryptSecret, encryptSecret } from '../common/crypto.js';
import { PrismaService } from '../prisma.service.js';
import { AiError, checkedBaseUrl, complete, parseJsonObject, type AiRequest, type AiResponse, type AiTarget } from './providers.js';

/** A demo visitor's own key can make this many calls in their 24 hours (ASSUMPTIONS.md). */
export const DEMO_AI_CALLS = 20;

export type FakeAi = (req: AiRequest, purpose: string) => Promise<AiResponse> | AiResponse;

export interface AiResult<T> {
  data: T;
  tokensIn: number;
  tokensOut: number;
}

/**
 * Bring your own key. Keys are AES-256-GCM encrypted at rest, write-only (only the last 4 characters are
 * ever returned) and never logged. Prompts and outputs are never logged or stored outside the agent run.
 * The app works with no key: callers check hasKey() and skip AI-only work.
 */
@Injectable()
export class AiService {
  /** Tests only: replaces every provider. Tests never call a real AI API. */
  static fake: FakeAi | null = null;

  constructor(private readonly prisma: PrismaService) {}

  defaults(): Record<AiProviderName, string> {
    const c = config();
    return { GEMINI: c.AI_MODEL_GEMINI, OPENAI: c.AI_MODEL_OPENAI, ANTHROPIC: c.AI_MODEL_ANTHROPIC, OPENAI_COMPATIBLE: '' };
  }

  private async monthStart(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true } });
    const month = dateKey(new Date(), user.timeZone).slice(0, 7);
    return { month, start: zonedTime(`${month}-01`, 0, 0, user.timeZone) };
  }

  async usage(userId: string) {
    const { month, start } = await this.monthStart(userId);
    const agg = await this.prisma.aiCall.aggregate({ where: { userId, createdAt: { gte: start } }, _count: true, _sum: { tokensIn: true, tokensOut: true } });
    return { month, requests: agg._count, tokensIn: agg._sum.tokensIn ?? 0, tokensOut: agg._sum.tokensOut ?? 0 };
  }

  async settings(userId: string): Promise<AiSettingsDto> {
    const s = await this.prisma.aiSettings.findUnique({ where: { userId } });
    return {
      provider: s?.provider ?? 'GEMINI',
      model: s?.model ?? null,
      baseUrl: s?.baseUrl ?? null,
      hasKey: !!s?.keyCipher || (s?.provider === 'OPENAI_COMPATIBLE' && !!s.baseUrl),
      keyLast4: s?.keyLast4 ?? null,
      monthlyLimit: s?.monthlyLimit ?? null,
      defaults: this.defaults(),
      usage: await this.usage(userId),
      localEndpointsAllowed: config().AI_ALLOW_LOCAL_ENDPOINTS,
    };
  }

  async update(userId: string, input: z.infer<typeof aiSettingsSchema>): Promise<AiSettingsDto> {
    if (!AI_PROVIDERS.includes(input.provider)) throw new BadRequestException({ message: 'Choose a provider.' });
    if (input.provider === 'OPENAI_COMPATIBLE') {
      try {
        await checkedBaseUrl(input.baseUrl);
      } catch (e) {
        throw new BadRequestException({ message: (e as Error).message, field: 'baseUrl' });
      }
    }
    const key = input.apiKey?.trim();
    const keyData = input.removeKey ? { keyCipher: null, keyLast4: null } : key ? { keyCipher: encryptSecret(key), keyLast4: key.slice(-4) } : {};
    const data = { provider: input.provider, model: input.model, baseUrl: input.provider === 'OPENAI_COMPATIBLE' ? input.baseUrl : null, monthlyLimit: input.monthlyLimit, ...keyData };
    await this.prisma.aiSettings.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    return this.settings(userId);
  }

  /** The decrypted target for a call, or null when the user has no usable key. Never leaves the server. */
  async target(userId: string): Promise<AiTarget | null> {
    const s = await this.prisma.aiSettings.findUnique({ where: { userId } });
    if (!s) return null;
    const needsKey = s.provider !== 'OPENAI_COMPATIBLE';
    if (needsKey && !s.keyCipher) return null;
    if (!needsKey && !s.baseUrl) return null;
    const model = s.model || this.defaults()[s.provider];
    if (!model) return null;
    return { provider: s.provider, model, apiKey: s.keyCipher ? decryptSecret(s.keyCipher) : '', baseUrl: s.baseUrl };
  }

  async hasKey(userId: string): Promise<boolean> {
    return AiService.fake ? !!(await this.prisma.aiSettings.findFirst({ where: { userId, OR: [{ keyCipher: { not: null } }, { baseUrl: { not: null } }] }, select: { id: true } })) : (await this.target(userId)) !== null;
  }

  private async checkLimit(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { isDemo: true } });
    if (u?.isDemo && (await this.prisma.aiCall.count({ where: { userId } })) >= DEMO_AI_CALLS) {
      throw new AiError('LIMIT', `The demo allows ${DEMO_AI_CALLS} AI requests per visitor. Run your own copy of Jobsmith for more.`);
    }
    const s = await this.prisma.aiSettings.findUnique({ where: { userId }, select: { monthlyLimit: true } });
    if (!s?.monthlyLimit) return;
    if ((await this.usage(userId)).requests >= s.monthlyLimit) throw new AiError('LIMIT', `You’ve reached your monthly limit of ${s.monthlyLimit} AI requests. Change it in Settings → AI.`);
  }

  /** One raw call, recorded in usage (counts only, never content). */
  async raw(userId: string, purpose: string, req: AiRequest): Promise<AiResponse> {
    await this.checkLimit(userId);
    const t = await this.target(userId);
    if (!t && !AiService.fake) throw new AiError('NO_KEY', 'Add an API key in Settings → AI to use this.');
    const provider = t?.provider ?? 'GEMINI';
    const model = t?.model ?? 'fake';
    try {
      const res = AiService.fake ? await AiService.fake(req, purpose) : await complete(t!, req);
      await this.prisma.aiCall.create({ data: { userId, purpose, provider, model, tokensIn: res.tokensIn, tokensOut: res.tokensOut, ok: true } });
      return res;
    } catch (e) {
      await this.prisma.aiCall.create({ data: { userId, purpose, provider, model, ok: false } });
      throw e instanceof AiError ? e : new AiError('PROVIDER', 'The AI call failed. Please try again.');
    }
  }

  /**
   * A JSON call validated against a Zod schema. An invalid answer is retried once with the validation
   * problems, then reported as a clear error (never saved).
   */
  async json<S extends z.ZodType>(userId: string, purpose: string, req: Omit<AiRequest, 'json'>, schema: S): Promise<AiResult<z.infer<S>>> {
    let tokensIn = 0;
    let tokensOut = 0;
    let problem = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const user = attempt === 0 ? req.user : `${req.user}\n\nYour previous answer was not valid: ${problem}. Reply again with one valid JSON object only.`;
      const res = await this.raw(userId, purpose, { ...req, user, json: true });
      tokensIn += res.tokensIn;
      tokensOut += res.tokensOut;
      const parsed = schema.safeParse(parseJsonObject(res.text));
      if (parsed.success) return { data: parsed.data, tokensIn, tokensOut };
      problem = parsed.error.issues
        .slice(0, 4)
        .map((i) => `${i.path.join('.') || 'answer'}: ${i.message}`)
        .join('; ');
    }
    throw Object.assign(new AiError('BAD_OUTPUT', `The AI’s answer didn’t pass the checks twice (${problem}). Try running this step again.`), { tokensIn, tokensOut });
  }

  /** Settings → AI → "Test key". */
  async test(userId: string) {
    try {
      const res = await this.raw(userId, 'test', { system: 'Reply with the single word OK.', user: 'Say OK.', json: false, maxTokens: 20 });
      return { ok: true, message: res.text.trim() ? 'The key works.' : 'The provider answered, but with an empty reply. Check the model name.' };
    } catch (e) {
      return { ok: false, message: e instanceof AiError ? e.message : 'The test failed.' };
    }
  }
}
