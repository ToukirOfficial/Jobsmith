'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Bell, KanbanSquare, MapPin, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { STAGES, STAGE_LABELS, formatDate, type ApplicationSummary, type Page, type Stage } from '@jobsmith/shared';
import { PageHeader } from '@/components/app-shell';
import { DaysInStage, STAGE_STYLE, Salary, SponsorBadge } from '@/components/job-bits';
import { EmptyState, ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

type Columns = Record<Stage, ApplicationSummary[]>;

function group(items: ApplicationSummary[]): Columns {
  const cols = Object.fromEntries(STAGES.map((s) => [s, [] as ApplicationSummary[]])) as Columns;
  for (const a of [...items].sort((x, y) => x.position - y.position)) cols[a.stage].push(a);
  return cols;
}

function findStage(cols: Columns, id: string): Stage | undefined {
  if ((STAGES as readonly string[]).includes(id)) return id as Stage;
  return STAGES.find((s) => cols[s].some((a) => a.id === id));
}

function CardBody({ a, tz }: { a: ApplicationSummary; tz: string }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[0.8125rem] font-medium text-muted-foreground">{a.company.name}</p>
          <p className="leading-snug font-semibold text-ink">{a.title}</p>
        </div>
        <DaysInStage since={a.stageChangedAt} tz={tz} stage={a.stage} />
      </div>
      {a.location || a.salaryMinPence || a.salaryMaxPence ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {a.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden />
              {a.location}
            </span>
          ) : null}
          <Salary min={a.salaryMinPence} max={a.salaryMaxPence} currency={a.currency} />
        </p>
      ) : null}
      {a.sponsor.status === 'LICENSED' || a.nextReminder ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <SponsorBadge sponsor={a.sponsor} compact />
          {a.nextReminder ? (
            <span className="inline-flex items-center gap-1 text-xs text-ink-soft" title={a.nextReminder.title}>
              <Bell className="size-3.5" aria-hidden />
              {formatDate(a.nextReminder.dueAt, tz)}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function Card({ a, tz }: { a: ApplicationSummary; tz: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: a.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('touch-manipulation', isDragging && 'opacity-40')}
      {...attributes}
      {...listeners}
      aria-roledescription="Draggable job card"
    >
      <Link
        href={`/app/applications/${a.id}`}
        className={cn('block rounded-md border border-l-[3px] border-border bg-paper px-3 py-2.5 transition-shadow hover:shadow-[0_1px_0_var(--line-strong),0_4px_14px_-6px_rgb(22_26_43/0.18)]', STAGE_STYLE[a.stage].edge)}
        draggable={false}
      >
        <CardBody a={a} tz={tz} />
      </Link>
    </li>
  );
}

function Column({ stage, items, tz }: { stage: Stage; items: ApplicationSummary[]; tz: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const s = STAGE_STYLE[stage];
  const closed = stage === 'REJECTED' || stage === 'WITHDRAWN';
  return (
    <section aria-label={`${STAGE_LABELS[stage]}, ${items.length}`} className={cn('flex w-[17rem] shrink-0 flex-col rounded-lg bg-canvas-deep/60', closed && 'w-[15rem] opacity-90')}>
      <div aria-hidden className={cn('h-[3px] rounded-t-lg', s.rule)} />
      <header className="flex items-center justify-between px-3 pt-2.5 pb-2">
        <h2 className={cn('text-sm font-bold', s.text)}>{STAGE_LABELS[stage]}</h2>
        <span className="rounded-full bg-paper px-2 text-xs font-semibold text-ink-soft tabular-nums">{items.length}</span>
      </header>
      <SortableContext id={stage} items={items.map((a) => a.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className={cn('flex min-h-24 flex-1 flex-col gap-2 rounded-b-lg px-2 pb-2 transition-colors', isOver && 'bg-brand-tint/50')}>
          {items.map((a) => (
            <Card key={a.id} a={a} tz={tz} />
          ))}
          {!items.length ? <li className="grid flex-1 place-items-center rounded-md border border-dashed border-line-strong/70 px-3 py-6 text-center text-xs text-muted-foreground">Drop a card here</li> : null}
        </ul>
      </SortableContext>
    </section>
  );
}

export default function BoardPage() {
  const { tz } = useSession();
  const { data, error, loading, reload } = useApi<Page<ApplicationSummary>>('/applications?sort=stage&dir=asc');
  const [cols, setCols] = useState<Columns | null>(null);
  const [active, setActive] = useState<ApplicationSummary | null>(null);
  const [origin, setOrigin] = useState<Stage | null>(null);

  useEffect(() => {
    if (data) setCols(group(data.items));
  }, [data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const total = useMemo(() => (cols ? STAGES.reduce((n, s) => n + cols[s].length, 0) : 0), [cols]);

  function onDragStart(e: DragStartEvent) {
    if (!cols) return;
    const stage = findStage(cols, String(e.active.id));
    setOrigin(stage ?? null);
    setActive(stage ? (cols[stage].find((a) => a.id === e.active.id) ?? null) : null);
  }

  /** Moving between columns happens while dragging, so the card shows where it will land. */
  function onDragOver(e: DragOverEvent) {
    if (!cols || !e.over) return;
    const from = findStage(cols, String(e.active.id));
    const to = findStage(cols, String(e.over.id));
    if (!from || !to || from === to) return;
    setCols((prev) => {
      if (!prev) return prev;
      const card = prev[from].find((a) => a.id === e.active.id);
      if (!card) return prev;
      const target = prev[to];
      const overIndex = target.findIndex((a) => a.id === e.over!.id);
      const index = overIndex < 0 ? target.length : overIndex;
      return { ...prev, [from]: prev[from].filter((a) => a.id !== card.id), [to]: [...target.slice(0, index), { ...card, stage: to }, ...target.slice(index)] };
    });
  }

  async function onDragEnd(e: DragEndEvent) {
    setActive(null);
    if (!cols || !e.over) return;
    const stage = findStage(cols, String(e.active.id));
    if (!stage) return;
    const list = cols[stage];
    const oldIndex = list.findIndex((a) => a.id === e.active.id);
    const overIndex = list.findIndex((a) => a.id === e.over!.id);
    const newIndex = overIndex < 0 ? oldIndex : overIndex;
    const next = [...list];
    const [moved] = next.splice(oldIndex, 1);
    next.splice(newIndex, 0, moved!);
    setCols({ ...cols, [stage]: next });
    if (origin === stage && oldIndex === newIndex) return;
    try {
      const updated = await api<ApplicationSummary>(`/applications/${e.active.id}/stage`, { method: 'POST', body: { stage, position: newIndex } });
      setCols((prev) => (prev ? { ...prev, [stage]: prev[stage].map((a) => (a.id === updated.id ? updated : a)) } : prev));
      if (origin !== stage) toast.success(`Moved to ${STAGE_LABELS[stage]}`);
    } catch (err) {
      toast.error(errorMessage(err));
      void reload();
    }
  }

  return (
    <>
      <PageHeader
        title="Board"
        description={cols ? `${total} active ${total === 1 ? 'application' : 'applications'}. Drag a card to change its stage.` : 'Your applications by stage.'}
        actions={
          <Button asChild>
            <Link href="/app/applications/new">
              <Plus className="size-4" aria-hidden /> Save a job
            </Link>
          </Button>
        }
      />
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {loading && !cols ? (
        <div className="flex gap-3 overflow-hidden" aria-busy="true" aria-label="Loading">
          {STAGES.slice(0, 5).map((s) => (
            <Skeleton key={s} className="h-96 w-[17rem] shrink-0" />
          ))}
        </div>
      ) : null}
      {cols && total === 0 ? (
        <EmptyState
          icon={KanbanSquare}
          title="No applications yet"
          action={
            <Button asChild>
              <Link href="/app/applications/new">Save your first job</Link>
            </Button>
          }
        >
          Paste a job link or add one by hand. It lands in Saved, and you drag it across as things move.
        </EmptyState>
      ) : null}
      {cols && total > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={(e) => void onDragEnd(e)} onDragCancel={() => void reload()}>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            {STAGES.map((s) => (
              <Column key={s} stage={s} items={cols[s]} tz={tz} />
            ))}
          </div>
          <DragOverlay>
            {active ? (
              <div className={cn('w-[16rem] rotate-[1.5deg] rounded-md border border-l-[3px] border-border bg-paper px-3 py-2.5 shadow-[0_18px_40px_-12px_rgb(22_26_43/0.35)]', STAGE_STYLE[active.stage].edge)}>
                <CardBody a={active} tz={tz} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : null}
    </>
  );
}
