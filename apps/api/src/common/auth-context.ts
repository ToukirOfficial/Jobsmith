/** The signed-in user on a request. Every query is scoped by this userId (project rule 2). */
export interface UserContext {
  userId: string;
  name: string;
  email: string;
  timeZone: string;
  isDemo: boolean;
  ip: string | null;
}
