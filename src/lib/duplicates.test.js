import { describe, it, expect } from 'vitest';
import { findContactDuplicates, duplicateReason } from './duplicates.js';
import { companyKey, findDuplicateGroups } from './companyName.js';

const c = (id, name, email = '', phone = '') => ({ id, name, email, phone });

describe('findContactDuplicates', () => {
  it('groups the same email under the same name', () => {
    const groups = findContactDuplicates([
      c('1', 'Greg Shore', 'greg@brightsunsolr.com'),
      c('2', 'Greg Shore', 'greg@brightsunsolr.com'),
      c('3', 'Adam Mayer', 'adam@elsewhere.com'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].map(x => x.id).sort()).toEqual(['1', '2']);
  });

  it('catches a name that differs only by punctuation or spacing', () => {
    const groups = findContactDuplicates([
      c('1', "Sean O'Brien", 'sean@a.com'),
      c('2', 'Sean OBrien',  'sobrien@b.com'),
    ]);
    expect(groups).toHaveLength(1);
  });

  it('catches the same person under two addresses via their phone', () => {
    const groups = findContactDuplicates([
      c('1', 'Greg Shore',  'greg@work.com',     '+1 (555) 010-9999'),
      c('2', 'Gregory S',   'greg@personal.com', '555.010.9999'),
    ]);
    expect(groups).toHaveLength(1);
  });

  it('REFUSES to group two different people who share an inbox', () => {
    // The failure this guard exists for: merging colleagues who both list the
    // team address destroys a real contact and is not recoverable.
    const groups = findContactDuplicates([
      c('1', 'Greg Shore', 'info@brightsunsolr.com'),
      c('2', 'Adam Mayer', 'info@brightsunsolr.com'),
    ]);
    expect(groups).toHaveLength(0);
  });

  it('still groups a shared address when one row has no name', () => {
    const groups = findContactDuplicates([
      c('1', 'Greg Shore', 'info@brightsunsolr.com'),
      c('2', '',           'info@brightsunsolr.com'),
    ]);
    expect(groups).toHaveLength(1);
  });

  it('ignores a phone too short to identify anyone', () => {
    const groups = findContactDuplicates([
      c('1', 'Greg Shore', 'greg@a.com', '911'),
      c('2', 'Adam Mayer', 'adam@b.com', '911'),
    ]);
    expect(groups).toHaveLength(0);
  });

  it('reports why a group was flagged', () => {
    const group = [
      c('1', 'Greg Shore', 'greg@a.com'),
      c('2', 'Greg Shore', 'greg@a.com'),
    ];
    expect(duplicateReason(group)).toContain('same email');
    expect(duplicateReason(group)).toContain('same name');
  });
});

describe('companyKey', () => {
  it('ignores case, punctuation and a trailing legal suffix', () => {
    expect(companyKey('BrightSunSolr')).toBe(companyKey('BrightSunSolr LLC'));
    expect(companyKey('Acme, Inc.')).toBe(companyKey('acme'));
  });

  it('strips a doubled suffix', () => {
    expect(companyKey('Acme Co Ltd')).toBe(companyKey('Acme'));
  });

  it('does NOT collapse two genuinely different companies', () => {
    // The whole point of being conservative: filing a contact under the wrong
    // counterparty is worse than leaving a duplicate row for the merge screen.
    expect(companyKey('Genesis Group')).not.toBe(companyKey('Genesis Capital'));
  });

  it('finds duplicate groups by that same key', () => {
    const groups = findDuplicateGroups([
      { id: '1', name: 'BrightSunSolr' },
      { id: '2', name: 'BrightSunSolr, LLC' },
      { id: '3', name: 'Genesis Capital' },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].map(g => g.id).sort()).toEqual(['1', '2']);
  });
});
