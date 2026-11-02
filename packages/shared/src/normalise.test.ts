import { describe, expect, it } from 'vitest';
import { normaliseCompany, normaliseTitle } from './normalise.js';

describe('company name normalisation', () => {
  it('matches the same company written different ways', () => {
    const forms = ['Acme Ltd', 'ACME LIMITED', 'Acme Limited.', 'acme', 'The Acme Ltd', 'Acme (UK) Limited', 'Acme UK Ltd'];
    for (const f of forms) expect(normaliseCompany(f), f).toBe('acme');
  });

  it('folds ampersands, accents and punctuation', () => {
    expect(normaliseCompany('Smith & Jones LLP')).toBe(normaliseCompany('SMITH AND JONES'));
    expect(normaliseCompany('Café Nero Holdings plc')).toBe('cafe nero');
    expect(normaliseCompany("O'Reilly Media Inc.")).toBe('oreilly media');
  });

  it('never empties a name made only of suffix words', () => {
    expect(normaliseCompany('Group Ltd')).toBe('group');
    expect(normaliseCompany('The Company')).toBe('company');
  });

  it('keeps different companies apart', () => {
    expect(normaliseCompany('Acme Data Ltd')).not.toBe(normaliseCompany('Acme Ltd'));
    expect(normaliseCompany('Monzo Bank Limited')).toBe('monzo bank');
  });

  it('normalises job titles', () => {
    expect(normaliseTitle('Senior Engineer (Backend)')).toBe('senior engineer backend');
    expect(normaliseTitle('C# / .NET Developer')).toBe('c# net developer');
  });
});
