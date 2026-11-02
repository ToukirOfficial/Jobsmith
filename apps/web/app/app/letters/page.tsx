'use client';

import { useState } from 'react';
import { Mail, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PLACEHOLDERS, letterTemplateSchema, type LetterTemplateDto } from '@jobsmith/shared';
import { PageHeader } from '@/components/app-shell';
import { Confirm } from '@/components/confirm';
import { Field } from '@/components/field';
import { FormDialog } from '@/components/form-dialog';
import { FormError } from '@/components/form-error';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { useForm } from '@/lib/form';
import { useApi } from '@/lib/use-api';

function TemplateForm({ t, onSaved }: { t?: LetterTemplateDto; onSaved: () => void }) {
  const [v, setV] = useState({ name: t?.name ?? '', body: t?.body ?? '' });
  const form = useForm(letterTemplateSchema);
  const insert = (p: string) => setV((x) => ({ ...x, body: `${x.body}${p}` }));
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = t ? await form.submit(v, `/letter-templates/${t.id}`, { method: 'PUT' }) : await form.submit(v, '/letter-templates');
        if (ok) {
          toast.success('Template saved');
          onSaved();
        }
      }}
    >
      <FormError message={form.formError} />
      <Field label="Name" error={form.errors['name']}>
        {(p) => <Input {...p} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Product teams" />}
      </Field>
      <Field label="Letter" error={form.errors['body']}>
        {(p) => <Textarea {...p} rows={14} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} />}
      </Field>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Insert:</span>
        {PLACEHOLDERS.map((p) => (
          <button key={p} type="button" onClick={() => insert(p)} className="rounded-full border border-border bg-canvas px-2 py-0.5 font-mono hover:border-brand hover:text-brand">
            {p}
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={form.pending}>
          {form.pending ? 'Saving…' : 'Save template'}
        </Button>
      </div>
    </form>
  );
}

export default function LettersPage() {
  const { data, error, loading, reload } = useApi<LetterTemplateDto[]>('/letter-templates');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LetterTemplateDto | null>(null);
  return (
    <>
      <PageHeader
        title="Cover letters"
        description="Templates with placeholders. Use them from any application, then edit the letter there."
        actions={
          <FormDialog title="New template" open={open} onOpenChange={setOpen} wide trigger={<Button><Plus className="size-4" aria-hidden /> New template</Button>}>
            <TemplateForm
              onSaved={() => {
                setOpen(false);
                void reload();
              }}
            />
          </FormDialog>
        }
      />
      <p className="mb-5 max-w-prose text-sm text-muted-foreground">
        <span className="font-mono">{'{company}'}</span>, <span className="font-mono">{'{role}'}</span>, <span className="font-mono">{'{hiringManager}'}</span> (the hiring manager you added to the application, or “Hiring Manager”) and <span className="font-mono">{'{myName}'}</span> are filled in for you.
      </p>
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {loading && !data ? <ListSkeleton rows={3} /> : null}
      {data && !data.length ? (
        <EmptyState icon={Mail} title="No templates yet">
          Write one plain letter you’re happy with, then reuse it for each application.
        </EmptyState>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {(data ?? []).map((t) => (
          <article key={t.id} className="flex flex-col rounded-lg border border-border bg-paper">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="font-semibold">{t.name}</h2>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}>
                  <Pencil className="size-4" />
                </Button>
                <Confirm title={`Delete ${t.name}?`} description="Letters already made from it are not affected." confirmLabel="Delete" destructive onConfirm={async () => {
                  await api(`/letter-templates/${t.id}`, { method: 'DELETE' });
                  void reload();
                }}>
                  <Button size="icon" variant="ghost" aria-label={`Delete ${t.name}`}>
                    <Trash2 className="size-4" />
                  </Button>
                </Confirm>
              </div>
            </header>
            <p className="line-clamp-[10] flex-1 px-4 py-3 text-sm whitespace-pre-line text-ink-soft">{t.body}</p>
          </article>
        ))}
      </div>
      <FormDialog title="Edit template" open={!!editing} onOpenChange={(o) => !o && setEditing(null)} wide>
        {editing ? (
          <TemplateForm
            t={editing}
            onSaved={() => {
              setEditing(null);
              void reload();
            }}
          />
        ) : null}
      </FormDialog>
    </>
  );
}
