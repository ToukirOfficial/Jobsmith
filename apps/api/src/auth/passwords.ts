import argon2 from 'argon2';

/** argon2id at OWASP's minimum: 19 MiB, 2 passes, 1 lane. */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => argon2.hash(password, OPTIONS);
export const verifyPassword = (hash: string, password: string) => argon2.verify(hash, password).catch(() => false);

/** Compared against when the email is unknown, so a wrong email takes as long as a wrong password. */
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= hashPassword('not-a-real-password-just-timing'));
