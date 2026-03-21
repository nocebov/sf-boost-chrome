import { DEFAULT_ENABLED_MODULE_IDS, MODULE_CATALOG, type ModuleSettingDef } from '../modules/catalog';

export const STORAGE_VERSION = 1;

export const DEFAULTS = {
  enabledModules: [...DEFAULT_ENABLED_MODULE_IDS] as string[],
  orgSettings: {} as Record<string, OrgSettings>,
};

const KNOWN_MODULE_IDS = new Set(MODULE_CATALOG.map((module) => module.id));

function normalizeEnabledModuleIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [...DEFAULTS.enabledModules];

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const value of ids) {
    if (typeof value !== 'string') continue;
    if (!KNOWN_MODULE_IDS.has(value) || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }

  return normalized.length > 0 ? normalized : [...DEFAULTS.enabledModules];
}

/**
 * Run storage migrations on extension install/update.
 * Call from background script on `chrome.runtime.onInstalled`.
 */
export async function migrateStorage(): Promise<void> {
  const result = await chrome.storage.sync.get('storageVersion');
  const currentVersion = (result.storageVersion as number | undefined) ?? 0;

  if (currentVersion < STORAGE_VERSION) {
    // Future migrations go here as version numbers increase
    // if (currentVersion < 2) { ... migrate v1 -> v2 ... }

    await chrome.storage.sync.set({ storageVersion: STORAGE_VERSION });
  }
}

export interface OrgSettings {
  label?: string;
  bannerColor?: string;
  bannerTextColor?: string;
  showBanner?: boolean;
  badgeEnabled?: boolean;
  badgeColor?: string;
  badgeTextColor?: string;
  badgeLabel?: string;
}

export async function getEnabledModules(): Promise<string[]> {
  const result = await chrome.storage.sync.get('enabledModules');
  return normalizeEnabledModuleIds(result.enabledModules);
}

export async function setEnabledModules(ids: string[]): Promise<void> {
  await chrome.storage.sync.set({ enabledModules: normalizeEnabledModuleIds(ids) });
}

export async function getOrgSettings(domain: string): Promise<OrgSettings> {
  const result = await chrome.storage.sync.get('orgSettings');
  const all = (result.orgSettings as Record<string, OrgSettings> | undefined) ?? {};
  return all[domain] ?? {};
}

export async function setOrgSettings(domain: string, settings: OrgSettings): Promise<void> {
  const result = await chrome.storage.sync.get('orgSettings');
  const all = (result.orgSettings as Record<string, OrgSettings> | undefined) ?? {};
  all[domain] = { ...all[domain], ...settings };
  await chrome.storage.sync.set({ orgSettings: all });
}

// Command Palette quick action customization
export interface CustomQuickAction {
  id: string;
  label: string;
  url: string;
  icon?: string;
}

export interface QuickActionConfig {
  hiddenBuiltInIds: string[];
  customActions: CustomQuickAction[];
}

function normalizeCustomQuickAction(value: unknown): CustomQuickAction | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Partial<CustomQuickAction>;
  if (typeof candidate.id !== 'string' || typeof candidate.label !== 'string' || typeof candidate.url !== 'string') {
    return null;
  }

  return {
    id: candidate.id,
    label: candidate.label,
    url: candidate.url,
    icon: typeof candidate.icon === 'string' && candidate.icon.trim() ? candidate.icon : undefined,
  };
}

function normalizeQuickActionConfig(value: unknown): QuickActionConfig {
  if (!value || typeof value !== 'object') {
    return { hiddenBuiltInIds: [], customActions: [] };
  }

  const candidate = value as Partial<QuickActionConfig>;
  const hiddenBuiltInIds = Array.isArray(candidate.hiddenBuiltInIds)
    ? candidate.hiddenBuiltInIds.filter((entry): entry is string => typeof entry === 'string')
    : [];

  const customActions = Array.isArray(candidate.customActions)
    ? candidate.customActions
        .map((entry) => normalizeCustomQuickAction(entry))
        .filter((entry): entry is CustomQuickAction => entry !== null)
    : [];

  return {
    hiddenBuiltInIds: [...new Set(hiddenBuiltInIds)],
    customActions,
  };
}

