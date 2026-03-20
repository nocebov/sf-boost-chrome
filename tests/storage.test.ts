import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Storage tests use a mock of chrome.storage API.
 * We test the normalization and cache eviction logic.
 */

// Mock chrome.storage
const syncStore: Record<string, any> = {};
const localStore: Record<string, any> = {};

const mockChromeStorage = {
  sync: {
    get: vi.fn((keys: string | string[]) => {
      const result: Record<string, any> = {};
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const key of keyList) {
        if (key in syncStore) result[key] = syncStore[key];
      }
      return Promise.resolve(result);
    }),
    set: vi.fn((items: Record<string, any>) => {
      Object.assign(syncStore, items);
      return Promise.resolve();
    }),
    remove: vi.fn((keys: string | string[]) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const key of keyList) delete syncStore[key];
      return Promise.resolve();
    }),
  },
  local: {
    get: vi.fn((keys: string | string[]) => {
      const result: Record<string, any> = {};
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const key of keyList) {
        if (key in localStore) result[key] = localStore[key];
      }
      return Promise.resolve(result);
    }),
    set: vi.fn((items: Record<string, any>) => {
      Object.assign(localStore, items);
      return Promise.resolve();
    }),
  },
};

// Set up global chrome mock before importing the module
(globalThis as any).chrome = { storage: mockChromeStorage };

// Now import after mocking
import {
  getEnabledModules,
  setEnabledModules,
  getOrgSettings,
  setOrgSettings,
  getQuickActionConfig,
  setQuickActionConfig,
  resetQuickActionConfig,
  getCachedDescribe,
  setCachedDescribe,
  DEFAULTS,
} from '../lib/storage';

