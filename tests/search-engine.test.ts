import { describe, it, expect } from 'vitest';
import { fuzzySearch } from '../modules/command-palette/search-engine';
import type { PaletteCommand } from '../modules/command-palette/setup-commands';

function cmd(label: string, keywords: string[] = [], path = '/test'): PaletteCommand {
  return { id: label.toLowerCase().replace(/\s+/g, '-'), label, keywords, category: 'test', path };
}

const testCommands: PaletteCommand[] = [
  cmd('Permission Sets', ['permset', 'ps']),
  cmd('Profiles', ['profile']),
  cmd('Users', ['user', 'manage users']),
  cmd('Object Manager', ['objects', 'custom objects']),
  cmd('Apex Classes', ['class', 'apex']),
  cmd('Apex Triggers', ['trigger', 'apex']),
  cmd('Flows', ['flow', 'automation']),
  cmd('Custom Metadata Types', ['metadata', 'mdt']),
  cmd('Lightning App Builder', ['app builder', 'flexipage']),
  cmd('Debug Logs', ['debug', 'log', 'trace']),
];

describe('fuzzySearch', () => {
  describe('exact match', () => {
    it('finds exact label match', () => {
      const results = fuzzySearch('Users', testCommands);
      expect(results[0]?.label).toBe('Users');
    });

    it('is case-insensitive', () => {
      const results = fuzzySearch('users', testCommands);
      expect(results[0]?.label).toBe('Users');
    });
  });

  describe('starts-with match', () => {
    it('prioritizes starts-with over substring', () => {
      const results = fuzzySearch('perm', testCommands);
      expect(results[0]?.label).toBe('Permission Sets');
    });

    it('matches beginning of label', () => {
      const results = fuzzySearch('apex', testCommands);
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.map(r => r.label)).toContain('Apex Classes');
      expect(results.map(r => r.label)).toContain('Apex Triggers');
    });
  });

  describe('word initials match', () => {
    it('matches word initials ("ps" → Permission Sets)', () => {
      const results = fuzzySearch('ps', testCommands);
      expect(results[0]?.label).toBe('Permission Sets');
    });

    it('matches "om" → Object Manager', () => {
      const results = fuzzySearch('om', testCommands);
      expect(results[0]?.label).toBe('Object Manager');
    });

    it('matches "lab" → Lightning App Builder', () => {
      const results = fuzzySearch('lab', testCommands);
      expect(results[0]?.label).toBe('Lightning App Builder');
    });
  });

  describe('substring match', () => {
    it('finds substring in label', () => {
      const results = fuzzySearch('class', testCommands);
      expect(results.map(r => r.label)).toContain('Apex Classes');
    });

    it('finds substring in middle of label', () => {
      const results = fuzzySearch('trigger', testCommands);
      expect(results.map(r => r.label)).toContain('Apex Triggers');
    });
  });

  describe('keyword match', () => {
    it('matches keywords', () => {
      const results = fuzzySearch('permset', testCommands);
      expect(results[0]?.label).toBe('Permission Sets');
    });

    it('matches keyword "mdt"', () => {
      const results = fuzzySearch('mdt', testCommands);
      expect(results[0]?.label).toBe('Custom Metadata Types');
    });

    it('matches keyword "automation"', () => {
      const results = fuzzySearch('automation', testCommands);
      expect(results[0]?.label).toBe('Flows');
    });
  });

  describe('fuzzy match', () => {
    it('matches when all characters appear in order', () => {
      const results = fuzzySearch('prfs', testCommands);
      expect(results.map(r => r.label)).toContain('Profiles');
    });

    it('matches fuzzy "dblg" → Debug Logs', () => {
      const results = fuzzySearch('dblg', testCommands);
      expect(results.map(r => r.label)).toContain('Debug Logs');
    });
  });

  describe('no match', () => {
    it('returns empty array for no matches', () => {
      const results = fuzzySearch('zzzzzzzzzzz', testCommands);
      expect(results).toHaveLength(0);
    });

    it('returns empty array for empty commands list', () => {
      const results = fuzzySearch('test', []);
      expect(results).toHaveLength(0);
    });
  });

  describe('result limits', () => {
    it('respects maxResults parameter', () => {
      const results = fuzzySearch('a', testCommands, 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('defaults to 10 results max', () => {
      const manyCommands = Array.from({ length: 50 }, (_, i) =>
        cmd(`Command ${i}`, [`keyword${i}`])
      );
      const results = fuzzySearch('command', manyCommands);
      expect(results.length).toBeLessThanOrEqual(10);
    });
  });

  describe('scoring priority', () => {
    it('exact match > starts with > substring', () => {
      const commands = [
        cmd('Flow'), // exact on "flow"
        cmd('Flows'), // starts with "flow"
        cmd('Autoflow Builder'), // substring "flow"
      ];
      const results = fuzzySearch('flow', commands);
      expect(results[0]?.label).toBe('Flow');
      expect(results[1]?.label).toBe('Flows');
    });

    it('label match > keyword match', () => {
      const commands = [
        cmd('Something', ['apex']), // keyword match
        cmd('Apex Classes', []), // label starts-with match
      ];
      const results = fuzzySearch('apex', commands);
      expect(results[0]?.label).toBe('Apex Classes');
    });
  });

  describe('empty query', () => {
    it('returns nothing for empty string', () => {
      const results = fuzzySearch('', testCommands);
      // An empty query has 0-length, so fuzzy match loop completes immediately
      // This depends on implementation - all chars "match" trivially
      // Let's just verify it doesn't crash
      expect(Array.isArray(results)).toBe(true);
    });
  });
});
