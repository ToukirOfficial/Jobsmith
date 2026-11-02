import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { REMINDER_KIND_LABELS, formatDateTime, type ReminderDto } from '@jobsmith/shared';
import { config } from '../config.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { email } from '../mail/templates.js';

const INCLUDE = { application: { select: { id: true, title: true, company: { select: { name: true } } } } };
type Row = Prisma.ReminderGetPayload<{ include: typeof INCLUDE }>;
const toDto = (r: Row): ReminderDto => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  dueAt: r.dueAt.toISOString(),
  dismissedAt: r.dismissedAt?.toISOString() ?? null,
  application: r.application ? { id: r.application.id, title: r.application.title, company: r.application.company.name } : null,
});

@Injectable()
export class RemindersService {
  private readonly logger = new Logger('Reminders');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async list(userId: string, scope: 'due' | 'upcoming' | 'all'): Promise<ReminderDto[]> {
    const now = new Date();
    const where: Prisma.ReminderWhereInput = { userId, dismissedAt: null };
    if (scope === 'due') where.dueAt = { lte: now };
    if (scope === 'upcoming') where.dueAt = { gt: now };
    const rows = await this.prisma.reminder.findMany({ where, include: INCLUDE, orderBy: { dueAt: 'asc' }, take: 300 });
    return rows.map(toDto);
  }

  async setDismissed(userId: string, id: string, dismissed: boolean) {
    const r = await this.prisma.reminder.findFirst({ where: { id, userId } });
    if (!r) throw new NotFoundException({ message: 'That reminder could not be found.' });
    return toDto(await this.prisma.reminder.update({ where: { id }, data: { dismissedAt: dismissed ? new Date() : null }, include: INCLUDE }));
  }

  /**
   * Worker, every 5 minutes: each due reminder is claimed by stamping sentAt in a conditional update, so
   * it fires exactly once even if two sweeps overlap. Then it is emailed if the user wants email and the
   * server can send it. Reminders more than 3 days overdue are marked sent without an email (no backlog floods).
   */
  async sweep(now = new Date()) {
    const due = await this.prisma.reminder.findMany({
      where: { sentAt: null, dismissedAt: null, dueAt: { lte: now } },
      include: { ...INCLUDE, user: { select: { email: true, name: true, timeZone: true, emailReminders: true } } },
      orderBy: { dueAt: 'asc' },
      take: 500,
    });
    let sent = 0;
    for (const r of due) {
      const claimed = await this.prisma.reminder.updateMany({ where: { id: r.id, sentAt: null }, data: { sentAt: now } });
      if (claimed.count !== 1) continue;
      const stale = now.getTime() - r.dueAt.getTime() > 3 * 86_400_000;
      if (stale || !r.user.emailReminders || !(config().MAIL_ENABLED || config().DEMO_MODE || config().NODE_ENV === 'test')) continue;
      await this.mail.send({
        to: r.user.email,
        userId: r.userId,
        ...email({
          subject: r.title,
          heading: REMINDER_KIND_LABELS[r.kind],
          paragraphs: [`Hello ${r.user.name.split(' ')[0]},`, r.title, `Due ${formatDateTime(r.dueAt, r.user.timeZone)}.`],
          button: r.application ? { label: 'Open the application', url: `${config().APP_URL}/app/applications/${r.application.id}` } : undefined,
          footnote: 'You can turn reminder emails off in Settings.',
        }),
      });
      await this.prisma.reminder.update({ where: { id: r.id }, data: { emailedAt: now } });
      sent++;
    }
    if (sent) this.logger.log(`Sent ${sent} reminder email(s)`);
    return { claimed: due.length, emailed: sent };
  }
}
