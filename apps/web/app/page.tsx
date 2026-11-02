import Link from 'next/link';
import type { Metadata } from 'next';
import { BadgeCheck, Bell, FileText, KeyRound, Lock, Server, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/brand';
import { AgentDemo } from '@/components/landing/agent-demo';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Jobsmith: your job search, organised',
  description: 'A free, open-source, self-hosted job search workspace. Track every application, keep every CV version, and let an AI agent do the boring half of each application while you stay in control.',
};

const GITHUB = 'https://github.com/ToukirOfficial/Jobsmith';

const AGENT_STEPS: [string, string, boolean][] = [
  ['Read the job', 'Role, level, must-haves, salary and closing date, pulled out of the advert.', true],
  ['Sponsor check', 'Is the company on the Home Office register of licensed sponsors, and for which routes.', false],
  ['Salary check', 'The advertised salary against the Skilled Worker thresholds, with the GOV.UK source. Guide only.', false],
  ['Pick the best CV', 'Your CV versions scored against the job’s skills, with what’s covered and what’s missing.', false],
  ['Draft a cover letter', 'Plain, specific and in your voice, using only facts from your profile.', true],
  ['Draft a short message', 'A note for the hiring manager or recruiter.', true],
  ['Suggest a follow-up date', 'So the application doesn’t go quiet.', false],
];

const FAQ: [string, React.ReactNode][] = [
  ['Is it really free?', 'Yes. Jobsmith is open source under the AGPL-3.0 licence. You run it on your own server or laptop. There are no paid plans and no telemetry.'],
  [
    'Do I need an AI key?',
    'No. The tracker, CV builder, PDF export, sponsor and salary checks, keyword match and reminders all work without one. A key unlocks the writing steps: reading adverts, drafting letters and messages. Google Gemini has a free tier that needs no card.',
  ],
  [
    'What happens to my data when I use AI?',
    'Each agent step sends the job advert and your profile to the AI provider you chose, and nothing else. On free tiers, providers may use prompts to improve their products, so keep private details out of your profile. Paid tiers usually don’t train on your data; check your provider’s terms.',
  ],
  ['Will the agent apply for jobs for me?', 'No. It only prepares. It never submits applications, sends emails or messages anyone. You review every result, edit it, and decide what to send.'],
  [
    'Can it tell me if a job will sponsor my visa?',
    'It tells you whether the company is licensed to sponsor, from the Home Office register, and whether the salary meets the Skilled Worker thresholds as a guide. It can’t tell you whether a particular job will sponsor you, and it isn’t legal advice.',
  ],
  ['Does it scrape LinkedIn or Indeed?', 'No. Their terms forbid it. For those sites you paste the job text, or select it and use the bookmarklet. Other job pages are fetched one at a time, only when you ask.'],
  ['Can several people use one copy?', 'Yes. Set SIGNUP_ENABLED=true and each person gets their own private workspace. Nobody can see anyone else’s applications, CVs or keys.'],
];

