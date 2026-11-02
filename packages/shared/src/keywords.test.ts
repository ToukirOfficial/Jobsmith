import { describe, expect, it } from 'vitest';
import { findSkills, matchKeywords } from './keywords.js';
import { checkSalary, selectSalaryRule, type SalaryRules } from './salary.js';

describe('keyword match', () => {
  it('finds skills by name and alias, without false matches on plain English', () => {
    const s = findSkills('We use Node.js, Postgres and React. You will go to the office twice a week. Experience with k8s and CI/CD. Rust belt? No. C# and .NET welcome.');
    expect([...s.keys()].sort()).toEqual(['.NET', 'C#', 'CI/CD', 'Kubernetes', 'Node.js', 'PostgreSQL', 'React'].sort());
    expect(s.has('Go')).toBe(false);
    expect(findSkills('We are a Golang shop').has('Go')).toBe(true);
  });

  it('weights must-haves over nice-to-haves and scores coverage', () => {
    const job = `About the role\nBuild things.\n\nWhat we're looking for\n- TypeScript and React\n- PostgreSQL\n\nNice to have\n- Kubernetes\n- GraphQL\n\nBenefits\n- Pension`;
    const m = matchKeywords(job, 'I build with TypeScript, React and Kubernetes.');
    const by = Object.fromEntries(m.keywords.map((k) => [k.term, k]));
    expect(by['TypeScript']).toMatchObject({ importance: 'MUST', covered: true });
    expect(by['PostgreSQL']).toMatchObject({ importance: 'MUST', covered: false });
    expect(by['GraphQL']).toMatchObject({ importance: 'NICE', covered: false });
    // Must = 3 each (TS, React, Postgres), nice = 1 each (K8s, GraphQL): covered 3+3+1 of 11.
    expect(m.score).toBe(Math.round((7 / 11) * 100));
    expect(m.total).toBe(5);
  });
});

const RULES: SalaryRules = {
  name: 'test',
  version: '2',
  checkedOn: '2026-11-02',
  notes: '',
  rules: [
    { effectiveFrom: '2025-07-22', generalThresholdPence: 4170000, newEntrantThresholdPence: 3340000, sources: [{ label: 'GOV.UK', url: 'https://www.gov.uk/skilled-worker-visa/your-job' }] },
    { effectiveFrom: '2024-04-04', generalThresholdPence: 3870000, newEntrantThresholdPence: 3096000, sources: [{ label: 'GOV.UK', url: 'https://www.gov.uk/x' }] },
  ],
};

describe('salary rule selection by date', () => {
  it('picks the rule in force on the date, including the first day', () => {
    expect(selectSalaryRule(RULES, '2024-04-03')).toBeNull();
    expect(selectSalaryRule(RULES, '2024-04-04')?.generalThresholdPence).toBe(3870000);
    expect(selectSalaryRule(RULES, '2025-07-21')?.generalThresholdPence).toBe(3870000);
    expect(selectSalaryRule(RULES, '2025-07-22')?.generalThresholdPence).toBe(4170000);
    expect(selectSalaryRule(RULES, '2026-11-02')?.newEntrantThresholdPence).toBe(3340000);
  });

  it('compares the bottom of the range and says which threshold is likely, guide only', () => {
    const c = checkSalary(RULES, { salaryMinPence: 3500000, salaryMaxPence: 4500000, currency: 'GBP', onDate: '2026-11-02', workAuthNotes: 'Graduate visa, new entrant' })!;
    expect(c.general.verdict).toBe('BELOW');
    expect(c.newEntrant.verdict).toBe('MEETS');
    expect(c.likely).toBe('NEW_ENTRANT');
    expect(c.message).toContain('guide only');
    expect(c.sources[0]!.url).toMatch(/^https:\/\/www\.gov\.uk\//);
    expect(checkSalary(RULES, { salaryMinPence: null, salaryMaxPence: null, currency: 'GBP', onDate: '2026-11-02', workAuthNotes: null })!.general.verdict).toBe('UNKNOWN');
    expect(checkSalary(RULES, { salaryMinPence: 9000000, salaryMaxPence: null, currency: 'EUR', onDate: '2026-11-02', workAuthNotes: null })!.general.verdict).toBe('UNKNOWN');
  });
});
