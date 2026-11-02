import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { z } from 'zod';
import { normaliseCompany, type CompanyDetail, type CompanySummary, type companyUpdateSchema } from '@jobsmith/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma.service.js';
import { SponsorLookupService } from '../sponsors/sponsor-lookup.service.js';
import { APPLICATION_INCLUDE, toSummary } from '../applications/dto.js';
import { toContactSummary } from '../contacts/dto.js';

type Tx = Prisma.TransactionClient | PrismaService;
const notFound = () => new NotFoundException({ message: 'That company could not be found.' });

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sponsors: SponsorLookupService,
  ) {}

  /** Companies are created automatically from jobs; "Acme Ltd" and "ACME LIMITED" are the same company. */
  async findOrCreate(userId: string, name: string, tx: Tx = this.prisma) {
    const clean = name.trim().replace(/\s+/g, ' ');
    const normalizedName = normaliseCompany(clean) || clean.toLowerCase();
    return tx.company.upsert({
      where: { userId_normalizedName: { userId, normalizedName } },
      create: { userId, name: clean, normalizedName },
      update: {},
    });
  }

  async list(userId: string): Promise<CompanySummary[]> {
    const rows = await this.prisma.company.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { applications: true, contacts: true } } },
    });
    const badges = await this.sponsors.badges(rows);
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      website: c.website,
      applicationCount: c._count.applications,
      contactCount: c._count.contacts,
      sponsor: badges.get(c.id)!,
    }));
  }

  private async owned(userId: string, id: string) {
    const c = await this.prisma.company.findFirst({ where: { id, userId } });
    if (!c) throw notFound();
    return c;
  }

  async get(userId: string, id: string): Promise<CompanyDetail> {
    const c = await this.owned(userId, id);
    const [applications, contacts, counts] = await Promise.all([
      this.prisma.application.findMany({ where: { userId, companyId: id }, include: APPLICATION_INCLUDE, orderBy: { updatedAt: 'desc' } }),
      this.prisma.contact.findMany({ where: { userId, companyId: id }, include: { company: { select: { id: true, name: true } } }, orderBy: { name: 'asc' } }),
      this.prisma.company.findUniqueOrThrow({ where: { id }, select: { _count: { select: { applications: true, contacts: true } } } }),
    ]);
    const badge = await this.sponsors.badge(c);
    const possibleSponsors = badge.status === 'NOT_FOUND' ? await this.sponsors.suggestions(c.normalizedName) : [];
    return {
      id: c.id,
      name: c.name,
      website: c.website,
      notes: c.notes,
      applicationCount: counts._count.applications,
      contactCount: counts._count.contacts,
      sponsor: badge,
      applications: applications.map((a) => toSummary(a, badge)),
      contacts: contacts.map(toContactSummary),
      possibleSponsors,
    };
  }

  async update(userId: string, id: string, input: z.infer<typeof companyUpdateSchema>) {
    const c = await this.owned(userId, id);
    const data: Prisma.CompanyUpdateInput = {};
    if (input.name !== undefined) {
      const normalizedName = normaliseCompany(input.name) || input.name.toLowerCase();
      if (normalizedName !== c.normalizedName && (await this.prisma.company.findFirst({ where: { userId, normalizedName } }))) {
        throw new ConflictException({ message: 'You already have a company with that name.', field: 'name' });
      }
      data.name = input.name;
      data.normalizedName = normalizedName;
    }
    if (input.website !== undefined) data.website = input.website;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.sponsorName !== undefined) data.sponsorName = input.sponsorName;
    await this.prisma.company.update({ where: { id: c.id }, data });
    return this.get(userId, id);
  }
}
