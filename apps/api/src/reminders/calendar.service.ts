import { Injectable, NotFoundException } from '@nestjs/common';
import { INTERVIEW_TYPE_LABELS, type CalendarEvent } from '@jobsmith/shared';
import { config } from '../config.js';
import { PrismaService } from '../prisma.service.js';

const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsTime = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsDay = (d: string) => d.replace(/-/g, '');
/** RFC 5545 lines are folded at 75 octets. */
const fold = (line: string) => line.match(/.{1,73}/gu)?.join('\r\n ') ?? line;

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async events(userId: string, from: Date, to: Date): Promise<CalendarEvent[]> {
    const [interviews, closing, followUps] = await Promise.all([
      this.prisma.interview.findMany({
        where: { userId, OR: [{ startsAt: { gte: from, lt: to } }, { dueAt: { gte: from, lt: to } }] },
        include: { application: { select: { id: true, title: true, company: { select: { name: true } } } } },
      }),
      this.prisma.application.findMany({ where: { userId, archivedAt: null, stage: 'SAVED', closingDate: { gte: from, lt: to } }, include: { company: { select: { name: true } } } }),
      this.prisma.reminder.findMany({ where: { userId, kind: 'FOLLOW_UP', dismissedAt: null, dueAt: { gte: from, lt: to } } }),
    ]);
    const label = (a: { title: string; company: { name: string } }) => `${a.title} at ${a.company.name}`;
    return [
      ...interviews.map((i) =>
        i.type === 'TAKE_HOME'
          ? { id: `i-${i.id}`, kind: 'TAKE_HOME' as const, title: `Take-home due: ${label(i.application)}`, start: i.dueAt!.toISOString(), allDay: false, applicationId: i.application.id }
          : { id: `i-${i.id}`, kind: 'INTERVIEW' as const, title: `${INTERVIEW_TYPE_LABELS[i.type]}: ${label(i.application)}`, start: i.startsAt!.toISOString(), allDay: false, applicationId: i.application.id },
      ),
      ...closing.map((a) => ({ id: `c-${a.id}`, kind: 'CLOSING' as const, title: `Closes: ${label(a)}`, start: a.closingDate!.toISOString().slice(0, 10), allDay: true, applicationId: a.id })),
      ...followUps.filter((r) => r.applicationId).map((r) => ({ id: `f-${r.id}`, kind: 'FOLLOW_UP' as const, title: r.title, start: r.dueAt.toISOString(), allDay: false, applicationId: r.applicationId! })),
    ].sort((a, b) => a.start.localeCompare(b.start));
  }

  /** The private iCal feed: anyone with the secret URL can read it, so it holds titles and times only. */
  async ics(token: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { icalToken: token }, select: { id: true, isDemo: true } });
    if (!user || user.isDemo) throw new NotFoundException({ message: 'Not found.' });
    const now = Date.now();
    const events = await this.events(user.id, new Date(now - 90 * 86_400_000), new Date(now + 365 * 86_400_000));
    const host = new URL(config().APP_URL).host;
    const stamp = icsTime(new Date());
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Jobsmith//Job search//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Jobsmith', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H'];
    for (const e of events) {
      lines.push('BEGIN:VEVENT', `UID:${e.id}@${host}`, `DTSTAMP:${stamp}`);
      if (e.allDay) {
        const next = new Date(`${e.start}T00:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        lines.push(`DTSTART;VALUE=DATE:${icsDay(e.start)}`, `DTEND;VALUE=DATE:${icsDay(next.toISOString().slice(0, 10))}`);
      } else {
        const start = new Date(e.start);
        lines.push(`DTSTART:${icsTime(start)}`, `DTEND:${icsTime(new Date(start.getTime() + (e.kind === 'INTERVIEW' ? 60 : 30) * 60_000))}`);
      }
      lines.push(fold(`SUMMARY:${icsText(e.title)}`), fold(`URL:${config().APP_URL}/app/applications/${e.applicationId}`), 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return `${lines.join('\r\n')}\r\n`;
  }
}
