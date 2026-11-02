import { normaliseCompany, normaliseTitle, type Channel, type Stage } from '@jobsmith/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { ReminderPlanner } from '../reminders/reminder-planner.js';

/**
 * A fictional, realistic job search for the demo and the local seed: a full-stack developer in the UK on a
 * Graduate visa, eight weeks in. Every company, person and email address here is made up (example domains).
 */

const DAY = 86_400_000;

interface SeedApp {
  title: string;
  company: string;
  location: string;
  workMode: 'ONSITE' | 'HYBRID' | 'REMOTE';
  salary: [number, number] | null;
  /** Days ago the job was saved. */
  saved: number;
  /** Stage path with days-ago for each move after saving. */
  path: [Stage, number][];
  channel?: Channel;
  closingIn?: number;
  archived?: boolean;
  description: string;
}

const DESC = (role: string, company: string, must: string[], nice: string[], extra = '') =>
  `${company} is hiring a ${role} to join a small product team.

What you'll do
- Build and ship features across the stack, from database to UI.
- Work closely with design and product on small, frequent releases.
- Review code and help keep the codebase simple and well tested.

What we're looking for
${must.map((m) => `- ${m}`).join('\n')}

Nice to have
${nice.map((m) => `- ${m}`).join('\n')}
${extra}
We sponsor Skilled Worker visas for this role where needed.`;

const STACK = ['3+ years with TypeScript and React', 'Node.js APIs (NestJS or Express)', 'PostgreSQL and SQL', 'Writing automated tests'];

