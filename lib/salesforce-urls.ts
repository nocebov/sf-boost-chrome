export type OrgType =
  | 'production'
  | 'sandbox'
  | 'developer'
  | 'scratch'
  | 'trailhead'
  | 'unknown';

export interface OrgInfo {
  orgType: OrgType;
  myDomain: string;
  sandboxName?: string;
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

export function parseLightningUrl(pathname: string): ParsedPage {
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

  // List: /lightning/o/{ObjectApiName}/list
  const listMatch = pathname.match(/^\/lightning\/o\/(\w+)\/list/);
  if (listMatch) {
    return { pageType: 'list', objectApiName: listMatch[1] };
  }

  // Setup
  if (pathname.startsWith('/lightning/setup/')) {
    return { pageType: 'setup' };
  }

  // Home
  if (pathname === '/lightning/page/home' || pathname === '/lightning') {
    return { pageType: 'home' };
  }

  return { pageType: 'other' };
}
