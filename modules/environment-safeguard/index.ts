import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';
import type { OrgType } from '../../lib/salesforce-urls';
import { getOrgSettings } from '../../lib/storage';
import { isValidCssColor } from '../../lib/salesforce-utils';

const BADGE_ID = 'sfboost-env-badge';
let originalTitle = '';
let currentCtx: ModuleContext | null = null;
// Default color scheme per org type
const ENV_COLORS: Record<OrgType, { bg: string; text: string; label: string }> = {
  production: { bg: '#dc2626', text: '#fff', label: 'PRODUCTION' },
  sandbox: { bg: '#16a34a', text: '#fff', label: 'SANDBOX' },
  developer: { bg: '#2563eb', text: '#fff', label: 'DEV' },
  scratch: { bg: '#7c3aed', text: '#fff', label: 'SCRATCH' },
  trailhead: { bg: '#0d9488', text: '#fff', label: 'TRAILHEAD' },
  unknown: { bg: '#6b7280', text: '#fff', label: 'UNKNOWN' },
};

function getTitlePrefix(orgType: OrgType, sandboxName?: string): string {
  if (orgType === 'sandbox' && sandboxName) return `[SBX: ${sandboxName}]`;
  if (orgType === 'production') return '[PROD]';
  if (orgType === 'developer') return '[DEV]';
  if (orgType === 'scratch') return '[SCRATCH]';
  if (orgType === 'trailhead') return '[TRAIL]';
  return '';
}

function updateExtensionBadge(text: string, color?: string): void {
  chrome.runtime.sendMessage({
    type: 'updateBadge',
    data: { text, color },
  }).catch(() => {
    // Badge updates are optional.
  });
}

async function injectBadge(ctx: ModuleContext): Promise<void> {
  // Remove existing badge if any
  document.getElementById(BADGE_ID)?.remove();

  const { orgType, myDomain, sandboxName } = ctx.pageContext;
  const defaults = ENV_COLORS[orgType] ?? ENV_COLORS.unknown;

  // Check for custom org settings
  const settings = await getOrgSettings(myDomain);
  const badgeEnabled = settings.badgeEnabled !== false; // default true
  if (!badgeEnabled) {
    updateExtensionBadge('');
    return;
  }

  const bg = (settings.badgeColor && isValidCssColor(settings.badgeColor)) ? settings.badgeColor : defaults.bg;
  const textColor = (settings.badgeTextColor && isValidCssColor(settings.badgeTextColor)) ? settings.badgeTextColor : defaults.text;
  let label = settings.badgeLabel ?? defaults.label;

  // For sandbox, show sandbox name if available
  if (orgType === 'sandbox' && sandboxName && !settings.badgeLabel) {
    label = sandboxName.toUpperCase();
  }

  const badge = document.createElement('div');
  badge.id = BADGE_ID;
  badge.setAttribute('style', `
    position: fixed;
    top: 8px;
    left: 80px;
    z-index: 99999;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 700;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    pointer-events: none;
    letter-spacing: 0.5px;
    background: ${bg};
    color: ${textColor};
    box-shadow: 0 1px 4px rgba(0,0,0,0.15);
    user-select: none;
    display: flex;
    align-items: center;
    transition: opacity 0.2s ease;
  `);

  const labelSpan = document.createElement('span');
  labelSpan.textContent = label;

  badge.appendChild(labelSpan);

  document.body.appendChild(badge);

  // Update tab title with environment prefix
  const prefix = getTitlePrefix(orgType, sandboxName);
  if (prefix && !document.title.startsWith(prefix)) {
    originalTitle = document.title;
    document.title = `${prefix} ${document.title}`;
  }

  // Update extension badge icon color
  updateExtensionBadge(label.slice(0, 4), bg);
}

function removeBadge(): void {
  document.getElementById(BADGE_ID)?.remove();
  updateExtensionBadge('');
  if (originalTitle) {
    document.title = originalTitle;
    originalTitle = '';
  }
}

const environmentSafeguard: SFBoostModule = {
  id: 'environment-safeguard',
  name: 'Environment Safeguard',
  description: 'Color-coded environment indicator near SF logo',

  async init(ctx: ModuleContext) {
    currentCtx = ctx;
    if (window.top !== window.self) return;
    await injectBadge(ctx);
  },

  async onNavigate(ctx: ModuleContext) {
    currentCtx = ctx;
    if (window.top !== window.self) return;
    // Badge persists across SPA navigation — only re-inject if needed
    if (!document.getElementById(BADGE_ID)) {
      await injectBadge(ctx);
    }
    // Keep title prefix updated
    const prefix = getTitlePrefix(ctx.pageContext.orgType, ctx.pageContext.sandboxName);
    if (prefix && !document.title.startsWith(prefix)) {
      originalTitle = document.title;
      document.title = `${prefix} ${document.title}`;
    }
  },

  destroy() {
    removeBadge();
    currentCtx = null;
  },
};

registry.register(environmentSafeguard);