export const DEMO_APPS: SeedApp[] = [
  { title: 'Full-stack Developer', company: 'Brightwave Software Ltd', location: 'Manchester', workMode: 'HYBRID', salary: [42000, 50000], saved: 54, path: [['APPLIED', 53], ['SCREENING', 47], ['INTERVIEW', 40], ['OFFER', 9]], channel: 'COMPANY_SITE', description: DESC('Full-stack Developer', 'Brightwave Software', STACK, ['Docker', 'AWS', 'Accessibility (WCAG)']) },
  { title: 'Backend Engineer (Node.js)', company: 'Kestrel Systems', location: 'London', workMode: 'HYBRID', salary: [55000, 65000], saved: 50, path: [['APPLIED', 49], ['SCREENING', 44], ['INTERVIEW', 36], ['REJECTED', 28]], channel: 'LINKEDIN', description: DESC('Backend Engineer', 'Kestrel Systems', ['Node.js and TypeScript', 'PostgreSQL', 'Redis and message queues', 'REST API design'], ['Kubernetes', 'GraphQL']) },
  { title: 'Software Engineer', company: 'Lumen Analytics', location: 'Bristol', workMode: 'REMOTE', salary: [45000, 52000], saved: 48, path: [['APPLIED', 47], ['REJECTED', 33]], channel: 'JOB_BOARD', description: DESC('Software Engineer', 'Lumen Analytics', ['Python or TypeScript', 'SQL and data modelling', 'Cloud platforms (GCP or AWS)'], ['dbt', 'Airflow']) },
  { title: 'Junior Full-stack Engineer', company: 'Harbour Health Tech', location: 'Leeds', workMode: 'HYBRID', salary: [32000, 38000], saved: 46, path: [['APPLIED', 45], ['SCREENING', 38], ['WITHDRAWN', 30]], channel: 'RECRUITER', description: DESC('Junior Full-stack Engineer', 'Harbour Health Tech', ['JavaScript and React', 'Any backend language', 'Git'], ['Healthcare data (FHIR)']) },
  { title: 'Product Engineer', company: 'Pebble Finance', location: 'London', workMode: 'HYBRID', salary: [60000, 70000], saved: 43, path: [['APPLIED', 42], ['SCREENING', 35], ['INTERVIEW', 24]], channel: 'REFERRAL', description: DESC('Product Engineer', 'Pebble Finance', [...STACK, 'Product sense: you care about why, not only how'], ['Fintech experience', 'Open banking APIs']) },
  { title: 'React Developer', company: 'Orbit Labs', location: 'Remote (UK)', workMode: 'REMOTE', salary: [48000, 55000], saved: 41, path: [['APPLIED', 40], ['REJECTED', 26]], channel: 'COMPANY_SITE', description: DESC('React Developer', 'Orbit Labs', ['React and TypeScript', 'CSS and design systems', 'Testing Library'], ['Next.js', 'Storybook']) },
  { title: 'Graduate Software Developer', company: 'Tidewater Logistics', location: 'Southampton', workMode: 'ONSITE', salary: [30000, 33000], saved: 39, path: [['APPLIED', 38]], channel: 'JOB_BOARD', archived: true, description: DESC('Graduate Software Developer', 'Tidewater Logistics', ['A degree in computing or a related subject', 'Some programming in any language'], ['C#', '.NET']) },
  { title: 'Full-stack Engineer, Legal Tech', company: 'Quillstone Legal Technology', location: 'London', workMode: 'HYBRID', salary: [50000, 58000], saved: 36, path: [['APPLIED', 35], ['SCREENING', 29], ['INTERVIEW', 20]], channel: 'LINKEDIN', description: DESC('Full-stack Engineer', 'Quillstone Legal Technology', [...STACK, 'Document generation (PDF)'], ['Legal or regulated industry experience', 'Search (Elasticsearch)']) },
  { title: 'Software Engineer II', company: 'Ferrous Robotics', location: 'Cambridge', workMode: 'ONSITE', salary: [52000, 60000], saved: 34, path: [['APPLIED', 33], ['REJECTED', 19]], channel: 'COMPANY_SITE', description: DESC('Software Engineer II', 'Ferrous Robotics', ['TypeScript or Python', 'Real-time systems', 'Linux'], ['ROS', 'C++']) },
  { title: 'Web Developer', company: 'Meadowlark Learning', location: 'Edinburgh', workMode: 'REMOTE', salary: [38000, 44000], saved: 31, path: [['APPLIED', 30], ['SCREENING', 22]], channel: 'EMAIL', description: DESC('Web Developer', 'Meadowlark Learning', ['HTML, CSS and JavaScript', 'React or Vue', 'Accessibility (WCAG 2.2)'], ['EdTech experience']) },
  { title: 'Backend Developer', company: 'Granite Ledger', location: 'Birmingham', workMode: 'HYBRID', salary: [46000, 54000], saved: 28, path: [['APPLIED', 27]], channel: 'JOB_BOARD', description: DESC('Backend Developer', 'Granite Ledger', ['Node.js or Go', 'PostgreSQL', 'Event-driven systems'], ['Accounting domain knowledge']) },
  { title: 'Full-stack Developer', company: 'Juniper Grid Energy', location: 'Glasgow', workMode: 'HYBRID', salary: [44000, 50000], saved: 25, path: [['APPLIED', 24], ['SCREENING', 15], ['INTERVIEW', 8]], channel: 'RECRUITER', description: DESC('Full-stack Developer', 'Juniper Grid Energy', STACK, ['Time-series data', 'Energy sector']) },
  { title: 'TypeScript Engineer', company: 'Saltmarsh Games', location: 'Brighton', workMode: 'REMOTE', salary: [50000, 60000], saved: 22, path: [['APPLIED', 21]], channel: 'COMPANY_SITE', description: DESC('TypeScript Engineer', 'Saltmarsh Games', ['TypeScript', 'Node.js', 'WebSockets'], ['Game backend experience']) },
  { title: 'Software Developer', company: 'Copperleaf Insurance', location: 'Norwich', workMode: 'HYBRID', salary: [41000, 47000], saved: 20, path: [['APPLIED', 19]], channel: 'LINKEDIN', description: DESC('Software Developer', 'Copperleaf Insurance', ['C# or TypeScript', 'SQL Server or PostgreSQL', 'REST APIs'], ['Insurance domain']) },
  { title: 'Frontend Engineer', company: 'Nimbus Retail Group', location: 'London', workMode: 'HYBRID', salary: [55000, 62000], saved: 17, path: [['APPLIED', 16]], channel: 'COMPANY_SITE', description: DESC('Frontend Engineer', 'Nimbus Retail Group', ['React and TypeScript', 'Performance and Core Web Vitals', 'Design systems'], ['E-commerce', 'Next.js']) },
  { title: 'Full-stack Developer', company: 'Larkspur Bank', location: 'Leeds', workMode: 'HYBRID', salary: [48000, 56000], saved: 14, path: [['APPLIED', 13]], channel: 'REFERRAL', description: DESC('Full-stack Developer', 'Larkspur Bank', [...STACK, 'Security-minded coding'], ['Banking or payments']) },
  { title: 'Platform Engineer', company: 'Vantage Rail Data', location: 'Derby', workMode: 'HYBRID', salary: [50000, 58000], saved: 12, path: [['APPLIED', 11]], channel: 'JOB_BOARD', description: DESC('Platform Engineer', 'Vantage Rail Data', ['Node.js', 'Docker and CI/CD', 'PostgreSQL'], ['Terraform', 'Rail industry']) },
  { title: 'Junior Developer', company: 'Driftwood Media', location: 'Cardiff', workMode: 'ONSITE', salary: [28000, 32000], saved: 10, path: [['APPLIED', 9]], channel: 'EMAIL', description: DESC('Junior Developer', 'Driftwood Media', ['JavaScript', 'HTML and CSS'], ['WordPress', 'PHP']) },
  { title: 'Software Engineer, Data Products', company: 'Thistle Data Co', location: 'Edinburgh', workMode: 'HYBRID', salary: [47000, 55000], saved: 8, path: [['APPLIED', 6]], channel: 'LINKEDIN', description: DESC('Software Engineer', 'Thistle Data Co', ['TypeScript', 'SQL', 'Data visualisation'], ['D3', 'Python']) },
  { title: 'Full-stack Developer', company: 'Bramble Health', location: 'Nottingham', workMode: 'HYBRID', salary: [43000, 49000], saved: 6, path: [['APPLIED', 4]], channel: 'COMPANY_SITE', description: DESC('Full-stack Developer', 'Bramble Health', STACK, ['NHS integrations']) },
  { title: 'Node.js Developer', company: 'Atlas Freight Software', location: 'Manchester', workMode: 'REMOTE', salary: [45000, 52000], saved: 5, path: [], closingIn: 2, description: DESC('Node.js Developer', 'Atlas Freight Software', ['Node.js and TypeScript', 'PostgreSQL', 'BullMQ or similar queues'], ['Logistics domain']) },
  { title: 'Full-stack Engineer', company: 'Sablewood Studio', location: 'Bristol', workMode: 'HYBRID', salary: [46000, 54000], saved: 4, path: [], closingIn: 12, description: DESC('Full-stack Engineer', 'Sablewood Studio', [...STACK, 'Next.js'], ['Design tooling', 'Figma plugins']) },
  { title: 'Software Engineer', company: 'Cobalt & Pine', location: 'London', workMode: 'HYBRID', salary: [58000, 68000], saved: 3, path: [], closingIn: 20, description: DESC('Software Engineer', 'Cobalt & Pine', STACK, ['Kafka', 'Go']) },
  { title: 'Developer, Internal Tools', company: 'Ember Lane Retail', location: 'Remote (UK)', workMode: 'REMOTE', salary: null, saved: 2, path: [], description: DESC('Developer', 'Ember Lane Retail', ['TypeScript', 'React', 'Internal tooling'], ['Retail operations']) },
  { title: 'Graduate Engineer', company: 'Fernhill Robotics', location: 'Oxford', workMode: 'ONSITE', salary: [34000, 36000], saved: 1, path: [], closingIn: 9, description: DESC('Graduate Engineer', 'Fernhill Robotics', ['A computing degree', 'Python or TypeScript'], ['Robotics projects']) },
];

