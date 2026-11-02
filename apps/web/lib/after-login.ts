/** Where to go after logging in: the page they came from (same site only), else the dashboard. */
export function destinationAfterLogin(next: string | null): string {
  if (next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')) return next;
  return '/app';
}
