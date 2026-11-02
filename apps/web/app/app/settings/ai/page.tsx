'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, KeyRound, ShieldCheck, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { AI_PROVIDERS, AI_PROVIDER_LABELS, aiSettingsSchema, type AiProviderName, type AiSettingsDto } from '@jobsmith/shared';
import { Field } from '@/components/field';
import { FormError } from '@/components/form-error';
import { PasswordInput } from '@/components/password-input';
import { Section } from '@/components/section';
import { ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { api, errorMessage } from '@/lib/api';
import { useForm } from '@/lib/form';
import { useApi } from '@/lib/use-api';

const KEY_HELP: Record<AiProviderName, { text: string; url?: string }> = {
  GEMINI: { text: 'Free tier available with no card. Create a key in Google AI Studio.', url: 'https://aistudio.google.com/apikey' },
  OPENAI: { text: 'Paid. Create a key in the OpenAI dashboard.', url: 'https://platform.openai.com/api-keys' },
  ANTHROPIC: { text: 'Paid. Create a key in the Anthropic Console.', url: 'https://console.anthropic.com/settings/keys' },
  OPENAI_COMPATIBLE: { text: 'Any server that speaks the OpenAI chat API: Ollama, LM Studio, OpenRouter, and others.' },
};

function Form({ s, onSaved }: { s: AiSettingsDto; onSaved: (s: AiSettingsDto) => void }) {
  const [provider, setProvider] = useState<AiProviderName>(s.provider);
  const [model, setModel] = useState(s.model ?? '');
  const [baseUrl, setBaseUrl] = useState(s.baseUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [limit, setLimit] = useState(s.monthlyLimit ? String(s.monthlyLimit) : '');
  const [testing, setTesting] = useState(false);
  const form = useForm(aiSettingsSchema);
  useEffect(() => setApiKey(''), [s]);
  const help = KEY_HELP[provider];

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const saved = await form.submit<AiSettingsDto>({ provider, model: model || null, baseUrl: baseUrl || null, apiKey: apiKey || undefined, monthlyLimit: limit ? Number(limit) : null }, '/ai/settings', { method: 'PUT' });
        if (saved) {
          toast.success('AI settings saved');
          onSaved(saved);
        }
      }}
    >
      <FormError message={form.formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Provider">
          {(p) => (
            <NativeSelect {...p} value={provider} onChange={(e) => setProvider(e.target.value as AiProviderName)}>
              {AI_PROVIDERS.map((x) => (
                <option key={x} value={x}>
                  {AI_PROVIDER_LABELS[x]}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label="Model" optional hint={s.defaults[provider] ? `Leave empty to use ${s.defaults[provider]}.` : 'The model name your server offers, e.g. llama3.1.'} error={form.errors['model']}>
          {(p) => <Input {...p} value={model} onChange={(e) => setModel(e.target.value)} placeholder={s.defaults[provider] || 'llama3.1'} />}
        </Field>
      </div>
      {provider === 'OPENAI_COMPATIBLE' ? (
        <Field
          label="Endpoint URL"
          hint={s.localEndpointsAllowed ? 'For Ollama on this machine: http://localhost:11434/v1' : 'Local and private addresses (like Ollama on this server) need AI_ALLOW_LOCAL_ENDPOINTS=true in the server settings.'}
          error={form.errors['baseUrl']}
        >
          {(p) => <Input {...p} type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://openrouter.ai/api/v1" />}
        </Field>
      ) : null}
      <Field
        label="API key"
        optional={provider === 'OPENAI_COMPATIBLE'}
        hint={
          <span>
            {s.keyLast4 ? `A key ending in ${s.keyLast4} is saved. Type a new one to replace it. ` : ''}
            {help.text}{' '}
            {help.url ? (
              <a href={help.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-brand hover:underline">
                Get a key <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : null}
          </span>
        }
        error={form.errors['apiKey']}
      >
        {(p) => <PasswordInput {...p} value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" placeholder={s.keyLast4 ? `••••••••${s.keyLast4}` : ''} />}
      </Field>
      <Field label="Monthly request limit" optional hint="Stops AI calls for the rest of the month once reached. Useful on a paid key." error={form.errors['monthlyLimit']}>
        {(p) => <Input {...p} inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, ''))} placeholder="No limit" className="max-w-40" />}
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        {s.keyLast4 ? (
          <Button
            type="button"
            variant="ghost"
            className="text-bad hover:bg-bad-tint hover:text-bad"
            onClick={async () => {
              onSaved(await api<AiSettingsDto>('/ai/settings', { method: 'PUT', body: { provider, model: model || null, baseUrl: baseUrl || null, removeKey: true, monthlyLimit: limit ? Number(limit) : null } }));
              toast.success('Key removed');
            }}
          >
            Remove key
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={!s.hasKey || testing}
          onClick={async () => {
            setTesting(true);
            try {
              const r = await api<{ ok: boolean; message: string }>('/ai/test', { method: 'POST' });
              if (r.ok) toast.success(r.message);
              else toast.error(r.message);
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setTesting(false);
            }
          }}
        >
          {testing ? 'Testing…' : 'Test key'}
        </Button>
        <Button type="submit" disabled={form.pending}>
          {form.pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}

export default function AiSettingsPage() {
  const { data, error, loading, reload, setData } = useApi<AiSettingsDto>('/ai/settings');
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <ListSkeleton rows={4} />;
  if (!data) return null;
  return (
    <div className="space-y-6">
      <Section
        title="AI provider"
        description="Bring your own key. The agent uses it to read jobs and draft letters and messages. Everything else in Jobsmith works without one."
        actions={
          data.hasKey ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-ok-tint px-2.5 py-1 text-xs font-semibold text-ok">
              <CheckCircle2 className="size-3.5" aria-hidden /> Key saved
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-none-tint px-2.5 py-1 text-xs font-semibold text-none">
              <KeyRound className="size-3.5" aria-hidden /> No key yet
            </span>
          )
        }
      >
        <Form s={data} onSaved={setData} />
      </Section>

      <Section title={`Usage this month (${data.usage.month})`}>
        <dl className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Requests</dt>
            <dd className="text-xl font-bold tabular-nums">
              {data.usage.requests}
              {data.monthlyLimit ? <span className="text-sm font-medium text-muted-foreground"> / {data.monthlyLimit}</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tokens in</dt>
            <dd className="text-xl font-bold tabular-nums">{data.usage.tokensIn.toLocaleString('en-GB')}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tokens out</dt>
            <dd className="text-xl font-bold tabular-nums">{data.usage.tokensOut.toLocaleString('en-GB')}</dd>
          </div>
        </dl>
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex gap-3 rounded-lg border border-warn/25 bg-warn-tint p-4 text-sm text-warn">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>
            <span className="font-semibold">Free tiers may use your prompts to improve the provider’s products.</span> Your profile and job adverts are sent with each agent step, so don’t put anything in your profile you wouldn’t want shared. Paid tiers usually don’t train on your data; check your provider’s terms.
          </p>
        </div>
        <div className="flex gap-3 rounded-lg border border-border bg-paper p-4 text-sm text-ink-soft">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />
          <p>Your key is encrypted on this server and never shown again, logged or sent to your browser. Only its last four characters are displayed.</p>
        </div>
      </div>
    </div>
  );
}