const PEOPLE = [
  { company: 'Brightwave Software Ltd', name: 'Priya Natarajan', type: 'HIRING_MANAGER', role: 'Engineering Manager', email: 'priya.n@brightwave.example' },
  { company: 'Brightwave Software Ltd', name: 'Tom Ashby', type: 'RECRUITER', role: 'Talent Partner', email: 'tom.ashby@brightwave.example' },
  { company: 'Kestrel Systems', name: 'Joanna Price', type: 'RECRUITER', role: 'Technical Recruiter', email: 'joanna@kestrel.example' },
  { company: 'Pebble Finance', name: 'Marcus Webb', type: 'REFERRAL', role: 'Senior Engineer (old university friend)', email: 'marcus.webb@pebble.example' },
  { company: 'Pebble Finance', name: 'Elena Kovač', type: 'INTERVIEWER', role: 'Staff Engineer', email: null },
  { company: 'Quillstone Legal Technology', name: 'Hannah Okafor', type: 'HIRING_MANAGER', role: 'Head of Engineering', email: 'hannah@quillstone.example' },
  { company: 'Juniper Grid Energy', name: 'Ryan McAllister', type: 'RECRUITER', role: 'Recruitment Consultant, Northline Talent', email: 'ryan@northline-talent.example' },
  { company: 'Meadowlark Learning', name: 'Sofia Lindqvist', type: 'HIRING_MANAGER', role: 'Product Lead', email: 'sofia@meadowlark.example' },
] as const;

