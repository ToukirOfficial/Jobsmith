'use client';

import { useState } from 'react';
import { CalendarClock, CheckCircle2, ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { INTERVIEW_TYPES, INTERVIEW_TYPE_LABELS, formatDateTime, interviewSchema, type InterviewDto, type InterviewType } from '@jobsmith/shared';
import { Confirm } from '@/components/confirm';
import { Field } from '@/components/field';
import { FormDialog } from '@/components/form-dialog';
import { FormError } from '@/components/form-error';
import { Section } from '@/components/section';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { fromLocalInput, toLocalInput } from '@/lib/datetime';
import { useForm } from '@/lib/form';
import { useSession } from '@/lib/session';

function InterviewForm({ applicationId, interview, onDone }: { applicationId: string; interview?: InterviewDto; onDone: () => void }) {
  const { tz } = useSession();
  const [v, setV] = useState({
    type: (interview?.type ?? 'PHONE_SCREEN') as InterviewType,
    when: toLocalInput(interview?.startsAt ?? interview?.dueAt, tz),
    durationMins: interview?.durationMins ? String(interview.durationMins) : '',
    interviewers: interview?.interviewers ?? '',
    location: interview?.location ?? '',
    prepNotes: interview?.prepNotes ?? '',
    reflections: interview?.reflections ?? '',
    completed: !!interview?.completedAt,
  });
  const form = useForm(interviewSchema);
  const takeHome = v.type === 'TAKE_HOME';
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const when = fromLocalInput(v.when, tz);
        const body = {
          applicationId,
          type: v.type,
          startsAt: takeHome ? null : when,
          dueAt: takeHome ? when : null,
          durationMins: v.durationMins ? Number(v.durationMins) : null,
          interviewers: v.interviewers || null,
          location: v.location || null,
          prepNotes: v.prepNotes || null,
          reflections: v.reflections || null,
          completed: v.completed,
        };
        const ok = interview ? await form.submit(body, `/interviews/${interview.id}`, { method: 'PATCH' }) : await form.submit(body, '/interviews');
        if (ok) {
          toast.success(interview ? 'Interview updated' : 'Interview added');
          onDone();
        }
      }}
    >
      <FormError message={form.formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type">
          {(p) => (
            <NativeSelect {...p} value={v.type} onChange={set('type')}>
              {INTERVIEW_TYPES.map((t) => (
                <option key={t} value={t}>
                  {INTERVIEW_TYPE_LABELS[t]}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label={takeHome ? 'Deadline' : 'Date and time'} error={form.errors['startsAt'] ?? form.errors['dueAt']}>
          {(p) => <Input {...p} type="datetime-local" value={v.when} onChange={set('when')} />}
        </Field>
        {!takeHome ? (
          <>
            <Field label="Interviewers" optional>
              {(p) => <Input {...p} value={v.interviewers} onChange={set('interviewers')} placeholder="Sam Ortiz (Engineering Manager)" />}
            </Field>
            <Field label="Length (minutes)" optional error={form.errors['durationMins']}>
              {(p) => <Input {...p} inputMode="numeric" value={v.durationMins} onChange={set('durationMins')} placeholder="45" />}
            </Field>
          </>
        ) : null}
        <Field label={takeHome ? 'Where to submit' : 'Location or video link'} optional className="sm:col-span-2">
          {(p) => <Input {...p} value={v.location} onChange={set('location')} />}
        </Field>
      </div>
      <Field label="Prep notes" optional hint="What to revise, questions to ask them.">
        {(p) => <Textarea {...p} rows={4} value={v.prepNotes} onChange={set('prepNotes')} />}
      </Field>
      <Field label="Reflections" optional hint="Afterwards: questions asked, how it went, what to improve.">
        {(p) => <Textarea {...p} rows={4} value={v.reflections} onChange={set('reflections')} />}
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={v.completed} onCheckedChange={(c) => setV((x) => ({ ...x, completed: c === true }))} />
        {takeHome ? 'Submitted' : 'This interview has happened'}
      </label>
      <div className="flex justify-end">
        <Button type="submit" disabled={form.pending}>
          {form.pending ? 'Saving…' : interview ? 'Save changes' : 'Add interview'}
        </Button>
      </div>
    </form>
  );
}

export function InterviewsSection({ applicationId, interviews, onChange }: { applicationId: string; interviews: InterviewDto[]; onChange: () => void }) {
  const { tz } = useSession();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<InterviewDto | null>(null);
  return (
    <Section
      title="Interviews and tasks"
      flush
      actions={
        <FormDialog
          title="Add an interview"
          open={adding}
          onOpenChange={setAdding}
          wide
          trigger={
            <Button size="sm" variant="outline">
              <Plus className="size-4" aria-hidden /> Add
            </Button>
          }
        >
          <InterviewForm
            applicationId={applicationId}
            onDone={() => {
              setAdding(false);
              onChange();
            }}
          />
        </FormDialog>
      }
    >
      {interviews.length === 0 ? (
        <div className="p-4">
          <EmptyState icon={CalendarClock} title="No interviews yet" className="py-6">
            Add a phone screen, technical round or take-home task. You’ll get a reminder the day before.
          </EmptyState>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {interviews.map((i) => (
            <li key={i.id} className="flex gap-3 px-5 py-4">
              <span className="mt-0.5 text-ink-soft">{i.completedAt ? <CheckCircle2 className="size-5 text-ok" aria-label="Done" /> : i.type === 'TAKE_HOME' ? <ClipboardList className="size-5" aria-hidden /> : <CalendarClock className="size-5" aria-hidden />}</span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-semibold">
                  {INTERVIEW_TYPE_LABELS[i.type]}
                  <span className="ml-2 font-normal text-muted-foreground">{i.type === 'TAKE_HOME' ? `due ${formatDateTime(i.dueAt, tz)}` : formatDateTime(i.startsAt, tz)}</span>
                </p>
                {i.interviewers ? <p className="text-sm text-ink-soft">With {i.interviewers}</p> : null}
                {i.location ? <p className="text-sm break-words text-ink-soft">{i.location}</p> : null}
                {i.prepNotes ? (
                  <p className="text-sm whitespace-pre-line">
                    <span className="font-semibold">Prep: </span>
                    {i.prepNotes}
                  </p>
                ) : null}
                {i.reflections ? (
                  <p className="text-sm whitespace-pre-line">
                    <span className="font-semibold">Reflections: </span>
                    {i.reflections}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" aria-label="Edit interview" onClick={() => setEditing(i)}>
                  <Pencil className="size-4" />
                </Button>
                <Confirm
                  title="Delete this interview?"
                  description="Its notes and reminders are deleted too."
                  confirmLabel="Delete"
                  destructive
                  onConfirm={async () => {
                    await api(`/interviews/${i.id}`, { method: 'DELETE' });
                    onChange();
                  }}
                >
                  <Button size="icon" variant="ghost" aria-label="Delete interview">
                    <Trash2 className="size-4" />
                  </Button>
                </Confirm>
              </div>
            </li>
          ))}
        </ul>
      )}
      <FormDialog title="Edit interview" open={!!editing} onOpenChange={(o) => !o && setEditing(null)} wide>
        {editing ? (
          <InterviewForm
            applicationId={applicationId}
            interview={editing}
            onDone={() => {
              setEditing(null);
              onChange();
            }}
          />
        ) : null}
      </FormDialog>
    </Section>
  );
}
