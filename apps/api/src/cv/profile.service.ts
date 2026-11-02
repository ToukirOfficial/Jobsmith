import { Injectable, NotFoundException } from '@nestjs/common';
import type { z } from 'zod';
import type { ItemData, ProfileDto, ProfileItemDto, profileContactSchema, profileItemSchema } from '@jobsmith/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma.service.js';

type Tx = Prisma.TransactionClient | PrismaService;
const notFound = () => new NotFoundException({ message: 'That profile item could not be found.' });

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string, tx: Tx = this.prisma): Promise<ProfileDto> {
    const [profile, items] = await Promise.all([
      tx.profile.upsert({ where: { userId }, create: { userId, fullName: '' }, update: {} }),
      tx.profileItem.findMany({ where: { userId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: { bullets: { orderBy: { sortOrder: 'asc' } } } }),
    ]);
    return {
      contact: { fullName: profile.fullName, email: profile.email, phone: profile.phone, location: profile.location, headline: profile.headline, summary: profile.summary },
      items: items.map((i) => ({ id: i.id, kind: i.kind, data: i.data as ItemData[typeof i.kind], bullets: i.bullets.map((b) => ({ id: b.id, text: b.text })) }) as ProfileItemDto),
    };
  }

  async updateContact(userId: string, input: z.infer<typeof profileContactSchema>) {
    await this.prisma.profile.upsert({ where: { userId }, create: { userId, ...input }, update: input });
    return this.get(userId);
  }

  async createItem(userId: string, input: z.infer<typeof profileItemSchema>) {
    await this.prisma.$transaction(async (tx) => {
      const last = await tx.profileItem.aggregate({ where: { userId, kind: input.kind }, _max: { sortOrder: true } });
      const item = await tx.profileItem.create({ data: { userId, kind: input.kind, data: input.data as Prisma.InputJsonValue, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
      for (const [i, b] of input.bullets.entries()) await tx.profileBullet.create({ data: { userId, itemId: item.id, text: b.text, sortOrder: i } });
    });
    return this.get(userId);
  }

  /** Replaces data and bullets. Bullets keep their ids when sent back, so CV versions that use them keep working. */
  async updateItem(userId: string, id: string, input: z.infer<typeof profileItemSchema>) {
    const item = await this.prisma.profileItem.findFirst({ where: { id, userId }, include: { bullets: true } });
    if (!item || item.kind !== input.kind) throw notFound();
    await this.prisma.$transaction(async (tx) => {
      await tx.profileItem.update({ where: { id }, data: { data: input.data as Prisma.InputJsonValue } });
      const keep = new Set(input.bullets.map((b) => b.id).filter((x): x is string => !!x && item.bullets.some((e) => e.id === x)));
      await tx.profileBullet.deleteMany({ where: { itemId: id, id: { notIn: [...keep] } } });
      for (const [i, b] of input.bullets.entries()) {
        if (b.id && keep.has(b.id)) await tx.profileBullet.update({ where: { id: b.id }, data: { text: b.text, sortOrder: i } });
        else await tx.profileBullet.create({ data: { userId, itemId: id, text: b.text, sortOrder: i } });
      }
    });
    return this.get(userId);
  }

  async deleteItem(userId: string, id: string) {
    const n = await this.prisma.profileItem.deleteMany({ where: { id, userId } });
    if (!n.count) throw notFound();
    return this.get(userId);
  }

  async reorder(userId: string, ids: string[]) {
    const owned = await this.prisma.profileItem.count({ where: { id: { in: ids }, userId } });
    if (owned !== new Set(ids).size) throw notFound();
    await this.prisma.$transaction(ids.map((id, i) => this.prisma.profileItem.update({ where: { id }, data: { sortOrder: i } })));
    return this.get(userId);
  }
}
