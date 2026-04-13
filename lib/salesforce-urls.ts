export type OrgType =
  | 'production'
  | 'sandbox'
  | 'developer'
  | 'scratch'
  | 'trailhead'
  | 'code-builder'
  | 'unknown';

export interface OrgInfo {
  orgType: OrgType;
  myDomain: string;
  sandboxName?: string;
}

export interface SalesforceOrgContext extends OrgInfo {
  hostname: string;
  orgSettingsKey: string;
}

const SALESFORCE_CLASSIC_POD_HOST_RE = /^[a-z]{2,6}\d+(?:-[a-z0-9-]+)?\.salesforce\.com$/i;
const CLASSIC_SETUP_PATH_RE = /^(?:\/setup\/|\/ui\/setup\/|\/p\/setup\/)/i;
const EXPERIENCE_BUILDER_HOST_SUFFIX = '.builder.salesforce-experience.com';

export function isExperienceBuilderHost(hostname: string): boolean {
  return hostname.toLowerCase().endsWith(EXPERIENCE_BUILDER_HOST_SUFFIX);
}

/**
 * Returns true only for hostnames that belong to an actual Salesforce org
 * (Lightning, classic pod hosts, setup hosts, Experience Builder, code-builder).
 * Excludes public/informational sites like help.salesforce.com and login.salesforce.com.
 */
export function isSalesforceOrgHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized.endsWith('.my.salesforce.com') ||
    normalized.endsWith('.lightning.force.com') ||
    normalized.endsWith('.salesforce-setup.com') ||
    isExperienceBuilderHost(normalized) ||
    normalized.endsWith('.code-builder.platform.salesforce.com') ||
    SALESFORCE_CLASSIC_POD_HOST_RE.test(normalized)
  );
}

function isClassicSetupUrl(pathname: string, search = ''): boolean {
  const normalizedSearch = search.toLowerCase();
  return (
    CLASSIC_SETUP_PATH_RE.test(pathname) ||
    normalizedSearch.includes('setupid=') ||
    normalizedSearch.includes('isdtp=')
  );
}

export function detectOrgType(hostname: string): OrgInfo {
  // Sandbox: {MyDomain}--{SandboxName}.sandbox.my.salesforce.com
  if (hostname.includes('.sandbox.')) {
    const match = hostname.match(/^(.+?)--(.+?)\.sandbox\./);
    return {
      orgType: 'sandbox',
      myDomain: match?.[1] ?? hostname,
      sandboxName: match?.[2],
    };
  }
  // Salesforce Code Builder (VSCode in browser)
  // e.g. catshark-u0dqr0.iad.002.sf.code-builder.platform.salesforce.com
  if (hostname.includes('.code-builder.platform.salesforce.com')) {
    return { orgType: 'code-builder', myDomain: hostname.split('.')[0] ?? hostname };
  }
  // Trailhead / Trailblaze
  if (hostname.includes('.trailblaze.') || hostname.includes('trailblaze')) {
    return { orgType: 'trailhead', myDomain: extractDomain(hostname) };
  }
  // Developer Edition
  if (hostname.includes('-dev-ed') || hostname.includes('.develop.')) {
    return { orgType: 'developer', myDomain: extractDomain(hostname) };
  }
  // Scratch org
  if (hostname.includes('.scratch.')) {
    return { orgType: 'scratch', myDomain: extractDomain(hostname) };
  }
  // Default: production (most dangerous — hence red banner)
  return { orgType: 'production', myDomain: extractDomain(hostname) };
}

function extractDomain(hostname: string): string {
  // Take the first segment before any dots
  return hostname.split('.')[0] ?? hostname;
}

export function getCanonicalOrgSettingsKey(hostname: string): string {
  return extractDomain(hostname);
}

