# Jobsmith — build plan

Web only. Stack and rules: the project rules. Scope: `PRD.md`, `FEATURES.md`. Decisions I had to make: `ASSUMPTIONS.md`.

**Local:** web **8035**, API **8135** (free in `~/projects/PORTS.md`, now listed there), PostgreSQL db `jobsmith` (+ `jobsmith_test`), Redis **db 5**, prefix `jobsmith:`.

## Decisions (answered 2 Nov 2026)

1. **PDF library:** `@react-pdf/renderer` approved; templates in `packages/pdf`.
2. **Redis:** db 9 (staffdock) and db 13 (actually used by ieltsty locally) are taken, so Jobsmith uses **db 5** (empty, unlisted).
3. **Email code:** required at every login when SMTP is set up; skipped (with a Settings note) when it isn't.
4. **Demo:** each visitor gets a private copy of the fictional data, deleted after 24 hours.
5. **Next.js:** 16.4.4 instead of 16.3.x — every 16.3 release has critical RCE advisories fixed only in 16.4.1+ (approved).

Sponsor register: `uk-sponsors` is **not on npm**, so its approach is ported into `apps/api` (MIT, credited).

## Data model (Prisma, UUIDv7, `createdAt`/`updatedAt` everywhere, every user table has indexed `userId`)

- **User** email, passwordHash, name, homeCity, timeZone, workAuthNotes, targetRoles[], targetLocations[], styleNote, weeklyTarget, icalToken, isDemo, demoExpiresAt · **RefreshToken** familyId, tokenHash, expiresAt, revokedAt · **EmailCode** purpose, codeHash, attempts, expiresAt, usedAt
- **ProfileItem** kind (contact/experience/project/skill/education/certification/link), data jsonb (Zod per kind), sortOrder · **ProfileBullet** itemId, text, sortOrder
- **CvVersion** name, headline, summary, template, selection jsonb (ordered sections → item ids → bullet ids)
- **Company** name, normalizedName (unique per user), website, notes, sponsorId? · **Sponsor** (global) name, normalizedName, town, county, rating, routes[] · **SponsorImport** sourceUrl, publishedAt, rowCount, status
- **Application** companyId, title, url, location, workMode, salaryMin/MaxPence, currency, closingDate, description, stage, stageChangedAt, channel, appliedAt, archivedAt, cvSnapshotId?, letterSnapshotId? · **StageEvent** from, to, at
- **Snapshot** (immutable: no update path) kind cv|coverLetter, content jsonb, fileId · **StoredFile** kind, randomPath, mime, size
- **LetterTemplate** name, body · **Draft** applicationId, kind (coverLetter/linkedinNote/followUpEmail), body
- **Contact** companyId?, type, name, role, email, linkedinUrl, notes · **ApplicationContact** · **ContactLog** direction, channel, at, note
- **Interview** applicationId, type (incl. takeHome), startsAt/dueAt, interviewers, location, prepNotes, reflections
- **Reminder** applicationId?, interviewId?, kind, dueAt, dedupeKey (unique), sentAt, emailedAt, dismissedAt
- **AiSettings** provider, model, baseUrl, keyCipher/iv/tag, keyLast4, monthlyLimit · **AiCall** purpose, provider, model, tokensIn/Out, ok
- **AgentRun** applicationId, status, promptVersion, startedAt, finishedAt · **AgentStep** runId, index, name, status, input/output jsonb, error, timings, tokens
- **DataJob** kind import|export, status, fileId, mapping, result · **DemoMail** (demo only) to, subject, body

## NestJS modules (`apps/api`)

Prisma · Queue (BullMQ queues + worker entry) · Auth · Setup · Users (settings) · Mail · Applications · Companies · Sponsors · JobFetch (SSRF-safe fetch + JSON-LD) · Cv (profile, versions) · Pdf (worker) · Files · Letters (templates, drafts) · Keywords · SalaryRules · Contacts · Interviews · Reminders (+ iCal) · Dashboard · DataPort (import/export/delete) · Ai (providers, keys, usage) · Agent · Demo · Health.

## API endpoints (all `/api/v1`; **U** = signed-in user, own data only, ownership checked in service)

