/**
 * Deterministic keyword match (FEATURES section 6): a skills dictionary is matched against the job text and
 * the CV version text. No AI. Ambiguous words that are also normal English ("go", "r", "c", "swift" on its
 * own, "rust" on its own) are only matched in unambiguous forms.
 */
const SKILLS: [string, ...string[]][] = [
  // Languages
  ['TypeScript', 'ts'],
  ['JavaScript', 'js', 'ecmascript', 'es6'],
  ['Python'],
  ['Java'],
  ['Kotlin'],
  ['C#', 'c sharp', 'csharp'],
  ['C++', 'cpp'],
  ['Go', 'golang', 'go developer', 'go engineer'],
  ['Rust', 'rust lang', 'rustlang'],
  ['Ruby'],
  ['PHP'],
  ['Swift', 'swiftui', 'swift developer', 'ios swift'],
  ['Scala'],
  ['Elixir'],
  ['SQL'],
  ['HTML', 'html5'],
  ['CSS', 'css3'],
  ['Bash', 'shell scripting'],
  // Front end
  ['React', 'react.js', 'reactjs'],
  ['Next.js', 'nextjs', 'next js'],
  ['Vue', 'vue.js', 'vuejs'],
  ['Nuxt'],
  ['Angular'],
  ['Svelte', 'sveltekit'],
  ['Redux'],
  ['Tailwind', 'tailwind css', 'tailwindcss'],
  ['Sass', 'scss'],
  ['Storybook'],
  ['Design systems', 'design system'],
  ['Accessibility', 'wcag', 'a11y'],
  ['Web performance', 'core web vitals', 'lighthouse'],
  ['React Native'],
  ['Flutter'],
  // Back end
  ['Node.js', 'node', 'nodejs', 'node js'],
  ['Express', 'express.js', 'expressjs'],
  ['NestJS', 'nest.js', 'nestjs'],
  ['Django'],
  ['Flask'],
  ['FastAPI'],
  ['Spring', 'spring boot'],
  ['.NET', 'dotnet', 'asp.net', '.net core'],
  ['Ruby on Rails', 'rails'],
  ['Laravel'],
  ['GraphQL'],
  ['REST APIs', 'rest api', 'restful', 'rest'],
  ['gRPC'],
  ['WebSockets', 'websocket', 'socket.io'],
  ['Microservices', 'microservice'],
  ['Event-driven architecture', 'event-driven', 'event driven'],
  ['Message queues', 'message queue', 'rabbitmq', 'bullmq', 'sqs'],
  ['Kafka', 'apache kafka'],
  // Data
  ['PostgreSQL', 'postgres', 'postgresql', 'psql'],
  ['MySQL', 'mariadb'],
  ['SQL Server', 'mssql', 't-sql'],
  ['MongoDB', 'mongo'],
  ['Redis'],
  ['Elasticsearch', 'elastic search', 'opensearch'],
  ['DynamoDB'],
  ['Prisma'],
  ['Data modelling', 'data modeling', 'data model'],
  ['dbt'],
  ['Airflow', 'apache airflow'],
  ['Spark', 'apache spark', 'pyspark'],
  ['Pandas'],
  ['Machine learning', 'ml', 'machine-learning'],
  ['LLMs', 'llm', 'large language models', 'generative ai', 'genai'],
  ['Data visualisation', 'data visualization', 'd3', 'd3.js'],
  ['Time-series data', 'time series', 'timeseries', 'timescaledb'],
  // Cloud and ops
  ['AWS', 'amazon web services'],
  ['GCP', 'google cloud', 'google cloud platform'],
  ['Azure', 'microsoft azure'],
  ['Docker', 'containers', 'containerisation', 'containerization'],
  ['Kubernetes', 'k8s'],
  ['Terraform', 'infrastructure as code', 'iac'],
  ['CI/CD', 'ci cd', 'continuous integration', 'continuous delivery', 'continuous deployment', 'github actions', 'gitlab ci'],
  ['Linux'],
  ['Serverless', 'aws lambda', 'lambda functions'],
  ['Observability', 'monitoring', 'logging', 'opentelemetry', 'grafana', 'datadog', 'prometheus'],
  ['Security', 'owasp', 'secure coding', 'security-minded'],
  ['Authentication', 'oauth', 'oauth2', 'openid connect', 'oidc', 'sso'],
  ['Git', 'github', 'gitlab', 'version control'],
  // Practices
  ['Automated testing', 'unit testing', 'unit tests', 'integration tests', 'test automation', 'automated tests', 'writing automated tests', 'tdd', 'test-driven'],
  ['Jest'],
  ['Vitest'],
  ['Playwright'],
  ['Cypress'],
  ['Testing Library', 'react testing library'],
  ['Code review', 'code reviews', 'reviewing code'],
  ['Agile', 'scrum', 'kanban'],
  ['System design', 'systems design', 'software architecture'],
  ['Performance optimisation', 'performance optimization', 'performance tuning'],
  ['API design'],
  ['Mentoring', 'mentor', 'mentorship'],
  ['Product thinking', 'product sense', 'product-minded', 'product minded'],
  ['Stakeholder management', 'stakeholders'],
  ['Figma'],
  ['PDF generation', 'pdf', 'document generation'],
  ['Payments', 'stripe', 'open banking'],
  ['Healthcare data', 'fhir', 'hl7', 'nhs'],
  ['Full-stack', 'full stack', 'fullstack'],
];

