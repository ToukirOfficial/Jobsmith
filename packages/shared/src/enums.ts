/** Values shared by the database, the API and the web app. Order matters: it is the display order. */
export const STAGES = ['SAVED', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'] as const;
export type Stage = (typeof STAGES)[number];
/** Stages that count as "the employer replied" for the funnel (ASSUMPTIONS.md). */
export const REPLIED_STAGES: Stage[] = ['SCREENING', 'INTERVIEW', 'OFFER'];
export const ACTIVE_STAGES: Stage[] = ['SAVED', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER'];

export const CHANNELS = ['COMPANY_SITE', 'LINKEDIN', 'RECRUITER', 'REFERRAL', 'JOB_BOARD', 'EMAIL', 'OTHER'] as const;
export type Channel = (typeof CHANNELS)[number];

export const WORK_MODES = ['ONSITE', 'HYBRID', 'REMOTE'] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const JOB_SOURCES = ['MANUAL', 'LINK', 'PASTE', 'BOOKMARKLET', 'IMPORT'] as const;
export type JobSource = (typeof JOB_SOURCES)[number];

export const PROFILE_KINDS = ['EXPERIENCE', 'PROJECT', 'SKILLS', 'EDUCATION', 'CERTIFICATION', 'LINK'] as const;
export type ProfileKind = (typeof PROFILE_KINDS)[number];

export const CV_TEMPLATES = ['CLASSIC', 'MODERN', 'COMPACT'] as const;
export type CvTemplate = (typeof CV_TEMPLATES)[number];

export const DRAFT_KINDS = ['COVER_LETTER', 'LINKEDIN_NOTE', 'FOLLOW_UP_EMAIL'] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export const CONTACT_TYPES = ['RECRUITER', 'HIRING_MANAGER', 'REFERRAL', 'INTERVIEWER', 'OTHER'] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export const LOG_DIRECTIONS = ['SENT', 'RECEIVED'] as const;
export type LogDirection = (typeof LOG_DIRECTIONS)[number];
export const LOG_CHANNELS = ['EMAIL', 'LINKEDIN', 'PHONE', 'IN_PERSON', 'OTHER'] as const;
export type LogChannel = (typeof LOG_CHANNELS)[number];

export const INTERVIEW_TYPES = ['PHONE_SCREEN', 'TECHNICAL', 'TAKE_HOME', 'SYSTEM_DESIGN', 'BEHAVIOURAL', 'FINAL'] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export const REMINDER_KINDS = ['FOLLOW_UP', 'INTERVIEW_TOMORROW', 'CLOSING_SOON', 'TAKE_HOME_DUE'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const AI_PROVIDERS = ['GEMINI', 'OPENAI', 'ANTHROPIC', 'OPENAI_COMPATIBLE'] as const;
export type AiProviderName = (typeof AI_PROVIDERS)[number];

export const AGENT_STEPS = ['READ_JOB', 'SPONSOR_CHECK', 'SALARY_CHECK', 'PICK_CV', 'COVER_LETTER', 'MESSAGE', 'FOLLOW_UP'] as const;
export type AgentStepName = (typeof AGENT_STEPS)[number];
export const RUN_STATUSES = ['QUEUED', 'RUNNING', 'DONE', 'FAILED'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export const STEP_STATUSES = ['PENDING', 'RUNNING', 'DONE', 'SKIPPED', 'FAILED'] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const JOB_STATUSES = ['PENDING', 'DONE', 'FAILED'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
