import { z } from 'zod';

/**
 * UK Skilled Worker salary check, guide only (PRD section 5). Rules come from data/uk-salary-rules.json,
 * versioned with effective dates and GOV.UK sources. The check never says "you will get a visa".
 */
export const salaryRulesSchema = z.object({
  name: z.string(),
  version: z.string(),
  checkedOn: z.string(),
  notes: z.string(),
  rules: z
    .array(
      z.object({
        effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        generalThresholdPence: z.number().int().positive(),
        newEntrantThresholdPence: z.number().int().positive(),
        sources: z.array(z.object({ label: z.string(), url: z.url() })).min(1),
      }),
    )
    .min(1),
});
export type SalaryRules = z.infer<typeof salaryRulesSchema>;
export type SalaryRule = SalaryRules['rules'][number];

/** The rule in force on a date (YYYY-MM-DD): the latest one whose effectiveFrom is on or before it. */
export function selectSalaryRule(rules: SalaryRules, onDate: string): SalaryRule | null {
  const sorted = [...rules.rules].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  let found: SalaryRule | null = null;
  for (const r of sorted) if (r.effectiveFrom <= onDate) found = r;
  return found;
}

export type SalaryVerdict = 'MEETS' | 'BELOW' | 'UNKNOWN';

export interface SalaryCheck {
  /** The salary compared: the bottom of the advertised range (the safest reading). */
  salaryPence: number | null;
  currency: string;
  general: { thresholdPence: number; verdict: SalaryVerdict };
  newEntrant: { thresholdPence: number; verdict: SalaryVerdict };
  /** Which threshold probably applies, from the user's work authorisation notes. */
  likely: 'GENERAL' | 'NEW_ENTRANT' | 'UNSURE';
  effectiveFrom: string;
  checkedOn: string;
  sources: { label: string; url: string }[];
  message: string;
}

const verdict = (salary: number | null, threshold: number): SalaryVerdict => (salary == null ? 'UNKNOWN' : salary >= threshold ? 'MEETS' : 'BELOW');
const pounds = (p: number) => `£${Math.round(p / 100).toLocaleString('en-GB')}`;

export function checkSalary(rules: SalaryRules, input: { salaryMinPence: number | null; salaryMaxPence: number | null; currency: string; onDate: string; workAuthNotes: string | null }): SalaryCheck | null {
  const rule = selectSalaryRule(rules, input.onDate);
  if (!rule) return null;
  const gbp = input.currency === 'GBP';
  const salary = gbp ? (input.salaryMinPence ?? input.salaryMaxPence) : null;
  const notes = (input.workAuthNotes ?? '').toLowerCase();
  const likely = /new entrant|graduate visa|student visa|under 26/.test(notes) ? 'NEW_ENTRANT' : notes.trim() ? 'GENERAL' : 'UNSURE';
  const general = verdict(salary, rule.generalThresholdPence);
  const newEntrant = verdict(salary, rule.newEntrantThresholdPence);
  let message: string;
  if (!gbp) message = 'The salary isn’t in pounds, so it can’t be compared with UK thresholds.';
  else if (salary == null) message = 'No salary is listed, so it can’t be checked. Ask the recruiter for the range.';
  else if (general === 'MEETS') message = `${pounds(salary)} meets the general threshold of ${pounds(rule.generalThresholdPence)} (guide only).`;
  else if (newEntrant === 'MEETS') message = `${pounds(salary)} is below the general threshold of ${pounds(rule.generalThresholdPence)} but meets the new-entrant threshold of ${pounds(rule.newEntrantThresholdPence)} (guide only).`;
  else message = `${pounds(salary)} is below both the general (${pounds(rule.generalThresholdPence)}) and new-entrant (${pounds(rule.newEntrantThresholdPence)}) thresholds (guide only).`;
  return {
    salaryPence: salary,
    currency: input.currency,
    general: { thresholdPence: rule.generalThresholdPence, verdict: general },
    newEntrant: { thresholdPence: rule.newEntrantThresholdPence, verdict: newEntrant },
    likely,
    effectiveFrom: rule.effectiveFrom,
    checkedOn: rules.checkedOn,
    sources: rule.sources,
    message,
  };
}