export async function getQuickActionConfig(): Promise<QuickActionConfig> {
  const result = await chrome.storage.sync.get('commandPaletteQuickActions');
  return normalizeQuickActionConfig(result.commandPaletteQuickActions);
}

export async function setQuickActionConfig(config: QuickActionConfig): Promise<void> {
  await chrome.storage.sync.set({ commandPaletteQuickActions: normalizeQuickActionConfig(config) });
}

export async function resetQuickActionConfig(): Promise<void> {
  await chrome.storage.sync.remove('commandPaletteQuickActions');
}

// Module-specific settings
export type ModuleSettings = Record<string, boolean>;

const MODULE_SETTINGS_MAP = new Map<string, ModuleSettingDef[]>();
for (const mod of MODULE_CATALOG) {
  if (mod.settings?.length) MODULE_SETTINGS_MAP.set(mod.id, mod.settings);
}

function normalizeModuleSettings(moduleId: string, raw: unknown): ModuleSettings {
  const defs = MODULE_SETTINGS_MAP.get(moduleId);
  if (!defs) return {};

  const result: ModuleSettings = {};
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  for (const def of defs) {
    result[def.key] = typeof source[def.key] === 'boolean' ? (source[def.key] as boolean) : def.default;
  }
  return result;
}

export async function getModuleSettings(moduleId: string): Promise<ModuleSettings> {
  const result = await chrome.storage.sync.get('moduleSettings');
  const all = (result.moduleSettings as Record<string, ModuleSettings> | undefined) ?? {};
  return normalizeModuleSettings(moduleId, all[moduleId]);
}

export async function setModuleSettings(moduleId: string, settings: ModuleSettings): Promise<void> {
  const result = await chrome.storage.sync.get('moduleSettings');
  const all = (result.moduleSettings as Record<string, ModuleSettings> | undefined) ?? {};
  all[moduleId] = normalizeModuleSettings(moduleId, { ...all[moduleId], ...settings });
  await chrome.storage.sync.set({ moduleSettings: all });
}

export async function getAllModuleSettings(): Promise<Record<string, ModuleSettings>> {
  const result = await chrome.storage.sync.get('moduleSettings');
  const raw = (result.moduleSettings as Record<string, unknown> | undefined) ?? {};
  const normalized: Record<string, ModuleSettings> = {};
  for (const [moduleId] of MODULE_SETTINGS_MAP) {
    normalized[moduleId] = normalizeModuleSettings(moduleId, raw[moduleId]);
  }
  return normalized;
}

// Describe cache with TTL (1 hour) and max entries
const CACHE_TTL = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 25;

export async function getCachedDescribe(key: string): Promise<any | null> {
  const result = await chrome.storage.local.get('describeCache');
  const cache = result.describeCache as Record<string, { data: any; cachedAt: number }> | undefined;
  const entry = cache?.[key];
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL) return null;
  return entry.data;
}

export async function setCachedDescribe(key: string, data: any): Promise<void> {
  const result = await chrome.storage.local.get('describeCache');
  const cache = (result.describeCache as Record<string, { data: any; cachedAt: number }> | undefined) ?? {};
  const now = Date.now();

  // Evict expired entries
  for (const k of Object.keys(cache)) {
    if (now - cache[k]!.cachedAt > CACHE_TTL) delete cache[k];
  }

  cache[key] = { data, cachedAt: now };

  // Evict oldest entries if over limit
  const keys = Object.keys(cache);
  if (keys.length > MAX_CACHE_ENTRIES) {
    keys.sort((a, b) => cache[a]!.cachedAt - cache[b]!.cachedAt);
    for (const k of keys.slice(0, keys.length - MAX_CACHE_ENTRIES)) {
      delete cache[k];
    }
  }

  await chrome.storage.local.set({ describeCache: cache });
}
