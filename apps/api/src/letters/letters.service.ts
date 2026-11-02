import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { fillLetter, type DraftDto, type DraftKind, type LetterTemplateDto } from '@jobsmith/shared';
import type { Draft, LetterTemplate } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma.service.js';

const tpl = (t: LetterTemplate): LetterTemplateDto => ({ id: t.id, name: t.name, body: t.body, updatedAt: t.updatedAt.toISOString() });
const draft = (d: Draft): DraftDto => ({ id: d.id, kind: d.kind, body: d.body, updatedAt: d.updatedAt.toISOString() });

@Injectable()
export class LettersService {
  constructor(private readonly prisma: PrismaService) {}

  async templates(userId: string) {
    return (await this.prisma.letterTemplate.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })).map(tpl);
  }

  async createTemplate(userId: string, input: { name: string; body: string }) {
    if ((await this.prisma.letterTemplate.count({ where: { userId } })) >= 50) throw new ConflictException({ message: 'You can keep up to 50 templates.' });
    return tpl(await this.prisma.letterTemplate.create({ data: { userId, ...input } }));
  }

  private async ownedTemplate(userId: string, id: string) {
    const t = await this.prisma.letterTemplate.findFirst({ where: { id, userId } });
    if (!t) throw new NotFoundException({ message: 'That template could not be found.' });
    return t;
  }

  async updateTemplate(userId: string, id: string, input: { name: string; body: string }) {
    await this.ownedTemplate(userId, id);
    return tpl(await this.prisma.letterTemplate.update({ where: { id }, data: input }));
  }

  async deleteTemplate(userId: string, id: string) {
    await this.ownedTemplate(userId, id);
    await this.prisma.letterTemplate.delete({ where: { id } });
    return { ok: true };
  }

  private async ownedApp(userId: string, id: string) {
    const a = await this.prisma.application.findFirst({ where: { id, userId }, include: { company: true, contacts: { include: { contact: true } } } });
    if (!a) throw new NotFoundException({ message: 'That application could not be found.' });
    return a;
  }

  async drafts(userId: string, applicationId: string): Promise<DraftDto[]> {
    await this.ownedApp(userId, applicationId);
    return (await this.prisma.draft.findMany({ where: { applicationId, userId }, orderBy: { kind: 'asc' } })).map(draft);
  }

  async saveDraft(userId: string, applicationId: string, kind: DraftKind, body: string) {
    await this.ownedApp(userId, applicationId);
    const d = await this.prisma.draft.upsert({ where: { applicationId_kind: { applicationId, kind } }, create: { userId, applicationId, kind, body }, update: { body } });
    return draft(d);
  }

  /** Fills a template's placeholders for this application and saves it as the draft. */
  async fromTemplate(userId: string, applicationId: string, kind: DraftKind, templateId: string) {
    const [app, t, profile] = await Promise.all([
      this.ownedApp(userId, applicationId),
      this.ownedTemplate(userId, templateId),
      this.prisma.profile.findUnique({ where: { userId } }),
    ]);
    const manager = app.contacts.map((c) => c.contact).find((c) => c.type === 'HIRING_MANAGER');
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
    const body = fillLetter(t.body, { company: app.company.name, role: app.title, hiringManager: manager?.name ?? null, myName: profile?.fullName || me.name });
    return this.saveDraft(userId, applicationId, kind, body);
  }
}
