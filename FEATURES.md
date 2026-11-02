# Jobsmith — Feature list

Free, open-source, self-hosted job search workspace with an AI agent: track every application, keep every CV version, and let the agent do the boring half of each application. Web only. Bring your own AI key (Gemini by default, which has a free tier).

**Priority:** **[V1]** must be in version 1 · **[V1+]** in version 1 if time allows · **[Later]** not in version 1.

---

## 1. Accounts and setup
- [V1] **First-run setup screen:** on a fresh install, the first visitor creates the account. After that the setup screen is closed for good.
- [V1] **Single-user by default.** `SIGNUP_ENABLED=true` lets several people use one install; each person only ever sees their own data.
- [V1] Email + password login (argon2id) with a 6-digit email code; password reset.
- [V1] Settings: name, home city, time zone (default Europe/London), work authorisation notes (free text, e.g. "Graduate visa, new entrant"), target roles and locations.

## 2. Jobs and applications
- [V1] **Save a job by link:** paste a job URL; the system fetches the page safely and fills in title, company, location, salary, remote/hybrid, closing date and description. It reads schema.org `JobPosting` data first (no AI needed); if that's missing and an AI key is set, the AI extracts the fields. The user reviews before saving.
- [V1] Add a job manually.
- [V1] **Bookmarklet:** a browser bookmark that sends the current page to Jobsmith in one click.
- [V1] **Board view:** drag-and-drop stages: Saved → Applied → Screening → Interview → Offer, plus Rejected and Withdrawn. Stages are fixed in V1.
- [V1] **Table view** with sorting, filters (stage, company, location, date, sponsor status) and search.
- [V1] Application page: job details, stage history with dates, CV version sent, cover letter sent, contacts, interviews, notes, timeline.
- [V1] Record what was sent: which CV version (snapshotted, so later edits never change what was sent), which cover letter, through which channel (company site, LinkedIn, recruiter, referral, job board, email).
- [V1] Duplicate warning when the same company + role is saved twice.
- [V1] Archive old applications.
- [Later] Email inbox sync.

## 3. Companies
- [V1] Company records created automatically from jobs (with name normalisation so "Acme Ltd" and "ACME LIMITED" match).
- [V1] Company page: website, notes, all applications, all contacts.
- [V1] **UK sponsor badge:** whether the company is on the Home Office "Register of licensed sponsors: workers", with its routes, city and rating. Uses a local copy of the register, updated by a scheduled job through the GOV.UK Content API. Clearly says "licensed to sponsor", never "this job will sponsor you".

## 4. CV builder
- [V1] **Profile stored once as structured data:** contact details, headline, summary, experience (with bullet points), projects, skills, education, certifications, links.
- [V1] **CV versions:** e.g. "General full-stack", "Legal-tech", each choosing which items and bullets to include, in which order, with its own headline and summary.
- [V1] **PDF export** from 2–3 clean, ATS-friendly templates (single column, real text, no images of text, standard section headings). UK A4 format.
- [V1] Live preview while editing.
- [V1] Version history: every PDF sent with an application is kept exactly as sent.
- [V1+] Import an existing CV (PDF/DOCX) into the profile with AI, for the user to review.

## 5. Cover letters and messages
- [V1] Cover letter templates with placeholders ({company}, {role}, {hiringManager}, {myName}).
- [V1] Cover letter per application, created from a template or by the agent, edited freely, exported as PDF or copied as text.
- [V1] Short message drafts (LinkedIn note to a hiring manager, follow-up email) saved per application.

## 6. Keyword match
- [V1] Paste or use the saved job description; see which important keywords and skills the chosen CV version covers and which are missing, with a simple match score.
- [V1] Works **without AI** (deterministic keyword extraction against a skills dictionary plus the job text). With an AI key, the agent adds a short plain-English explanation.

