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

const SALESFORCE_CLASSIC_POD_HOST_RE = /^[a-z]{2,6}\d+(?:-[a-z0-9-]+)?\.salesforce\.com$/i;
const CLASSIC_SETUP_PATH_RE = /^(?:\/setup\/|\/ui\/setup\/|\/p\/setup\/)/i;

/**
 * Returns true only for hostnames that belong to an actual Salesforce org
 * (Lightning, classic pod hosts, setup hosts, code-builder).
 * Excludes public/informational sites like help.salesforce.com and login.salesforce.com.
 */
export function isSalesforceOrgHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized.endsWith('.my.salesforce.com') ||
    normalized.endsWith('.lightning.force.com') ||
    normalized.endsWith('.salesforce-setup.com') ||
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
  return `https://${hostname}`;
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
