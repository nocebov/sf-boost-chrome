import { describe, it, expect } from 'vitest';
import {
  MODULE_CATALOG,
  DEFAULT_ENABLED_MODULE_IDS,
  DISABLED_BY_DEFAULT_MODULE_IDS,
} from '../modules/catalog';

describe('MODULE_CATALOG', () => {
  it('has 11 modules', () => {
    expect(MODULE_CATALOG).toHaveLength(11);
  });

  it('all modules have unique IDs', () => {
    const ids = MODULE_CATALOG.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all modules have required fields', () => {
    for (const mod of MODULE_CATALOG) {
      expect(mod.id).toBeTruthy();
      expect(mod.name).toBeTruthy();
      expect(mod.description).toBeTruthy();
      expect(mod.info).toBeTruthy();
      expect(typeof mod.defaultEnabled).toBe('boolean');
      expect(['ui-only', 'read-only', 'write-capable']).toContain(mod.accessLevel);
    }
  });

  it('IDs use kebab-case format', () => {
    for (const mod of MODULE_CATALOG) {
      expect(mod.id).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  describe('known modules exist', () => {
    const expectedModules = [
      'command-palette',
      'field-inspector',
      'quick-copy',
      'table-filter',
      'environment-safeguard',
      'deep-dependency-inspector',
      'change-set-buddy',
      'profile-to-permset',
      'bulk-check',
      'hide-devops-bar',
      'console-formatter',
    ];

    for (const id of expectedModules) {
      it(`module "${id}" exists in catalog`, () => {
        expect(MODULE_CATALOG.find(m => m.id === id)).toBeDefined();
      });
    }
  });

  it('table-filter exposes the new granular settings', () => {
    expect(MODULE_CATALOG.find((module) => module.id === 'table-filter')?.settings).toEqual([
      { key: 'showOnSetupPages', label: 'Show on Setup pages', type: 'boolean', default: true },
      { key: 'showOnListViews', label: 'Show on list views', type: 'boolean', default: true },
      { key: 'autoLoadLazyRows', label: 'Load all rows when filtering', type: 'boolean', default: true },
      { key: 'autoExpandClassicPagination', label: 'Auto-expand Classic pagination', type: 'boolean', default: true },
    ]);
  });

  it('field-inspector exposes record-only settings', () => {
    expect(MODULE_CATALOG.find((module) => module.id === 'field-inspector')?.settings).toEqual([
      { key: 'showOnRecords', label: 'Show on record pages', type: 'boolean', default: true },
      { key: 'showFieldUsage', label: 'Show field usage % in popover', type: 'boolean', default: true },
    ]);
  });

  describe('access levels', () => {
    it('command-palette is write-capable', () => {
      expect(MODULE_CATALOG.find(m => m.id === 'command-palette')?.accessLevel)
        .toBe('write-capable');
    });

    it('command-palette exposes its default shortcut hint', () => {
      expect(MODULE_CATALOG.find((module) => module.id === 'command-palette')?.shortcutHint)
        .toEqual({
          label: 'Default shortcut',
          defaultKeys: 'Alt+Shift+S',
          note: 'Change it in Settings.',
        });
    });

    it('field-inspector is read-only', () => {
      expect(MODULE_CATALOG.find(m => m.id === 'field-inspector')?.accessLevel)
        .toBe('read-only');
    });

    it('quick-copy is ui-only', () => {
      expect(MODULE_CATALOG.find(m => m.id === 'quick-copy')?.accessLevel)
        .toBe('ui-only');
    });

    it('profile-to-permset is write-capable', () => {
      expect(MODULE_CATALOG.find(m => m.id === 'profile-to-permset')?.accessLevel)
        .toBe('write-capable');
    });
  });
});

describe('DEFAULT_ENABLED_MODULE_IDS', () => {
  it('contains 5 enabled-by-default modules', () => {
    expect(DEFAULT_ENABLED_MODULE_IDS).toHaveLength(5);
  });

  it('includes command-palette', () => {
    expect(DEFAULT_ENABLED_MODULE_IDS).toContain('command-palette');
  });

  it('includes field-inspector', () => {
    expect(DEFAULT_ENABLED_MODULE_IDS).toContain('field-inspector');
  });

  it('includes quick-copy', () => {
    expect(DEFAULT_ENABLED_MODULE_IDS).toContain('quick-copy');
  });

  it('includes table-filter', () => {
    expect(DEFAULT_ENABLED_MODULE_IDS).toContain('table-filter');
  });

  it('includes environment-safeguard', () => {
    expect(DEFAULT_ENABLED_MODULE_IDS).toContain('environment-safeguard');
  });

  it('does NOT include disabled-by-default modules', () => {
    expect(DEFAULT_ENABLED_MODULE_IDS).not.toContain('deep-dependency-inspector');
    expect(DEFAULT_ENABLED_MODULE_IDS).not.toContain('hide-devops-bar');
    expect(DEFAULT_ENABLED_MODULE_IDS).not.toContain('profile-to-permset');
    expect(DEFAULT_ENABLED_MODULE_IDS).not.toContain('change-set-buddy');
  });
});

describe('DISABLED_BY_DEFAULT_MODULE_IDS', () => {
  it('contains 6 disabled-by-default modules', () => {
    expect(DISABLED_BY_DEFAULT_MODULE_IDS).toHaveLength(6);
  });

  it('includes deep-dependency-inspector', () => {
    expect(DISABLED_BY_DEFAULT_MODULE_IDS).toContain('deep-dependency-inspector');
  });

  it('includes hide-devops-bar', () => {
    expect(DISABLED_BY_DEFAULT_MODULE_IDS).toContain('hide-devops-bar');
  });

  it('includes profile-to-permset', () => {
    expect(DISABLED_BY_DEFAULT_MODULE_IDS).toContain('profile-to-permset');
  });

  it('includes change-set-buddy', () => {
    expect(DISABLED_BY_DEFAULT_MODULE_IDS).toContain('change-set-buddy');
  });

  it('includes bulk-check', () => {
    expect(DISABLED_BY_DEFAULT_MODULE_IDS).toContain('bulk-check');
  });

  it('includes console-formatter', () => {
    expect(DISABLED_BY_DEFAULT_MODULE_IDS).toContain('console-formatter');
  });

  it('does NOT overlap with DEFAULT_ENABLED_MODULE_IDS', () => {
    for (const id of DISABLED_BY_DEFAULT_MODULE_IDS) {
      expect(DEFAULT_ENABLED_MODULE_IDS).not.toContain(id);
    }
  });

  it('together with DEFAULT_ENABLED_MODULE_IDS covers all catalog modules', () => {
    const allIds = [...DEFAULT_ENABLED_MODULE_IDS, ...DISABLED_BY_DEFAULT_MODULE_IDS];
    const catalogIds = MODULE_CATALOG.map(m => m.id);
    expect(allIds.sort()).toEqual(catalogIds.sort());
  });
});
