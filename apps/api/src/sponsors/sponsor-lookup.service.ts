import { Injectable } from '@nestjs/common';
import type { SponsorBadge } from '@jobsmith/shared';
import { normaliseCompany } from '@jobsmith/shared';
import { PrismaService } from '../prisma.service.js';
import { RedisService } from '../redis.service.js';

type Row = { name: string; normalizedName: string; town: string | null; rating: string | null; route: string };

const UNKNOWN: SponsorBadge = { status: 'UNKNOWN', sponsorName: null, routes: [], town: null, rating: null };
const NOT_FOUND: SponsorBadge = { status: 'NOT_FOUND', sponsorName: null, routes: [], town: null, rating: null };

/**
 * Sponsor badges from the local copy of the Home Office register. A company matches when its normalised
 * name equals a register name (or the user confirmed a register name for it). Wording is always
 * "licensed to sponsor", never "will sponsor you" (PRD section 5).
 */
@Injectable()
export class SponsorLookupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Has the register ever been imported? Without it, every badge is UNKNOWN. */
  async registerLoaded(): Promise<boolean> {
    const hit = await this.redis.client.get('sponsors:loaded');
    if (hit) return hit === '1';
    const done = (await this.prisma.sponsorImport.count({ where: { status: 'DONE' } })) > 0;
    await this.redis.client.set('sponsors:loaded', done ? '1' : '0', 'EX', 300);
    return done;
  }

  async clearLoadedCache() {
    await this.redis.client.del('sponsors:loaded');
  }

  /** Badges for many companies at once, keyed by company id. */
  async badges(companies: { id: string; normalizedName: string; sponsorName: string | null }[]): Promise<Map<string, SponsorBadge>> {
    const out = new Map<string, SponsorBadge>();
    if (!companies.length) return out;
    if (!(await this.registerLoaded())) {
      for (const c of companies) out.set(c.id, UNKNOWN);
      return out;
    }
    const keys = [...new Set(companies.map((c) => (c.sponsorName ? normaliseCompany(c.sponsorName) : c.normalizedName)))];
    const rows: Row[] = await this.prisma.sponsor.findMany({
      where: { normalizedName: { in: keys } },
      select: { name: true, normalizedName: true, town: true, rating: true, route: true },
    });
    const byName = new Map<string, Row[]>();
    for (const r of rows) byName.set(r.normalizedName, [...(byName.get(r.normalizedName) ?? []), r]);
    for (const c of companies) {
      const found = byName.get(c.sponsorName ? normaliseCompany(c.sponsorName) : c.normalizedName);
      out.set(c.id, found?.length ? toBadge(found) : NOT_FOUND);
    }
    return out;
  }

  async badge(company: { id: string; normalizedName: string; sponsorName: string | null }): Promise<SponsorBadge> {
    return (await this.badges([company])).get(company.id) ?? UNKNOWN;
  }

  /** Close register names for a company with no exact match (pg_trgm similarity), for the user to confirm. */
  async suggestions(normalizedName: string, limit = 5) {
    if (!normalizedName || !(await this.registerLoaded())) return [];
    const rows = await this.prisma.$queryRaw<{ name: string; town: string | null; routes: string[] }[]>`
      SELECT min(name) AS name, min(town) AS town, array_agg(DISTINCT route) AS routes
      FROM "Sponsor"
      WHERE "normalizedName" % ${normalizedName}
      GROUP BY "normalizedName"
      ORDER BY max(similarity("normalizedName", ${normalizedName})) DESC
      LIMIT ${limit}`;
    return rows;
  }
}

export function toBadge(rows: Row[]): SponsorBadge {
  const first = rows[0]!;
  return {
    status: 'LICENSED',
    sponsorName: first.name,
    routes: [...new Set(rows.map((r) => r.route))].sort(),
    town: first.town,
    rating: [...new Set(rows.map((r) => r.rating).filter(Boolean))].join('; ') || null,
  };
}