export function buildInstanceUrl(hostname: string): string {
  // Convert lightning.force.com to my.salesforce.com for API calls
  if (hostname.includes('.lightning.force.com')) {
    return `https://${hostname.replace('.lightning.force.com', '.my.salesforce.com')}`;
  }
  // Convert salesforce-setup.com to salesforce.com for API calls
  // e.g. foo.trailblaze.my.salesforce-setup.com → foo.trailblaze.my.salesforce.com
  if (hostname.includes('.salesforce-setup.com')) {
    return `https://${hostname.replace('.salesforce-setup.com', '.salesforce.com')}`;
  }
  // Convert Experience Builder domains back to the authenticated org host
  if (hostname.includes('.sandbox.builder.salesforce-experience.com')) {
    return `https://${hostname.replace(
      '.sandbox.builder.salesforce-experience.com',
      '.sandbox.my.salesforce.com',
    )}`;
  }
  if (isExperienceBuilderHost(hostname)) {
    return `https://${hostname.replace(EXPERIENCE_BUILDER_HOST_SUFFIX, '.my.salesforce.com')}`;
  }
  return `https://${hostname}`;
}

export function getOrgSettingsFallbackKeys(hostname: string, legacyMyDomain?: string): string[] {
  const keys = new Set<string>();

  const normalizedHost = hostname.trim();
  if (normalizedHost) {
    keys.add(normalizedHost);
    try {
      keys.add(new URL(buildInstanceUrl(normalizedHost)).hostname);
    } catch {
      // Ignore malformed hostnames and keep best-effort fallbacks only.
    }
  }

  const normalizedLegacy = legacyMyDomain?.trim();
  if (normalizedLegacy) {
    keys.add(normalizedLegacy);
  }

  return [...keys];
}

export function getSalesforceOrgContextFromUrl(value: string): SalesforceOrgContext | null {
  try {
    const url = new URL(value);
    if (!isSalesforceOrgHost(url.hostname)) return null;

    const orgInfo = detectOrgType(url.hostname);
    return {
      hostname: url.hostname,
      orgType: orgInfo.orgType,
      myDomain: orgInfo.myDomain,
      orgSettingsKey: getCanonicalOrgSettingsKey(url.hostname),
      sandboxName: orgInfo.sandboxName,
    };
  } catch {
    return null;
  }
}

export type PageType = 'record' | 'list' | 'setup' | 'home' | 'app' | 'flow-builder' | 'change-set' | 'other';

export interface ParsedPage {
  pageType: PageType;
  objectApiName?: string;
  recordId?: string;
}

export function parseLightningUrl(pathname: string, search = ''): ParsedPage {
  // Flow Builder: /builder_platform_interaction/flowBuilder.app
  if (pathname.includes('/builder_platform_interaction/flowBuilder.app')) {
    return { pageType: 'flow-builder' };
  }

  // Change Set pages
  if (pathname.includes('/changemgmt/')) {
    return { pageType: 'change-set' };
  }

  // Record: /lightning/r/{ObjectApiName}/{RecordId}/view
  const recordMatch = pathname.match(/^\/lightning\/r\/(\w+)\/(\w{15,18})\/view/);
  if (recordMatch) {
    return { pageType: 'record', objectApiName: recordMatch[1], recordId: recordMatch[2] };
  }

  // List / object views: /lightning/o/{ObjectApiName}/list, pipelineInspection, home, etc.
  const listMatch = pathname.match(/^\/lightning\/o\/(\w+)\//);
  if (listMatch) {
    return { pageType: 'list', objectApiName: listMatch[1] };
  }

  // Setup
  if (pathname.startsWith('/lightning/setup/')) {
    return { pageType: 'setup' };
  }

  // Classic Setup pages on *.salesforce.com / *.my.salesforce.com
  if (isClassicSetupUrl(pathname, search)) {
    return { pageType: 'setup' };
  }

  // Home
  if (pathname === '/lightning/page/home' || pathname === '/lightning') {
    return { pageType: 'home' };
  }

  return { pageType: 'other' };
}
