import type { Prisma } from '../generated/prisma/client.js';
import { randomToken } from '../common/crypto.js';

export const DEFAULT_LETTER = `Dear {hiringManager},

I'd like to apply for the {role} role at {company}.

[Two or three sentences on the most relevant thing you've built or done, with a number if you have one.]

[One sentence on why this team or product, in your own words.]

I'd be glad to talk it through. Thank you for reading.

Best wishes,
{myName}`;

/** A new account starts with an empty profile and one plain cover letter template. */
export async function createUserWithDefaults(tx: Prisma.TransactionClient, data: { email: string; name: string; passwordHash: string; isDemo?: boolean; demoExpiresAt?: Date }) {
  const user = await tx.user.create({ data: { ...data, icalToken: randomToken(24) } });
  await tx.profile.create({ data: { userId: user.id, fullName: data.name, email: data.isDemo ? null : data.email } });
  await tx.letterTemplate.create({ data: { userId: user.id, name: 'Plain and short', body: DEFAULT_LETTER } });
  return user;
}
