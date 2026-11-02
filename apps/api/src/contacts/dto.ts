import type { ContactSummary } from '@jobsmith/shared';
import type { Contact } from '../generated/prisma/client.js';

export function toContactSummary(c: Contact & { company: { id: string; name: string } | null }): ContactSummary {
  return { id: c.id, name: c.name, type: c.type, role: c.role, email: c.email, linkedinUrl: c.linkedinUrl, company: c.company ? { id: c.company.id, name: c.company.name } : null };
}
