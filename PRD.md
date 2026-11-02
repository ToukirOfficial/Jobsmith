# Jobsmith — PRD

**One line:** a free, open-source, self-hosted job search workspace with an AI agent: track every application, keep every CV version, and let the agent read the job, check UK visa sponsorship, match your CV and draft the cover letter, while you stay in control.

**Owner:** Toukir Ahmed Rony · **Licence:** AGPL-3.0 · **Repo:** public on GitHub · **Platform:** web only (responsive) · **Demo:** jobsmith.toukirahmedrony.com (demo mode)

The full, prioritised feature list is in `FEATURES.md`. Build every **[V1]** item; build **[V1+]** items only after all [V1] items pass their checks; never build **[Later]** items.

## 1. Why this exists

Built by a developer applying to dozens of jobs across the UK, Ireland and the EU. Spreadsheets fell apart: which CV version went to which company, when to follow up, which companies can even sponsor a visa, and hours spent rewriting cover letters. Jobsmith puts the whole job search in one private place and uses an AI agent for the repetitive half of each application. It is open source so any job seeker can run their own copy and keep their data to themselves.

## 2. How it is used

Self-hosted software, not a SaaS. A job seeker runs it on their own VPS or laptop with `docker compose up`. On first visit a setup screen creates their account. Single-user by default; `SIGNUP_ENABLED=true` lets one install serve several people, each seeing only their own data. AI is **bring your own key**: each user pastes their own key in Settings (Google Gemini by default, which offers a free tier with no card). Without a key, everything except the AI-only steps works. The public demo uses fake data and recorded agent runs, never the host's own key.

## 3. Users

- **Job seeker** (main user): tracks applications, builds CVs, runs the agent.
- **Self-hoster:** a developer installing Jobsmith for themselves or for a small group (a careers club, a bootcamp cohort).

## 4. Core journeys (must all work end to end)

1. **First run:** setup → fill in profile → create two CV versions → export a PDF.
2. **Save and apply:** paste a job link → fields filled from the page → review and save → mark as Applied with CV version and channel → follow-up reminder appears 7 days later.
3. **Agent:** on a saved job, click "Prepare application" → watch the 7 steps run live → review sponsor check, salary check, keyword match, cover letter and message → edit → save to the application.
4. **Interview:** add an interview with prep notes → reminder the day before → add reflections afterwards → move the card to Offer or Rejected.
5. **Review progress:** dashboard shows the funnel, response rates by channel and CV version, and this week's target.

## 5. Rules

- **Privacy first:** a user's data is visible only to that user, in every query. No telemetry. Outbound calls only to: the AI provider the user configured, job pages the user asked to fetch, and GOV.UK for the sponsor register.
- **Safe fetching (SSRF protection):** job page fetching allows http/https only, resolves DNS and blocks loopback, private, link-local and cloud metadata ranges, connects to the vetted IP, follows at most 3 redirects (each re-checked), 10-second timeout, 2 MB size limit, HTML only. Respect `robots.txt`. Never fetch LinkedIn or Indeed pages automatically; for those, the user pastes the job text instead (their terms forbid scraping).
- **Extraction order:** schema.org `JobPosting` JSON-LD first; then AI extraction only if the user has a key; the user always reviews before saving.
- **Snapshots:** the CV PDF and cover letter attached to an application are saved exactly as sent; later profile edits never change them.
- **Agent safety:** the agent only prepares; it never submits applications, sends emails or messages on the user's behalf. Job page text is untrusted input: wrapped and labelled as data in prompts, never treated as instructions (prompt-injection defence). Outputs are validated against Zod schemas; invalid outputs are retried once, then shown as a clear error.
- **Visa wording:** "licensed to sponsor" and "meets the threshold (guide only)", never "will sponsor you" or legal advice. Salary rules live in a versioned data file with effective dates and GOV.UK source links, shown with every check.
- **Writing style:** generated cover letters and messages must be plain, specific and human: short sentences, no clichés ("I am writing to express my keen interest", "passionate", "dynamic"), no invented experience. Only facts from the user's profile.
- **Keys:** AI keys encrypted at rest (AES-256-GCM, key from env), write-only, never logged, never sent to the browser.
- **Dates:** stored in UTC, shown in the user's time zone (default Europe/London).

## 6. Non-functional

- Dashboard and board load in under 1 second with the demo data.
- Agent runs in the background with live step progress (Server-Sent Events or WebSockets); a typical run finishes in under 60 seconds on a free-tier model.
- Accessibility: WCAG 2.2 AA. UK English.
- PDF output: A4, real selectable text, ATS-friendly.

## 7. Design and landing page

A portfolio project: it must look like a polished commercial product within 30 seconds.

- **Brand:** Jobsmith wordmark (simple SVG), calm focused palette (one confident accent, deep neutral text, soft backgrounds, clear stage and status colours), clean free open-licence font, defined once as Tailwind theme tokens.
- **Board:** smooth drag and drop, cards showing company, role, days in stage, sponsor badge and next reminder.
- **Agent view:** each step as a card that goes pending → running → done, with results appearing as they arrive; clear "Save to application" at the end.
- **CV builder:** editor on the left, live PDF preview on the right (stacked on phones).
- **Empty states** that explain the next step; skeletons, not spinners; friendly errors.
- **Landing page at /:** headline (e.g. "Your job search, organised. The boring half, done for you."), an animated agent run, features, "Your data stays on your server", "Bring your own key: works free with Gemini", self-host command, "Try the demo", "View on GitHub", FAQ.

## 8. Demo mode

`DEMO_MODE=true`: a fictional job seeker with about 25 applications across every stage, 3 CV versions, contacts, interviews, reminders and 8 weeks of stats; 3 recorded agent runs replayed step by step with realistic timing; an optional "try with your own key" box (demo-session only, encrypted, deleted after 24 hours, strict rate limits); emails captured in a demo mail viewer; sign-up off; job page fetching limited to a safe list of demo URLs; nightly reset. The host's own API key is never used by the demo.

## 9. Self-hosting

`docker compose up` runs web, API, worker, PostgreSQL and Redis. `.env.example` documents every setting. README covers install, first run, getting a free Gemini key, email setup, backups and upgrades.

## 10. README must include

The "why" story, screenshots or GIF, features, try the demo, self-host, how the agent works (steps, safety, prompt-injection defence, human in control), bring your own key and the free Gemini option (with its terms in plain words), architecture, decisions, tests. Plain, simple English, same standard as the Slotwise repo.

## 11. Out of scope (version 1)

Auto-applying to jobs, scraping job boards, LinkedIn or Indeed integration, inbox sync, browser extension (the bookmarklet covers it), native mobile apps, paid features, team/recruiter features.

## 12. Done means

- All 5 core journeys in section 4 work end to end on desktop and phone.
- The agent works with a real Gemini free-tier key locally, and with the fake provider in tests.
- Tests pass for: login and refresh, user data isolation (one user can never read another's data, including agent runs and files), SSRF protection on job fetching, JobPosting extraction from fixtures, company name normalisation and sponsor matching, salary rule selection by date, CV snapshot immutability, reminder scheduling (each sent once), API key encryption and never-returned, agent output validation with the fake provider, demo key expiry.
- Demo live with recorded agent runs; landing page done; `docker compose up` works from a clean machine; README complete.