- **Public:** `GET /health`, `GET /setup/status`, `POST /setup` (only while no user exists), `POST /auth/login`, `/auth/verify-code`, `/auth/refresh`, `/auth/forgot`, `/auth/reset` (all rate-limited), `POST /auth/signup` (only if `SIGNUP_ENABLED`), `GET /calendar/:icalToken.ics` (secret token), `POST /demo/start` (demo mode only)
- **U:** `POST /auth/logout`, `GET/PATCH /me`, `DELETE /me` (+ password)
- **U:** `GET/POST /applications`, `GET/PATCH/DELETE /applications/:id`, `POST /applications/:id/stage`, `/archive`, `/apply` (creates snapshots), `GET /applications/duplicates?company&title`
- **U:** `POST /job-fetch` (queued) → `GET /job-fetch/:id`; `GET /companies`, `GET/PATCH /companies/:id`; `GET /sponsors/match?name`
- **U:** `GET/PUT /profile`, CRUD `/cv-versions`, `POST /cv-versions/:id/pdf` (queued), `GET /files/:id` (owner check, streamed)
- **U:** CRUD `/letter-templates`, `/applications/:id/drafts`, `POST /drafts/:id/pdf`; `POST /keywords/match`; `POST /salary/check`
- **U:** CRUD `/contacts`, `/contacts/:id/logs`, `/interviews`; `GET /reminders`, `PATCH /reminders/:id`; `GET /calendar`, `POST /calendar/rotate-token`
- **U:** `GET /dashboard`; `POST /exports`, `POST /imports` (+ mapping), `GET /data-jobs/:id`
- **U:** `GET/PUT /ai/settings` (key write-only), `POST /ai/test`, `GET /ai/usage`
- **U:** `POST /applications/:id/agent-runs`, `GET /agent-runs/:id`, `GET /agent-runs/:id/stream` (SSE), `POST /agent-runs/:id/steps/:n/rerun`, `POST /agent-runs/:id/save`
- **Demo mode only (U, demo user):** `PUT/DELETE /demo/key`, `GET /demo/mail`

## Pages (`apps/web`)

`/` landing · `/setup` · `/login` · `/signup` · `/verify` · `/reset` · `/app` dashboard · `/app/board` · `/app/applications` table · `/app/applications/new` (link, paste text or manual; also bookmarklet target) · `/app/applications/[id]` (overview, documents, contacts, interviews, agent, timeline) · `/app/applications/[id]/agent/[runId]` · `/app/companies`, `/[id]` · `/app/cv` profile · `/app/cv/[versionId]` editor + live preview · `/app/letters` · `/app/contacts`, `/[id]` · `/app/calendar` · `/app/reminders` · `/app/settings` (account, job search, AI, calendar feed, bookmarklet, data) · `/demo/mail`.

## Phases (each ends with the the project rules checks; tests in brackets)

**1. Foundation, auth, isolation, design** — [x] done
- pnpm + Turborepo monorepo, Next 16.3, Nest 12, Prisma, worker entry, dev `docker-compose.dev.yml` (Postgres, Redis), GitHub Actions CI.
- Design tokens (palette, font, spacing) in Tailwind theme, shadcn themed, wordmark, app shell, skeleton/empty/error components.
- First-run setup, login + email code, rotating refresh cookies, reset, rate limits, Mail module (SMTP, dev capture). [login/refresh]
- Global deny-by-default guard, `userId` scoping, Zod pipe, Settings page. [isolation harness, grows each phase]

**2. Tracker (no AI)** — [ ]
- Applications: manual add, company auto-create with normalisation, duplicate warning, archive. [normalisation]
- Board (drag and drop, days in stage) and table (sort, filter, search), stage history.
- Application page: details, notes, timeline, channel.
- Contacts with message log; interviews with prep, reflections and take-homes.

**3. Save by link + sponsors** — [ ]
- SSRF-safe fetcher in the queue (vetted IP, redirects, limits, robots.txt, LinkedIn/Indeed blocked → paste text). [SSRF]
- JSON-LD `JobPosting` extraction into a review form. [fixtures]
- Bookmarklet (sends URL, title and selected text to `/app/applications/new`).
- Sponsor register import via GOV.UK Content API (streamed, column checks), daily schedule, badge on cards and company page. [sponsor matching]

**4. CV builder + PDF** — [ ]
- Structured profile editor (items + bullets).
- CV versions: pick and order items and bullets, own headline/summary; live preview.
- 3 ATS-friendly A4 templates; PDF generated in worker, served via owner-checked file route.
- "Mark as applied": CV + cover letter snapshots, immutable. [snapshot immutability]