/** Fills an existing user with the fictional job search. `now` makes the dates relative and repeatable. */
export async function seedJobSearch(tx: Prisma.TransactionClient, userId: string, now = new Date()) {
  const ago = (days: number, hour = 10) => {
    const d = new Date(now.getTime() - days * DAY);
    d.setUTCHours(hour, 0, 0, 0);
    return d;
  };
  await tx.user.update({
    where: { id: userId },
    data: {
      homeCity: 'Manchester',
      workAuthNotes: 'Graduate visa until 2027; would need Skilled Worker sponsorship after (new entrant)',
      targetRoles: ['Full-stack developer', 'Backend engineer', 'Product engineer'],
      targetLocations: ['Manchester', 'Leeds', 'London (hybrid)', 'Remote (UK)'],
      styleNote: 'Plain and direct. Short sentences. Lead with what I built and the result. No exclamation marks.',
      weeklyTarget: 5,
    },
  });

  const companyIds = new Map<string, string>();
  const appIds = new Map<string, string>();
  const positions = new Map<Stage, number>();
  for (const a of DEMO_APPS) {
    const normalizedName = normaliseCompany(a.company);
    let companyId = companyIds.get(normalizedName);
    if (!companyId) {
      companyId = (await tx.company.create({ data: { userId, name: a.company, normalizedName, website: `https://${normalizedName.replace(/\s+/g, '')}.example` } })).id;
      companyIds.set(normalizedName, companyId);
    }
    const stage: Stage = a.path.length ? a.path[a.path.length - 1]![0] : 'SAVED';
    const appliedStep = a.path.find(([s]) => s === 'APPLIED');
    const replyStep = a.path.find(([s]) => s === 'SCREENING' || s === 'INTERVIEW' || s === 'OFFER');
    const lastMove = a.path.length ? a.path[a.path.length - 1]![1] : a.saved;
    const position = positions.get(stage) ?? 0;
    positions.set(stage, position + 1);
    const app = await tx.application.create({
      data: {
        userId,
        companyId,
        title: a.title,
        normalizedTitle: normaliseTitle(a.title),
        url: `https://careers.${normalizedName.replace(/\s+/g, '')}.example/jobs/${normaliseTitle(a.title).replace(/\s+/g, '-')}`,
        location: a.location,
        workMode: a.workMode,
        salaryMinPence: a.salary ? a.salary[0] * 100 : null,
        salaryMaxPence: a.salary ? a.salary[1] * 100 : null,
        closingDate: a.closingIn ? new Date(`${new Date(now.getTime() + a.closingIn * DAY).toISOString().slice(0, 10)}T00:00:00Z`) : null,
        description: a.description,
        source: 'LINK',
        stage,
        position,
        stageChangedAt: ago(lastMove, 15),
        channel: a.channel ?? null,
        appliedAt: appliedStep ? ago(appliedStep[1], 11) : null,
        firstReplyAt: replyStep ? ago(replyStep[1], 14) : null,
        archivedAt: a.archived ? ago(5) : null,
        createdAt: ago(a.saved, 9),
      },
    });
    appIds.set(a.company, app.id);
    await tx.stageEvent.create({ data: { userId, applicationId: app.id, to: 'SAVED', at: ago(a.saved, 9) } });
    let from: Stage = 'SAVED';
    for (const [to, days] of a.path) {
      await tx.stageEvent.create({ data: { userId, applicationId: app.id, from, to, at: ago(days, to === 'APPLIED' ? 11 : 15) } });
      from = to;
    }
  }

  const contactIds = new Map<string, string>();
  for (const p of PEOPLE) {
    const companyId = companyIds.get(normaliseCompany(p.company))!;
    const c = await tx.contact.create({ data: { userId, companyId, type: p.type, name: p.name, role: p.role, email: p.email } });
    contactIds.set(p.name, c.id);
    await tx.applicationContact.create({ data: { userId, applicationId: appIds.get(p.company)!, contactId: c.id } });
  }
  const log = (name: string, company: string, direction: 'SENT' | 'RECEIVED', channel: 'EMAIL' | 'LINKEDIN' | 'PHONE', days: number, note: string) =>
    tx.contactLog.create({ data: { userId, contactId: contactIds.get(name)!, applicationId: appIds.get(company)!, direction, channel, at: ago(days, 12), note } });
  await log('Tom Ashby', 'Brightwave Software Ltd', 'RECEIVED', 'EMAIL', 47, 'Invited me to a 30-minute screening call.');
  await log('Priya Natarajan', 'Brightwave Software Ltd', 'SENT', 'EMAIL', 39, 'Thanked her for the technical interview and sent the GitHub link we discussed.');
  await log('Priya Natarajan', 'Brightwave Software Ltd', 'RECEIVED', 'PHONE', 9, 'Verbal offer: £47,000, hybrid 2 days. Written offer to follow. They confirmed they can sponsor.');
  await log('Joanna Price', 'Kestrel Systems', 'RECEIVED', 'EMAIL', 28, 'Not progressing: they went with someone with more Kubernetes experience. Open to future roles.');
  await log('Marcus Webb', 'Pebble Finance', 'SENT', 'LINKEDIN', 44, 'Asked if he could refer me for the Product Engineer role.');
  await log('Marcus Webb', 'Pebble Finance', 'RECEIVED', 'LINKEDIN', 43, 'Referral submitted. Said the team cares a lot about product thinking.');
  await log('Hannah Okafor', 'Quillstone Legal Technology', 'SENT', 'LINKEDIN', 34, 'Short note about my document-generation project after applying.');
  await log('Ryan McAllister', 'Juniper Grid Energy', 'RECEIVED', 'PHONE', 15, 'Client wants a first-stage call this week.');
  await log('Sofia Lindqvist', 'Meadowlark Learning', 'RECEIVED', 'EMAIL', 22, 'Asked for a short accessibility audit of their sign-up page as a screening step.');

  const interview = (company: string, type: 'PHONE_SCREEN' | 'TECHNICAL' | 'TAKE_HOME' | 'SYSTEM_DESIGN' | 'BEHAVIOURAL' | 'FINAL', at: Date, extra: Partial<Prisma.InterviewUncheckedCreateInput> = {}) =>
    tx.interview.create({
      data: {
        userId,
        applicationId: appIds.get(company)!,
        type,
        startsAt: type === 'TAKE_HOME' ? null : at,
        dueAt: type === 'TAKE_HOME' ? at : null,
        completedAt: at < now ? at : null,
        ...extra,
      },
    });
  await interview('Brightwave Software Ltd', 'PHONE_SCREEN', ago(46, 14), { durationMins: 30, interviewers: 'Tom Ashby', location: 'Phone', reflections: 'Friendly. Asked about visa status early; they sponsor. Salary band £42–50k.' });
  await interview('Brightwave Software Ltd', 'TECHNICAL', ago(40, 10), { durationMins: 90, interviewers: 'Priya Natarajan, Dev Shah', location: 'Video call', prepNotes: 'Revise React state management and Postgres indexing.', reflections: 'Pair-programmed a small API endpoint. Should have written the test first. Good feedback on code clarity.' });
  await interview('Brightwave Software Ltd', 'FINAL', ago(16, 13), { durationMins: 60, interviewers: 'CTO', location: 'Manchester office', reflections: 'Values and product questions. Asked good questions about their roadmap.' });
  await interview('Kestrel Systems', 'SYSTEM_DESIGN', ago(35, 11), { durationMins: 60, interviewers: 'Two senior engineers', location: 'Video call', reflections: 'Designed a rate limiter. Weak on Kubernetes autoscaling questions. Study this.' });
  await interview('Pebble Finance', 'TECHNICAL', ago(24, 10), { durationMins: 90, interviewers: 'Elena Kovač', location: 'Video call', reflections: 'Live coding went well. Asked how I would measure success of a feature.' });
  await interview('Pebble Finance', 'BEHAVIOURAL', new Date(now.getTime() + 2 * DAY + 3 * 3600_000), { durationMins: 45, interviewers: 'Head of Product', location: 'Video call (link in email)', prepNotes: 'Prepare two STAR stories: the PDF export rewrite, and the time I pushed back on a deadline. Questions to ask: how do product and engineering plan together?' });
  await interview('Quillstone Legal Technology', 'TAKE_HOME', new Date(now.getTime() + 4 * DAY), { location: 'Submit as a GitHub link to Hannah', prepNotes: 'Build a small contract clause search API. Keep it under 4 hours as they asked. Write a short README on trade-offs.' });
  await interview('Juniper Grid Energy', 'PHONE_SCREEN', ago(8, 15), { durationMins: 30, interviewers: 'Ryan McAllister', reflections: 'Recruiter screen. Second stage likely next week.' });
  await interview('Juniper Grid Energy', 'TECHNICAL', new Date(now.getTime() + 6 * DAY + 2 * 3600_000), { durationMins: 75, interviewers: 'Engineering team', location: 'Glasgow office or video', prepNotes: 'Time-series data in Postgres; read up on TimescaleDB basics.' });

  await tx.letterTemplate.create({
    data: {
      userId,
      name: 'Product teams',
      body: `Dear {hiringManager},

I'm applying for the {role} role at {company}. I've spent the last two years building full-stack features end to end, most recently a PDF export that cut support tickets by a third.

What draws me to {company} is the chance to work close to the people using the product.

I'd be glad to talk it through.

Best wishes,
{myName}`,
    },
  });

  const planner = new ReminderPlanner();
  for (const id of appIds.values()) await planner.planForApplication(tx, id);
  return { companyIds, appIds };
}
