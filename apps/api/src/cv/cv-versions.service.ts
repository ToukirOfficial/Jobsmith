import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { z } from 'zod';
import { buildCvDocument, cvSelectionSchema, fullSelection, type CvDocument, type CvSelection, type CvVersionDto, type cvVersionSchema, type cvVersionUpdateSchema } from '@jobsmith/shared';
import type { CvVersion, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma.service.js';
import { ProfileService } from './profile.service.js';

type Tx = Prisma.TransactionClient | PrismaService;
const notFound = () => new NotFoundException({ message: 'That CV version could not be found.' });

export function toVersionDto(v: CvVersion): CvVersionDto {
  const parsed = cvSelectionSchema.safeParse(v.selection);
  return { id: v.id, name: v.name, headline: v.headline, summary: v.summary, template: v.template, selection: parsed.success ? parsed.data : { sections: [], items: [] }, updatedAt: v.updatedAt.toISOString() };
}

@Injectable()
export class CvVersionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profile: ProfileService,
  ) {}

  async owned(userId: string, id: string, tx: Tx = this.prisma) {
    const v = await tx.cvVersion.findFirst({ where: { id, userId } });
    if (!v) throw notFound();
    return v;
  }

  /** Item and bullet ids in a selection must be the user's own (silently dropped otherwise). */
  private async clean(userId: string, selection: CvSelection): Promise<CvSelection> {
    const ids = selection.items.map((i) => i.id);
    const items = await this.prisma.profileItem.findMany({ where: { userId, id: { in: ids } }, select: { id: true, bullets: { select: { id: true } } } });
    const byId = new Map(items.map((i) => [i.id, new Set(i.bullets.map((b) => b.id))]));
    return {
      sections: [...new Set(selection.sections)],
      items: selection.items.filter((i) => byId.has(i.id)).map((i) => ({ id: i.id, bullets: i.bullets.filter((b) => byId.get(i.id)!.has(b)) })),
    };
  }

  async list(userId: string): Promise<CvVersionDto[]> {
    const rows = await this.prisma.cvVersion.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    return rows.map(toVersionDto);
  }

  async get(userId: string, id: string): Promise<CvVersionDto> {
    return toVersionDto(await this.owned(userId, id));
  }

  async create(userId: string, input: z.infer<typeof cvVersionSchema>) {
    if ((await this.prisma.cvVersion.count({ where: { userId } })) >= 30) throw new ConflictException({ message: 'You can keep up to 30 CV versions.' });
    const selection = input.selection ? await this.clean(userId, input.selection) : fullSelection((await this.profile.get(userId)).items);
    const v = await this.prisma.cvVersion.create({ data: { userId, name: input.name, headline: input.headline, summary: input.summary, template: input.template, selection } });
    return toVersionDto(v);
  }

  async update(userId: string, id: string, input: z.infer<typeof cvVersionUpdateSchema>) {
    await this.owned(userId, id);
    const data: Prisma.CvVersionUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.headline !== undefined) data.headline = input.headline;
    if (input.summary !== undefined) data.summary = input.summary;
    if (input.template !== undefined) data.template = input.template;
    if (input.selection !== undefined) data.selection = await this.clean(userId, input.selection);
    return toVersionDto(await this.prisma.cvVersion.update({ where: { id }, data }));
  }

  async duplicate(userId: string, id: string) {
    const v = await this.owned(userId, id);
    return this.create(userId, { name: `${v.name} (copy)`.slice(0, 80), headline: v.headline, summary: v.summary, template: v.template, selection: toVersionDto(v).selection });
  }

  async remove(userId: string, id: string) {
    await this.owned(userId, id);
    await this.prisma.cvVersion.delete({ where: { id } });
    return { ok: true };
  }

  /** The render model for a version, from the profile as it is now. */
  async document(userId: string, id: string, tx: Tx = this.prisma): Promise<{ doc: CvDocument; version: CvVersionDto }> {
    const version = toVersionDto(await this.owned(userId, id, tx));
    return { doc: buildCvDocument(await this.profile.get(userId, tx), version), version };
  }
}
