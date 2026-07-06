// Smoke tests for the matching logic every company-scoped view depends on.
// Run: npm test
import { describe, it, expect } from 'vitest';
import {
  companyNameMatchesSlug, dealCategoryMatchesSlug, COMPANIES, COMPANY_META, TAB_ACCESS,
} from './roles.js';

describe('companyNameMatchesSlug', () => {
  it('matches short slugs exactly (ovm must never match ovmg)', () => {
    expect(companyNameMatchesSlug('ovm', 'ovm')).toBe(true);
    expect(companyNameMatchesSlug('ovmg', 'ovm')).toBe(false);
    expect(companyNameMatchesSlug('OVMG', 'ovmg')).toBe(true);
  });
  it('matches long tokens as substrings', () => {
    expect(companyNameMatchesSlug('OneVibeMediaGroup LLC', 'ovmg')).toBe(true);
    expect(companyNameMatchesSlug('Carbon Sponge Inc', 'carbonsponge')).toBe(true);
  });
  it('no slug → everything matches; no name → nothing matches', () => {
    expect(companyNameMatchesSlug('anything', null)).toBe(true);
    expect(companyNameMatchesSlug('', 'ovm')).toBe(false);
  });
});

describe('dealCategoryMatchesSlug', () => {
  it('matches canonical entity values case/space-insensitively', () => {
    expect(dealCategoryMatchesSlug(['OVMG'], 'ovmg')).toBe(true);
    expect(dealCategoryMatchesSlug(['carbon sponge'], 'carbonsponge')).toBe(true);
    expect(dealCategoryMatchesSlug(['AMPLIFYARTISTS'], 'amplify')).toBe(true);
  });
  it('does not cross-match companies', () => {
    expect(dealCategoryMatchesSlug(['OVM'], 'ovmg')).toBe(false);
    expect(dealCategoryMatchesSlug(['OVMG'], 'ovm')).toBe(false);
  });
  it('falls back to legacy company-name matching', () => {
    expect(dealCategoryMatchesSlug([], 'ovmg', ['OneVibeMediaGroup'])).toBe(true);
  });
});

describe('config integrity', () => {
  it('every company slug has metadata and a company tab access entry', () => {
    for (const slug of COMPANIES) {
      expect(COMPANY_META[slug], `COMPANY_META missing ${slug}`).toBeTruthy();
      expect(TAB_ACCESS[`company:${slug}`], `TAB_ACCESS missing company:${slug}`).toBeTruthy();
    }
  });
  it('admin can access every tab', () => {
    for (const [tab, roles] of Object.entries(TAB_ACCESS)) {
      expect(roles.includes('admin'), `admin missing from ${tab}`).toBe(true);
    }
  });
});