**5. Letters, keyword match, salary, reminders** — [ ]
- Letter templates with placeholders, per-application letter and message drafts, PDF export / copy.
- Deterministic keyword match (skills dictionary + job text) with score; versioned salary rules file + salary check. [salary rule by date]
- Reminders (follow-up N days, interview tomorrow, closing soon, take-home due), in-app + email, each sent once. [reminder scheduling]
- Calendar view + private iCal feed.

**6. Dashboard + data** — [ ]
- Dashboard: today, funnel, response rate by channel / CV version / sponsor status, weekly chart, days to first reply, goal (Redis cached).
- Export all (JSON + CSV + PDFs zip) via queue; delete account and all data.
- CSV import with column mapping.
→ Journeys 1, 2, 4 and 5 work fully with no AI key.

**7. AI settings + agent** — [ ]
- Provider interface (Gemini default, OpenAI, Anthropic, OpenAI-compatible) via `fetch`; encrypted write-only key, test key, usage + monthly limit. [encryption, never returned]
- Versioned prompts in `prompts/` with untrusted-data wrapping; AI extraction fallback on save-by-link; AI keyword explanation.
- Agent: BullMQ job, 7 typed steps, Zod-validated with one retry, saved, SSE live progress, agent view, save to application, re-run a step; AI steps show "Add a key" without one. [step output validation, fake provider]
- `evals/` set + runner (manual, own key).

**8. Landing, demo, self-hosting** — [ ]
- Landing page at `/` with animated agent run, FAQ, self-host command.
- Demo mode: fictional seed (~25 applications, 3 CV versions, 8 weeks of stats), 3 recorded runs replayed, demo mail viewer, safe demo URL list, sign-up off, nightly reset.
- Demo "try your own key": session-only, encrypted, deleted after 24h, strict rate limits. [demo key expiry]
- Production Dockerfiles + `docker-compose.yml`, `.env.example`, full README.

**9. Optional [V1+]** (only if every [V1] check passes) — [ ]
- Import CV (PDF/DOCX) into the profile with AI, user reviews (needs a parser library — will ask).
- Interview question bank with best answers.

## New libraries (beyond the fixed stack)

**Needs your approval:** `@react-pdf/renderer` (Q1).
**API:** `argon2`, `bullmq`, `ioredis`, `nodemailer`, `cheerio` (JSON-LD/HTML text), `ipaddr.js` (IP range checks), `robots-parser`, `csv-parse` + `csv-stringify` (register, import, export), `archiver` (zip export), `ical-generator`. AI providers use plain `fetch` (no SDKs).
**Web:** `@dnd-kit/core` + `@dnd-kit/sortable` (board), `recharts` (shadcn charts), `lucide-react`, `sonner`, `radix-ui`. Dropped from the first draft as unnecessary: react-query, react-table, react-hook-form, date-fns (small in-house hooks and `Intl` cover them).
**Dev:** `vitest`, `supertest`, `@types/*`. Postgres extension `pg_trgm` (sponsor name suggestions).

## Deploy notes (for when you deploy — I never deploy)

- Three Node processes: web (8035), API (8135), **worker** (`node dist/worker.js`, no port). The worker must run for job fetching, PDFs, agent runs, reminders, emails, imports/exports and the register update.
- Scheduled jobs are BullMQ repeatable jobs registered by the worker on start (no system cron): reminders sweep every 5 min; sponsor register check daily 03:00 UTC (downloads only when GOV.UK publishes a new file, ~120k rows); demo reset nightly and demo key purge hourly (demo only).
- Env: `DATABASE_URL`, `REDIS_URL` (db per Q2), `JWT_*` secrets, `ENCRYPTION_KEY` (32 bytes, for AI keys — losing it makes saved keys unreadable), `SMTP_*`, `SIGNUP_ENABLED`, `DEMO_MODE`, `APP_URL`, `STORAGE_DIR` (outside any public folder, needs backups with the database), `TRUST_PROXY`.
- Migrations run with `prisma migrate deploy` before starting the API; dump the database first.
- nginx: proxy `/api` to 8135, everything else to 8035; disable buffering on `/api/v1/agent-runs/*/stream` (SSE).
- Outbound access needed: chosen AI provider, user-requested job pages, `www.gov.uk` / `assets.publishing.service.gov.uk`, SMTP host.