export interface KeywordResult {
  term: string;
  importance: 'MUST' | 'NICE' | 'MENTIONED';
  covered: boolean;
}

export interface KeywordMatch {
  score: number;
  covered: number;
  total: number;
  keywords: KeywordResult[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const AMBIGUOUS = new Set(['go', 'rust', 'swift', 'node', 'rest', 'spring', 'express', 'rails', 'monitoring', 'logging', 'mentor', 'pdf', 'containers', 'stakeholders', 'ml', 'ts', 'js']);

/** Matchers per skill. Short ambiguous aliases only count when written in their technical casing. */
const MATCHERS = SKILLS.map(([name, ...aliases]) => {
  const forms = [name, ...aliases];
  const ci: RegExp[] = [];
  const cs: RegExp[] = [];
  for (const f of forms) {
    const re = `(?<![A-Za-z0-9+#.])${escape(f)}(?![A-Za-z0-9+#]|\\.[A-Za-z0-9])`;
    if (AMBIGUOUS.has(f.toLowerCase()) || f.length <= 2) {
      // e.g. "Go", "Rust", "Node", "TS": case-sensitive, so "go to the office" never counts.
      const cased = f === f.toLowerCase() ? f.toUpperCase() : f;
      if (f.toLowerCase() !== 'go' && f.toLowerCase() !== 'rust' && f.toLowerCase() !== 'swift') cs.push(new RegExp(`(?<![A-Za-z0-9+#.])${escape(cased)}(?![A-Za-z0-9+#])`, 'g'));
      if (f.toLowerCase() === 'node' || f.toLowerCase() === 'rest' || f.toLowerCase() === 'spring' || f.toLowerCase() === 'express') cs.push(new RegExp(`(?<![A-Za-z0-9])${escape(name === 'REST APIs' ? 'REST' : f[0]!.toUpperCase() + f.slice(1))}(?![A-Za-z0-9])`, 'g'));
    } else ci.push(new RegExp(re, 'gi'));
  }
  return { name, ci, cs };
});

function count(text: string, m: (typeof MATCHERS)[number]): number {
  let n = 0;
  for (const r of m.ci) n += text.match(r)?.length ?? 0;
  for (const r of m.cs) n += text.match(r)?.length ?? 0;
  return n;
}

/** Skills found in a text, with how often they appear. */
export function findSkills(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of MATCHERS) {
    const n = count(text, m);
    if (n) out.set(m.name, n);
  }
  return out;
}

const MUST_HEAD = /(requirements|what you('|’)ll need|what we('|’)re looking for|you (will )?have|must have|essential|about you|skills and experience|you bring|qualifications)/i;
const NICE_HEAD = /(nice to have|desirable|bonus|preferred|good to have|plus points|it would be great if|nice-to-have)/i;
const OTHER_HEAD = /(benefits|what we offer|perks|about us|the company|how to apply|salary|location)/i;

/** Splits a job description into must-have, nice-to-have and other text by its headings. */
export function jobSections(text: string): { must: string; nice: string; other: string } {
  const parts = { must: '', nice: '', other: '' };
  let current: keyof typeof parts = 'other';
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const isHeading = trimmed.length > 0 && trimmed.length < 70 && !/^[-•*]/.test(trimmed);
    if (isHeading && NICE_HEAD.test(trimmed)) current = 'nice';
    else if (isHeading && MUST_HEAD.test(trimmed)) current = 'must';
    else if (isHeading && OTHER_HEAD.test(trimmed)) current = 'other';
    parts[current] += `${line}\n`;
  }
  return parts;
}

const WEIGHT = { MUST: 3, MENTIONED: 2, NICE: 1 } as const;

/** Which of the job's skills the CV covers, and a weighted score out of 100. */
export function matchKeywords(jobText: string, cvText: string): KeywordMatch {
  const sections = jobSections(jobText);
  const must = findSkills(sections.must);
  const nice = findSkills(sections.nice);
  const all = findSkills(jobText);
  const cv = findSkills(cvText);
  const keywords: KeywordResult[] = [...all.entries()]
    .map(([term, n]) => ({
      term,
      importance: must.has(term) ? ('MUST' as const) : nice.has(term) && !must.has(term) ? ('NICE' as const) : n >= 2 ? ('MUST' as const) : ('MENTIONED' as const),
      covered: cv.has(term),
    }))
    .sort((a, b) => WEIGHT[b.importance] - WEIGHT[a.importance] || Number(a.covered) - Number(b.covered) || a.term.localeCompare(b.term));
  const total = keywords.reduce((s, k) => s + WEIGHT[k.importance], 0);
  const got = keywords.reduce((s, k) => s + (k.covered ? WEIGHT[k.importance] : 0), 0);
  return { score: total ? Math.round((got / total) * 100) : 0, covered: keywords.filter((k) => k.covered).length, total: keywords.length, keywords };
}
