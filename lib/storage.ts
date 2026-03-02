const DEFAULTS = {
  enabledModules: ['command-palette', 'field-inspector', 'quick-copy', 'table-filter', 'environment-safeguard', 'deep-dependency-inspector', 'hide-devops-bar'] as string[],
  orgSettings: {} as Record<string, OrgSettings>,
};

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
  return (result.enabledModules as string[] | undefined) ?? DEFAULTS.enabledModules;
}

export async function setEnabledModules(ids: string[]): Promise<void> {
  await chrome.storage.sync.set({ enabledModules: ids });
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