## 7. The application agent (AI, bring your own key)
- [V1] **One button: "Prepare application"** on any saved job. The agent runs these steps in the background, showing live progress for each step:
  1. **Read the job:** extract the role, seniority, must-have and nice-to-have skills, salary, location and closing date.
  2. **Sponsor check:** is the company on the UK sponsor register; which routes.
  3. **Salary check (UK, guide only):** compare the advertised salary with the Skilled Worker general threshold and the new-entrant threshold from a versioned rules file, showing which applies and the source date. Always marked "guide only, check GOV.UK".
  4. **Pick the best CV version** and show the keyword match.
  5. **Draft a tailored cover letter** in the user's own voice (using their profile and a style note they set), plain and human, no clichés.
  6. **Draft a short message** for the hiring manager or recruiter.
  7. **Suggest a follow-up date.**
- [V1] **Human in control:** nothing is sent anywhere. The user reviews every result, edits, then clicks "Save to application". The agent never applies to jobs on the user's behalf.
- [V1] Each run is saved: steps, inputs, outputs, timings and token usage, viewable afterwards.
- [V1] Re-run a single step (e.g. a new cover letter draft).
- [V1] Works step by step without AI where possible (sponsor check, salary check, keyword match); AI-only steps show "Add an API key in Settings" when no key is set.

## 8. AI settings (bring your own key)
- [V1] Settings → AI: provider (Google Gemini by default; OpenAI; Anthropic; any OpenAI-compatible endpoint, which also covers Ollama), model name, API key.
- [V1] Key stored encrypted, write-only (only the last 4 characters shown), never logged. "Test key" button.
- [V1] Monthly usage shown (requests and tokens); optional monthly request limit set by the user.
- [V1] A clear note that free tiers may use prompts to improve the provider's products, so don't put private documents in prompts.

## 9. Contacts
- [V1] Recruiters, hiring managers, referrals and interviewers: name, company, role, email, LinkedIn URL, notes.
- [V1] Linked to applications and companies; a simple log of messages sent and received (manual entries).

## 10. Interviews
- [V1] Interviews per application: date and time, type (phone screen, technical, take-home, system design, behavioural, final), interviewers, location or video link.
- [V1] Prep notes before, and reflections after (questions asked, how it went, what to improve).
- [V1] Take-home tasks with deadlines.
- [V1+] Question bank: save interview questions across applications, with your best answers.

## 11. Reminders and calendar
- [V1] Reminders: follow up after N days with no reply (default 7), interview tomorrow, closing date soon, take-home due.
- [V1] Email reminders (via SMTP) and an in-app reminders list.
- [V1] Calendar view of interviews, closing dates and follow-ups; an iCal feed (private secret URL) to subscribe from Google or Apple Calendar.

## 12. Dashboard and stats
- [V1] Today: reminders due, interviews this week, applications waiting for a reply.
- [V1] **Funnel:** saved → applied → replied → interview → offer, with conversion rates.
- [V1] Response rate by channel, by CV version, and by sponsor status.
- [V1] Applications per week chart; average days to first reply.
- [V1] Goal tracker: weekly application target vs actual.

## 13. Import, export and privacy
- [V1] Export everything (JSON + CSV, plus all PDFs as a zip).
- [V1] Import applications from a CSV (e.g. an old spreadsheet), with column mapping.
- [V1] Delete account and all data.
- [V1] No telemetry. No data leaves the server except calls to the AI provider the user chose, job page fetches the user asked for, and the GOV.UK register download.

## 14. Demo mode, landing page and self-hosting
- [V1] Landing page: what it is, who it's for, the agent explained with an animated example, "Try the demo", "View on GitHub", self-host command, FAQ.
- [V1] Demo mode: a fictional job seeker with a realistic, fake job search (applications in every stage, CV versions, interviews, stats), **recorded agent runs** replayed step by step, an optional "try with your own key" box (key kept for the demo session only, encrypted, deleted after 24 hours), emails captured in a demo mail viewer, sign-up off, nightly reset.
- [V1] `docker compose up` for self-hosting (web, API, worker, PostgreSQL, Redis).
- [V1] README with screenshots or GIF, features, self-hosting, how the agent works, how to get a free Gemini key, decisions, tests.