describe('storage', () => {
  beforeEach(() => {
    // Clear stores
    for (const key of Object.keys(syncStore)) delete syncStore[key];
    for (const key of Object.keys(localStore)) delete localStore[key];
    vi.clearAllMocks();
  });

  // ─── getEnabledModules ──────────────────────────────────────────────────

  describe('getEnabledModules', () => {
    it('returns defaults when storage is empty', async () => {
      const result = await getEnabledModules();
      expect(result).toEqual(DEFAULTS.enabledModules);
    });

    it('returns stored enabled modules', async () => {
      syncStore.enabledModules = ['command-palette', 'quick-copy'];
      const result = await getEnabledModules();
      expect(result).toEqual(['command-palette', 'quick-copy']);
    });

    it('filters out unknown module IDs', async () => {
      syncStore.enabledModules = ['command-palette', 'nonexistent-module', 'quick-copy'];
      const result = await getEnabledModules();
      expect(result).toEqual(['command-palette', 'quick-copy']);
      expect(result).not.toContain('nonexistent-module');
    });

    it('removes duplicate IDs', async () => {
      syncStore.enabledModules = ['command-palette', 'command-palette', 'quick-copy'];
      const result = await getEnabledModules();
      expect(result).toEqual(['command-palette', 'quick-copy']);
    });

    it('returns defaults for non-array value', async () => {
      syncStore.enabledModules = 'not-an-array';
      const result = await getEnabledModules();
      expect(result).toEqual(DEFAULTS.enabledModules);
    });

    it('returns defaults for null', async () => {
      syncStore.enabledModules = null;
      const result = await getEnabledModules();
      expect(result).toEqual(DEFAULTS.enabledModules);
    });

    it('filters out non-string values in array', async () => {
      syncStore.enabledModules = ['command-palette', 123, null, 'quick-copy'];
      const result = await getEnabledModules();
      expect(result).toEqual(['command-palette', 'quick-copy']);
    });

    it('returns defaults when all IDs are invalid', async () => {
      syncStore.enabledModules = ['fake1', 'fake2'];
      const result = await getEnabledModules();
      expect(result).toEqual(DEFAULTS.enabledModules);
    });
  });

  // ─── setEnabledModules ──────────────────────────────────────────────────

  describe('setEnabledModules', () => {
    it('saves valid module IDs to storage', async () => {
      await setEnabledModules(['command-palette', 'field-inspector']);
      expect(syncStore.enabledModules).toEqual(['command-palette', 'field-inspector']);
    });

    it('normalizes before saving (filters unknown)', async () => {
      await setEnabledModules(['command-palette', 'unknown-id']);
      expect(syncStore.enabledModules).toEqual(['command-palette']);
    });

    it('saves defaults when all invalid', async () => {
      await setEnabledModules(['fake1', 'fake2']);
      expect(syncStore.enabledModules).toEqual(DEFAULTS.enabledModules);
    });
  });

  // ─── getOrgSettings / setOrgSettings ────────────────────────────────────

  describe('org settings', () => {
    it('returns empty object for unknown domain', async () => {
      const result = await getOrgSettings('acme.my.salesforce.com');
      expect(result).toEqual({});
    });

    it('saves and retrieves org settings', async () => {
      await setOrgSettings('acme.my.salesforce.com', {
        badgeEnabled: true,
        badgeColor: '#ff0000',
        badgeLabel: 'PROD',
      });

      const result = await getOrgSettings('acme.my.salesforce.com');
      expect(result.badgeEnabled).toBe(true);
      expect(result.badgeColor).toBe('#ff0000');
      expect(result.badgeLabel).toBe('PROD');
    });

    it('merges settings (does not overwrite existing keys)', async () => {
      await setOrgSettings('acme.my.salesforce.com', { badgeEnabled: true });
      await setOrgSettings('acme.my.salesforce.com', { badgeLabel: 'PROD' });

      const result = await getOrgSettings('acme.my.salesforce.com');
      expect(result.badgeEnabled).toBe(true);
      expect(result.badgeLabel).toBe('PROD');
    });

    it('stores settings independently per domain', async () => {
      await setOrgSettings('acme.my.salesforce.com', { badgeLabel: 'PROD' });
      await setOrgSettings('dev.my.salesforce.com', { badgeLabel: 'DEV' });

      expect((await getOrgSettings('acme.my.salesforce.com')).badgeLabel).toBe('PROD');
      expect((await getOrgSettings('dev.my.salesforce.com')).badgeLabel).toBe('DEV');
    });
  });

  // ─── Quick Action Config ────────────────────────────────────────────────

  describe('quick action config', () => {
    it('returns default empty config when not set', async () => {
      const config = await getQuickActionConfig();
      expect(config).toEqual({ hiddenBuiltInIds: [], customActions: [] });
    });

    it('normalizes malformed stored config instead of throwing', async () => {
      syncStore.commandPaletteQuickActions = {
        hiddenBuiltInIds: ['profile', 123, 'profile', null],
        customActions: [
          { id: 'custom1', label: 'My Link', url: '/test' },
          { id: 'broken-no-url', label: 'Broken' },
          'invalid-entry',
        ],
      };

      const config = await getQuickActionConfig();
      expect(config).toEqual({
        hiddenBuiltInIds: ['profile'],
        customActions: [{ id: 'custom1', label: 'My Link', url: '/test', icon: undefined }],
      });
    });

    it('saves and retrieves config', async () => {
      const config = {
        hiddenBuiltInIds: ['debug-log'],
        customActions: [{ id: 'custom1', label: 'My Link', url: '/test' }],
      };
      await setQuickActionConfig(config);

      const result = await getQuickActionConfig();
      expect(result.hiddenBuiltInIds).toEqual(['debug-log']);
      expect(result.customActions).toHaveLength(1);
    });

    it('sanitizes config on save', async () => {
      await setQuickActionConfig({
        hiddenBuiltInIds: ['flow', 'flow', 123 as unknown as string],
        customActions: [
          { id: 'custom1', label: 'My Link', url: '/test', icon: '' },
          { id: 'bad', label: 'Missing URL' } as unknown as { id: string; label: string; url: string },
        ],
      });

      expect(syncStore.commandPaletteQuickActions).toEqual({
        hiddenBuiltInIds: ['flow'],
        customActions: [{ id: 'custom1', label: 'My Link', url: '/test', icon: undefined }],
      });
    });

    it('resets config', async () => {
      await setQuickActionConfig({
        hiddenBuiltInIds: ['x'],
        customActions: [],
      });
      await resetQuickActionConfig();

      const result = await getQuickActionConfig();
      expect(result).toEqual({ hiddenBuiltInIds: [], customActions: [] });
    });
  });

  // ─── Describe Cache ─────────────────────────────────────────────────────

  describe('describe cache', () => {
    it('returns null for cache miss', async () => {
      const result = await getCachedDescribe('Account');
      expect(result).toBeNull();
    });

    it('stores and retrieves cached describe', async () => {
      const data = { name: 'Account', fields: [] };
      await setCachedDescribe('Account', data);

      const result = await getCachedDescribe('Account');
      expect(result).toEqual(data);
    });

    it('returns null for expired entries (>1 hour)', async () => {
      const TWO_HOURS = 2 * 60 * 60 * 1000;
      localStore.describeCache = {
        Account: {
          data: { name: 'Account' },
          cachedAt: Date.now() - TWO_HOURS,
        },
      };

      const result = await getCachedDescribe('Account');
      expect(result).toBeNull();
    });

    it('returns data for non-expired entries (<1 hour)', async () => {
      const THIRTY_MIN = 30 * 60 * 1000;
      localStore.describeCache = {
        Account: {
          data: { name: 'Account' },
          cachedAt: Date.now() - THIRTY_MIN,
        },
      };

      const result = await getCachedDescribe('Account');
      expect(result).toEqual({ name: 'Account' });
    });

    it('evicts expired entries on setCachedDescribe', async () => {
      const TWO_HOURS = 2 * 60 * 60 * 1000;
      localStore.describeCache = {
        OldEntry: { data: 'old', cachedAt: Date.now() - TWO_HOURS },
      };

      await setCachedDescribe('NewEntry', { name: 'New' });

      const cache = localStore.describeCache;
      expect(cache.OldEntry).toBeUndefined();
      expect(cache.NewEntry).toBeDefined();
    });

    it('evicts oldest entries when exceeding max (25)', async () => {
      // Pre-fill cache with 25 entries
      const now = Date.now();
      const cache: Record<string, any> = {};
      for (let i = 0; i < 25; i++) {
        cache[`entry${i}`] = { data: `data${i}`, cachedAt: now - (25 - i) * 1000 };
      }
      localStore.describeCache = cache;

      // Add 26th entry
      await setCachedDescribe('newEntry', { name: 'New' });

      const updatedCache = localStore.describeCache;
      const keys = Object.keys(updatedCache);
      expect(keys.length).toBeLessThanOrEqual(25);
      expect(updatedCache.newEntry).toBeDefined();
      // Oldest entry should have been evicted
      expect(updatedCache.entry0).toBeUndefined();
    });

    it('handles empty cache gracefully', async () => {
      await setCachedDescribe('Test', { name: 'Test' });
      const result = await getCachedDescribe('Test');
      expect(result).toEqual({ name: 'Test' });
    });
  });
});
