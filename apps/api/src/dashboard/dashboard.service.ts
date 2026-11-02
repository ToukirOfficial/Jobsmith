import { Injectable } from '@nestjs/common';
import { CHANNEL_LABELS, REPLIED_STAGES, addDays, dateKey, daysBetween, type DashboardDto, type RateRow, type Stage } from '@jobsmith/shared';
import { PrismaService } from '../prisma.service.js';
import { RedisService } from '../redis.service.js';
import { SponsorLookupService } from '../sponsors/sponsor-lookup.service.js';
import { RemindersService } from '../reminders/reminders.service.js';
import { toInterviewDto } from '../interviews/dto.js';

const rate = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

/** Monday of the week containing a YYYY-MM-DD date. */
function weekStart(day: string): string {
  const dow = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -dow);
}

/** Everything on the dashboard, cached in Redis for a minute and dropped on any write that changes it. */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly sponsors: SponsorLookupService,
    private readonly reminders: RemindersService,
  ) {}

  get(userId: string): Promise<DashboardDto> {
    return this.redis.cached(`dashboard:${userId}`, 60, () => this.build(userId));
  }

  async build(userId: string): Promise<DashboardDto> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true, weeklyTarget: true } });
    const tz = user.timeZone;
    const now = new Date();
    const today = dateKey(now, tz);
    const thisWeek = weekStart(today);

    const [apps, interviews, due] = await Promise.all([
      this.prisma.application.findMany({
        where: { userId },
        select: {
          id: true,
          title: true,
          stage: true,
          channel: true,
          appliedAt: true,
          firstReplyAt: true,
          archivedAt: true,
          cvVersion: { select: { id: true, name: true } },
          company: { select: { id: true, name: true, normalizedName: true, sponsorName: true } },
          stageEvents: { select: { to: true } },
        },
      }),
      this.prisma.interview.findMany({
        where: { userId, completedAt: null, OR: [{ startsAt: { gte: now, lt: new Date(now.getTime() + 7 * 86_400_000) } }, { dueAt: { gte: now, lt: new Date(now.getTime() + 7 * 86_400_000) } }] },
        include: { application: { select: { id: true, title: true, company: { select: { name: true } } } } },
        orderBy: [{ startsAt: 'asc' }, { dueAt: 'asc' }],
      }),
      this.reminders.list(userId, 'due'),
    ]);

    const reached = (a: (typeof apps)[number], stages: Stage[]) => stages.includes(a.stage) || a.stageEvents.some((e) => stages.includes(e.to));
    const applied = apps.filter((a) => a.appliedAt);
    const replied = applied.filter((a) => a.firstReplyAt || reached(a, REPLIED_STAGES));
    const interviewed = applied.filter((a) => reached(a, ['INTERVIEW', 'OFFER']));
    const offers = applied.filter((a) => reached(a, ['OFFER']));
    const funnel: DashboardDto['funnel'] = [
      { stage: 'SAVED', label: 'Saved', count: apps.length, rate: null },
      { stage: 'APPLIED', label: 'Applied', count: applied.length, rate: rate(applied.length, apps.length) },
      { stage: 'REPLIED', label: 'Replied', count: replied.length, rate: rate(replied.length, applied.length) },
      { stage: 'INTERVIEW', label: 'Interview', count: interviewed.length, rate: rate(interviewed.length, replied.length) },
      { stage: 'OFFER', label: 'Offer', count: offers.length, rate: rate(offers.length, interviewed.length) },
    ];

    const repliedIds = new Set(replied.map((a) => a.id));
    const group = (keyOf: (a: (typeof applied)[number]) => { key: string; label: string } | null): RateRow[] => {
      const m = new Map<string, RateRow>();
      for (const a of applied) {
        const k = keyOf(a);
        if (!k) continue;
        const row = m.get(k.key) ?? { key: k.key, label: k.label, applied: 0, replied: 0, rate: 0 };
        row.applied++;
        if (repliedIds.has(a.id)) row.replied++;
        m.set(k.key, row);
      }
      return [...m.values()].map((r) => ({ ...r, rate: rate(r.replied, r.applied) })).sort((x, y) => y.applied - x.applied);
    };
    const badges = await this.sponsors.badges(applied.map((a) => a.company));
    const SPONSOR_LABEL = { LICENSED: 'Licensed sponsor', NOT_FOUND: 'Not on register', POSSIBLE: 'Possible sponsor', UNKNOWN: 'Not checked' } as const;

    const weeks = Array.from({ length: 8 }, (_, i) => addDays(thisWeek, (i - 7) * 7));
    const weekly = weeks.map((w) => ({ weekStart: w, applied: 0 }));
    for (const a of applied) {
      const w = weekStart(dateKey(a.appliedAt!, tz));
      const slot = weekly.find((x) => x.weekStart === w);
      if (slot) slot.applied++;
    }

    const replyDays = applied.filter((a) => a.firstReplyAt).map((a) => Math.max(0, daysBetween(dateKey(a.appliedAt!, tz), dateKey(a.firstReplyAt!, tz))));
    const waiting = apps
      .filter((a) => a.stage === 'APPLIED' && !a.archivedAt && a.appliedAt)
      .sort((x, y) => x.appliedAt!.getTime() - y.appliedAt!.getTime())
      .map((a) => ({ id: a.id, title: a.title, company: a.company.name, appliedAt: a.appliedAt!.toISOString(), days: daysBetween(dateKey(a.appliedAt!, tz), today) }));

    return {
      today: { remindersDue: due.slice(0, 6), interviewsThisWeek: interviews.map(toInterviewDto), waiting: waiting.slice(0, 5), waitingCount: waiting.length },
      funnel,
      byChannel: group((a) => (a.channel ? { key: a.channel, label: CHANNEL_LABELS[a.channel] } : { key: 'NONE', label: 'Not recorded' })),
      byCvVersion: group((a) => (a.cvVersion ? { key: a.cvVersion.id, label: a.cvVersion.name } : { key: 'NONE', label: 'No CV recorded' })),
      bySponsor: group((a) => {
        const s = badges.get(a.company.id)!.status;
        return { key: s, label: SPONSOR_LABEL[s] };
      }),
      weekly,
      avgDaysToReply: replyDays.length ? Math.round((replyDays.reduce((s, d) => s + d, 0) / replyDays.length) * 10) / 10 : null,
      goal: { target: user.weeklyTarget, thisWeek: weekly[weekly.length - 1]!.applied, weekStart: thisWeek },
      totals: { active: apps.filter((a) => !a.archivedAt && !['REJECTED', 'WITHDRAWN'].includes(a.stage)).length, applied: applied.length, offers: offers.length },
    };
  }
}
