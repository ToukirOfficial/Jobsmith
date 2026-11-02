import type {
  Channel,
  ContactType,
  InterviewType,
  JobSource,
  LogChannel,
  LogDirection,
  Stage,
  WorkMode,
} from './enums.js';

/** Response shapes (DTOs). The API builds these explicitly; nothing internal is ever passed through. */

export interface SetupStatus {
  setupNeeded: boolean;
  signupEnabled: boolean;
  demoMode: boolean;
}

export type LoginResult = { status: 'ok' } | { status: 'code'; challenge: string; email: string };

export interface Me {
  id: string;
  name: string;
  email: string;
  isDemo: boolean;
  demoMode: boolean;
  /** False when the server has no SMTP: no login codes and no email reminders. */
  mailEnabled: boolean;
  settings: Settings;
}

export interface Settings {
  name: string;
  homeCity: string | null;
  timeZone: string;
  workAuthNotes: string | null;
  targetRoles: string[];
  targetLocations: string[];
  styleNote: string | null;
  weeklyTarget: number;
  followUpDays: number;
  emailReminders: boolean;
}

export interface SponsorBadge {
  status: 'LICENSED' | 'POSSIBLE' | 'NOT_FOUND' | 'UNKNOWN';
  sponsorName: string | null;
  routes: string[];
  town: string | null;
  rating: string | null;
}

export interface CompanyRef {
  id: string;
  name: string;
}

export interface ApplicationSummary {
  id: string;
  title: string;
  company: CompanyRef;
  location: string | null;
  workMode: WorkMode | null;
  salaryMinPence: number | null;
  salaryMaxPence: number | null;
  currency: string;
  closingDate: string | null;
  stage: Stage;
  stageChangedAt: string;
  position: number;
  channel: Channel | null;
  appliedAt: string | null;
  archivedAt: string | null;
  sponsor: SponsorBadge;
  nextReminder: { kind: string; dueAt: string; title: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface StageEventDto {
  id: string;
  from: Stage | null;
  to: Stage;
  at: string;
}

export interface TimelineItem {
  at: string;
  kind: 'stage' | 'interview' | 'contact' | 'snapshot' | 'created' | 'agent';
  text: string;
}

export interface ApplicationDetail extends ApplicationSummary {
  url: string | null;
  description: string | null;
  notes: string | null;
  source: JobSource;
  stageHistory: StageEventDto[];
  contacts: ContactSummary[];
  interviews: InterviewDto[];
  cvSnapshot: SnapshotRef | null;
  letterSnapshot: SnapshotRef | null;
  timeline: TimelineItem[];
}

export interface SnapshotRef {
  id: string;
  label: string;
  fileId: string | null;
  createdAt: string;
}

export interface DuplicateMatch {
  id: string;
  title: string;
  company: string;
  stage: Stage;
  createdAt: string;
}

export interface CompanySummary {
  id: string;
  name: string;
  website: string | null;
  applicationCount: number;
  contactCount: number;
  sponsor: SponsorBadge;
}

export interface CompanyDetail extends CompanySummary {
  notes: string | null;
  applications: ApplicationSummary[];
  contacts: ContactSummary[];
  possibleSponsors: { id: string; name: string; town: string | null; routes: string[] }[];
}

export interface ContactSummary {
  id: string;
  name: string;
  type: ContactType;
  role: string | null;
  email: string | null;
  linkedinUrl: string | null;
  company: CompanyRef | null;
}

export interface ContactLogDto {
  id: string;
  direction: LogDirection;
  channel: LogChannel;
  at: string;
  note: string;
  application: { id: string; title: string } | null;
}

export interface ContactDetail extends ContactSummary {
  notes: string | null;
  applications: { id: string; title: string; company: string; stage: Stage }[];
  logs: ContactLogDto[];
}

export interface InterviewDto {
  id: string;
  applicationId: string;
  application: { id: string; title: string; company: string };
  type: InterviewType;
  startsAt: string | null;
  dueAt: string | null;
  durationMins: number | null;
  interviewers: string | null;
  location: string | null;
  prepNotes: string | null;
  reflections: string | null;
  completedAt: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
}
