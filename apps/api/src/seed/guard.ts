/**
 * The seed creates an account with a public password, so it only runs where demo accounts can't be abused:
 * with DEMO_MODE=true, or with --dev on a non-production machine. Demo accounts can only log in when
 * DEMO_MODE=true (AuthService and AuthGuard), so a seeded account on a normal install is inert anyway.
 */
export function seedAllowed(env: Record<string, string | undefined>, argv: string[]): { ok: true } | { ok: false; reason: string } {
  if (env['DEMO_MODE'] === 'true') return { ok: true };
  if (argv.includes('--dev')) {
    if (env['NODE_ENV'] === 'production') return { ok: false, reason: 'Refusing --dev with NODE_ENV=production.' };
    return { ok: true };
  }
  return { ok: false, reason: 'The seed creates a demo account with a public password. Run it with DEMO_MODE=true, or with --dev on a development machine.' };
}