function Board() {
  const cols: [string, string, string[]][] = [
    ['Saved', 'bg-stage-saved', ['Sablewood Studio', 'Cobalt & Pine']],
    ['Applied', 'bg-stage-applied', ['Larkspur Bank', 'Thistle Data Co', 'Bramble Health']],
    ['Interview', 'bg-stage-interview', ['Pebble Finance', 'Juniper Grid']],
    ['Offer', 'bg-stage-offer', ['Brightwave Software']],
  ];
  return (
    <div className="grid grid-cols-4 gap-2" aria-hidden>
      {cols.map(([name, rule, cards]) => (
        <div key={name} className="rounded-md bg-canvas-deep/70 pb-2">
          <div className={`h-[3px] rounded-t-md ${rule}`} />
          <p className="px-2 pt-1.5 pb-1 text-[0.65rem] font-bold text-ink-soft">{name}</p>
          <div className="space-y-1.5 px-1.5">
            {cards.map((c) => (
              <div key={c} className={`rounded border-l-[3px] bg-paper px-1.5 py-1 text-[0.6rem] leading-tight font-semibold shadow-sm ${rule.replace('bg-', 'border-l-')}`}>
                {c}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <nav aria-label="Site" className="flex items-center gap-1 text-sm">
          <a href={GITHUB} className="hidden rounded-md px-3 py-2 font-medium text-ink-soft hover:text-ink sm:block">
            GitHub
          </a>
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/demo">Try the demo</Link>
          </Button>
        </nav>
      </header>

      <main id="main">
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pt-8 pb-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:pt-14">
          <div className="space-y-6">
            <h1 className="max-w-xl text-[2.5rem] leading-[1.05] font-extrabold tracking-[-0.028em] text-ink sm:text-hero">Your job search, organised. The boring half, done for you.</h1>
            <p className="max-w-lg text-lg text-ink-soft">
              Track every application, keep every CV version, and let an agent read the job, check UK visa sponsorship, match your CV and draft the cover letter. You stay in control of what gets sent.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/demo">Try the demo</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href={GITHUB}>View on GitHub</a>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">Free and open source (AGPL-3.0). Runs on your own server. Bring your own AI key, or use it without one.</p>
          </div>
          <AgentDemo />
        </section>

        <section className="border-y border-border bg-paper">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 lg:grid-cols-3">
            <div className="space-y-4">
              <Board />
              <h2 className="text-xl font-bold">Every application in one place</h2>
              <p className="text-ink-soft">Save jobs from a link, a paste or a bookmark. Drag them across the board, log who you spoke to, and keep interview prep and reflections with each one.</p>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-2" aria-hidden>
                {['General full-stack', 'Legal-tech', 'Backend focus'].map((v, i) => (
                  <span key={v} className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[0.7rem] font-semibold ${i === 1 ? 'border-brand bg-brand-tint text-brand' : 'border-border bg-paper'}`}>
                    <FileText className="size-3.5" /> {v}
                  </span>
                ))}
              </div>
              <h2 className="text-xl font-bold">One profile, many CVs</h2>
              <p className="text-ink-soft">Write your experience once. Make tailored versions that pick the right bullets, preview them live and export clean A4 PDFs that applicant tracking systems can read. What you sent is frozen with each application.</p>
            </div>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2" aria-hidden>
                <span className="inline-flex items-center gap-1 rounded-full bg-ok-tint px-2.5 py-1 text-xs font-semibold text-ok">
                  <BadgeCheck className="size-3.5" /> Licensed sponsor
                </span>
                <span className="rounded-full bg-canvas-deep px-2.5 py-1 text-xs font-semibold">£48,000 ≥ £41,700</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2.5 py-1 text-xs font-semibold text-brand">
                  <Bell className="size-3.5" /> Follow up Monday
                </span>
              </div>
              <h2 className="text-xl font-bold">Checks that save you hours</h2>
              <p className="text-ink-soft">See at a glance which companies are on the UK sponsor register, whether a salary meets the visa thresholds, which skills your CV is missing, and when to follow up.</p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-4">
              <h2 className="text-3xl font-extrabold tracking-tight">How the agent works</h2>
              <p className="text-ink-soft">Press “Prepare application” on a saved job. Seven steps run in the background while you watch. Four of them never touch AI.</p>
              <ul className="space-y-3 pt-2 text-sm">
                {[
                  [ShieldCheck, 'It only prepares. It never applies, emails or messages anyone.'],
                  [Lock, 'Job pages are treated as data, never as instructions, so a sneaky advert can’t take over the agent.'],
                  [BadgeCheck, 'Every answer is checked before it’s saved: the right shape, no clichés, no invented experience.'],
                  [FileText, 'You review and edit everything, then save it to the application.'],
                ].map(([Icon, text]) => {
                  const I = Icon as typeof ShieldCheck;
                  return (
                    <li key={text as string} className="flex gap-3">
                      <I className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                      <span>{text as string}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <ol className="space-y-3">
              {AGENT_STEPS.map(([title, text, ai], i) => (
                <li key={title} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 rounded-lg border border-border bg-paper p-4">
                  <span className="grid size-8 place-items-center rounded-full bg-canvas-deep text-sm font-bold tabular-nums">{i + 1}</span>
                  <span>
                    <span className="flex items-center gap-2 font-semibold">
                      {title}
                      <span className={`rounded-full px-1.5 text-[0.65rem] font-bold ${ai ? 'bg-spark-tint text-spark' : 'bg-canvas-deep text-ink-soft'}`}>{ai ? 'AI' : 'No AI'}</span>
                    </span>
                    <span className="text-sm text-ink-soft">{text}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-ink text-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-2">
            <div className="space-y-3">
              <Server className="size-6 text-spark" aria-hidden />
              <h2 className="text-2xl font-bold">Your data stays on your server</h2>
              <p className="text-white/75">
                Jobsmith runs wherever you put it: a small VPS or your laptop. No telemetry. The only outside calls are to the AI provider you choose, the job pages you ask it to read, and GOV.UK for the sponsor register.
              </p>
            </div>
            <div className="space-y-3">
              <KeyRound className="size-6 text-spark" aria-hidden />
              <h2 className="text-2xl font-bold">Bring your own key: works free with Gemini</h2>
              <p className="text-white/75">
                Paste a Google Gemini key from AI Studio and the agent works on its free tier, no card needed. In plain words, the trade-off: on the free tier Google may use what you send to improve its products. OpenAI, Anthropic and local models through Ollama work too.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid gap-10 lg:grid-cols-2">
            <div className="space-y-4">
              <h2 className="text-3xl font-extrabold tracking-tight">Run your own copy</h2>
              <p className="text-ink-soft">You need Docker. Then:</p>
              <pre className="overflow-x-auto rounded-lg bg-ink p-4 text-sm leading-relaxed text-white">
                <code>{`git clone ${GITHUB}.git
cd Jobsmith
cp .env.example .env   # add your secrets
docker compose up -d`}</code>
              </pre>
              <p className="text-sm text-ink-soft">
                Open it in your browser and create your account. The{' '}
                <a href={`${GITHUB}#readme`} className="font-semibold text-brand hover:underline">
                  README
                </a>{' '}
                covers email, backups, upgrades and getting a free Gemini key.
              </p>
            </div>
            <div>
              <h2 className="mb-2 text-3xl font-extrabold tracking-tight">Questions</h2>
              <Accordion type="single" collapsible>
                {FAQ.map(([q, a]) => (
                  <AccordionItem key={q} value={q}>
                    <AccordionTrigger className="text-left">{q}</AccordionTrigger>
                    <AccordionContent className="text-ink-soft">{a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <Logo />
          <p>Free and open source under AGPL-3.0. Made by a developer who got tired of spreadsheets.</p>
          <a href={GITHUB} className="font-semibold text-ink hover:text-brand">
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
