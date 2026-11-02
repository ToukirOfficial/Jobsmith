import type { AgentStepName, AiProviderName, Channel, ContactType, CvTemplate, DraftKind, InterviewType, LogChannel, ProfileKind, ReminderKind, Stage, WorkMode } from './enums.js';

export const STAGE_LABELS: Record<Stage, string> = {
  SAVED: 'Saved',
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  COMPANY_SITE: 'Company site',
  LINKEDIN: 'LinkedIn',
  RECRUITER: 'Recruiter',
  REFERRAL: 'Referral',
  JOB_BOARD: 'Job board',
  EMAIL: 'Email',
  OTHER: 'Other',
};

export const WORK_MODE_LABELS: Record<WorkMode, string> = { ONSITE: 'On-site', HYBRID: 'Hybrid', REMOTE: 'Remote' };

export const PROFILE_KIND_LABELS: Record<ProfileKind, string> = {
  EXPERIENCE: 'Experience',
  PROJECT: 'Projects',
  SKILLS: 'Skills',
  EDUCATION: 'Education',
  CERTIFICATION: 'Certifications',
  LINK: 'Links',
};

export const CV_TEMPLATE_LABELS: Record<CvTemplate, string> = { CLASSIC: 'Classic', MODERN: 'Modern', COMPACT: 'Compact' };

export const DRAFT_KIND_LABELS: Record<DraftKind, string> = {
  COVER_LETTER: 'Cover letter',
  LINKEDIN_NOTE: 'LinkedIn note',
  FOLLOW_UP_EMAIL: 'Follow-up email',
};

export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  RECRUITER: 'Recruiter',
  HIRING_MANAGER: 'Hiring manager',
  REFERRAL: 'Referral',
  INTERVIEWER: 'Interviewer',
  OTHER: 'Other',
};

export const LOG_CHANNEL_LABELS: Record<LogChannel, string> = { EMAIL: 'Email', LINKEDIN: 'LinkedIn', PHONE: 'Phone', IN_PERSON: 'In person', OTHER: 'Other' };

export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  PHONE_SCREEN: 'Phone screen',
  TECHNICAL: 'Technical',
  TAKE_HOME: 'Take-home task',
  SYSTEM_DESIGN: 'System design',
  BEHAVIOURAL: 'Behavioural',
  FINAL: 'Final',
};

export const REMINDER_KIND_LABELS: Record<ReminderKind, string> = {
  FOLLOW_UP: 'Follow up',
  INTERVIEW_TOMORROW: 'Interview tomorrow',
  CLOSING_SOON: 'Closing soon',
  TAKE_HOME_DUE: 'Take-home due',
};

export const AI_PROVIDER_LABELS: Record<AiProviderName, string> = {
  GEMINI: 'Google Gemini',
  OPENAI: 'OpenAI',
  ANTHROPIC: 'Anthropic',
  OPENAI_COMPATIBLE: 'OpenAI-compatible (Ollama, OpenRouter…)',
};

export const AGENT_STEP_LABELS: Record<AgentStepName, string> = {
  READ_JOB: 'Read the job',
  SPONSOR_CHECK: 'Sponsor check',
  SALARY_CHECK: 'Salary check',
  PICK_CV: 'Pick the best CV',
  COVER_LETTER: 'Draft a cover letter',
  MESSAGE: 'Draft a short message',
  FOLLOW_UP: 'Suggest a follow-up date',
};

export const TIME_ZONES = [
  'Europe/London',
  'Europe/Dublin',
  'Europe/Lisbon',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Warsaw',
  'Europe/Athens',
  'Asia/Dhaka',
  'Asia/Kolkata',
  'Asia/Dubai',
  'America/New_York',
  'America/Toronto',
  'UTC',
] as const;
