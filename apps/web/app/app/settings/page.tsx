'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { TIME_ZONES, settingsSchema, type Settings } from '@jobsmith/shared';
import { Field } from '@/components/field';
import { FormError } from '@/components/form-error';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useForm } from '@/lib/form';
import { useSession } from '@/lib/session';

const toList = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

export default function JobSearchSettingsPage() {
  const { me, reload } = useSession();
  const [v, setV] = useState<Settings>(me.settings);
  const [roles, setRoles] = useState(me.settings.targetRoles.join(', '));
  const [places, setPlaces] = useState(me.settings.targetLocations.join(', '));
  const form = useForm(settingsSchema);
  const set = <K extends keyof Settings>(k: K, value: Settings[K]) => setV((x) => ({ ...x, [k]: value }));
  const zones = TIME_ZONES.includes(v.timeZone as (typeof TIME_ZONES)[number]) ? TIME_ZONES : [v.timeZone, ...TIME_ZONES];

  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const saved = await form.submit<Settings>({ ...v, targetRoles: toList(roles), targetLocations: toList(places) }, '/me', { method: 'PATCH' });
        if (saved) {
          toast.success('Settings saved');
          await reload();
        }
      }}
    >
      <FormError message={form.formError} />
      <Section title="About you" description="Used for dates, the salary check and the agent’s drafts.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={form.errors['name']}>
            {(p) => <Input {...p} value={v.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" />}
          </Field>
          <Field label="Home city" optional error={form.errors['homeCity']}>
            {(p) => <Input {...p} value={v.homeCity ?? ''} onChange={(e) => set('homeCity', e.target.value)} placeholder="Manchester" />}
          </Field>
          <Field label="Time zone" error={form.errors['timeZone']}>
            {(p) => (
              <NativeSelect {...p} value={v.timeZone} onChange={(e) => set('timeZone', e.target.value)}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z.replace('_', ' ')}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label="Work authorisation" optional hint="Free text, e.g. “Graduate visa, new entrant” or “British citizen”." error={form.errors['workAuthNotes']}>
            {(p) => <Input {...p} value={v.workAuthNotes ?? ''} onChange={(e) => set('workAuthNotes', e.target.value)} />}
          </Field>
        </div>
      </Section>

      <Section title="What you’re looking for">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Target roles" optional hint="Separate with commas." error={form.errors['targetRoles']}>
            {(p) => <Input {...p} value={roles} onChange={(e) => setRoles(e.target.value)} placeholder="Full-stack developer, Backend engineer" />}
          </Field>
          <Field label="Target locations" optional hint="Separate with commas." error={form.errors['targetLocations']}>
            {(p) => <Input {...p} value={places} onChange={(e) => setPlaces(e.target.value)} placeholder="London, Remote (UK), Dublin" />}
          </Field>
          <Field label="Weekly application target" hint="Shown on your dashboard." error={form.errors['weeklyTarget']}>
            {(p) => <Input {...p} type="number" min={0} max={100} value={v.weeklyTarget} onChange={(e) => set('weeklyTarget', Number(e.target.value))} />}
          </Field>
          <Field label="Follow up after (days)" hint="A reminder appears this many days after you apply, if you’ve heard nothing." error={form.errors['followUpDays']}>
            {(p) => <Input {...p} type="number" min={1} max={60} value={v.followUpDays} onChange={(e) => set('followUpDays', Number(e.target.value))} />}
          </Field>
        </div>
      </Section>

      <Section title="Your writing style" description="The agent follows this note when it drafts cover letters and messages.">
        <Field label="Style note" optional error={form.errors['styleNote']}>
          {(p) => (
            <Textarea
              {...p}
              rows={4}
              value={v.styleNote ?? ''}
              onChange={(e) => set('styleNote', e.target.value)}
              placeholder="Plain and direct. Short sentences. Mention numbers where I have them. No exclamation marks."
            />
          )}
        </Field>
      </Section>

      <Section title="Reminders">
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="block font-medium">Email me my reminders</span>
            <span className="block text-sm text-muted-foreground">
              {me.mailEnabled ? 'Follow-ups, interviews tomorrow, closing dates and take-home deadlines.' : 'This server has no email set up, so reminders show in the app only.'}
            </span>
          </span>
          <Switch checked={v.emailReminders && me.mailEnabled} disabled={!me.mailEnabled} onCheckedChange={(c) => set('emailReminders', c)} aria-label="Email me my reminders" />
        </label>
      </Section>

      <div className="flex justify-end">
        <Button type="submit" disabled={form.pending}>
          {form.pending ? 'Saving…' : 'Save settings'}
        </Button>
      </div>
    </form>
  );
}
