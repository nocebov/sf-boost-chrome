import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';
import type { OrgType } from '../../lib/salesforce-urls';
import { getOrgSettings } from '../../lib/storage';
import { isValidCssColor } from '../../lib/salesforce-utils';
import { tokens } from '../../lib/design-tokens';

const BADGE_ID = 'sfboost-env-badge';
let originalTitle = '';
let currentCtx: ModuleContext | null = null;

// DevOps bar adaptation
const DEVOPS_BAR_QUERY = 'devops_center-org-info, devops_center-panel-button, devops_center-app-container';
let devopsAdaptObserver: MutationObserver | null = null;

function computeBadgeTop(): string {
  const el = document.querySelector(DEVOPS_BAR_QUERY);
  if (!el) return tokens.space.md;

  const container =
    el.closest<HTMLElement>('lightning-layout.navBar-container') ??
    (el.parentElement as HTMLElement | null) ??
    (el as HTMLElement);

  const style = window.getComputedStyle(container);
  if (style.display === 'none' || style.visibility === 'hidden') return tokens.space.md;

  const rect = container.getBoundingClientRect();
  if (rect.height === 0) return tokens.space.md;

  return `${Math.round(rect.bottom) + 4}px`;
}

function updateBadgeTop(): void {
  const badge = document.getElementById(BADGE_ID);
  if (badge) badge.style.top = computeBadgeTop();
}

function startDevopsAdaptObserver(): void {
  if (devopsAdaptObserver) return;
  devopsAdaptObserver = new MutationObserver(() => {
    requestAnimationFrame(updateBadgeTop);
  });
  devopsAdaptObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-sfboost-hide-devops-target', 'style'],
  });
}

function stopDevopsAdaptObserver(): void {
  devopsAdaptObserver?.disconnect();
  devopsAdaptObserver = null;
}
// Default color scheme per org type
const ENV_COLORS: Record<OrgType, { bg: string; text: string; label: string }> = {
  production: { bg: tokens.color.envProduction, text: tokens.color.textOnPrimary, label: 'PRODUCTION' },
  sandbox: { bg: tokens.color.envSandbox, text: tokens.color.textOnPrimary, label: 'SANDBOX' },
  developer: { bg: tokens.color.envDeveloper, text: tokens.color.textOnPrimary, label: 'DEV' },
  scratch: { bg: tokens.color.envScratch, text: tokens.color.textOnPrimary, label: 'SCRATCH' },
  trailhead: { bg: tokens.color.envTrailhead, text: tokens.color.textOnPrimary, label: 'TRAILHEAD' },
  'code-builder': { bg: tokens.color.envCodeBuilder, text: tokens.color.textOnPrimary, label: 'CODE BUILDER' },
  unknown: { bg: tokens.color.envUnknown, text: tokens.color.textOnPrimary, label: 'UNKNOWN' },
};

function getTitlePrefix(orgType: OrgType, sandboxName?: string): string {
  if (orgType === 'sandbox' && sandboxName) return `[SBX: ${sandboxName}]`;
  if (orgType === 'production') return '[PROD]';
  if (orgType === 'developer') return '[DEV]';
  if (orgType === 'scratch') return '[SCRATCH]';
  if (orgType === 'trailhead') return '[TRAIL]';
  if (orgType === 'code-builder') return '[CB]';
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

function isFlowBuilderPage(): boolean {
  return window.location.href.includes('flowBuilder');
}

function isAppBuilderPage(): boolean {
  return window.location.href.includes('appBuilder.app');
}

async function injectBadge(ctx: ModuleContext): Promise<void> {
  // Remove existing badge if any
  document.getElementById(BADGE_ID)?.remove();

  // Hide badge on Flow Builder and App Builder pages — it overlaps the canvas toolbar
  if (isFlowBuilderPage() || isAppBuilderPage()) {
    updateExtensionBadge('');
    return;
  }

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
    top: ${computeBadgeTop()};
    left: 80px;
    z-index: ${tokens.zIndex.badge};
    padding: 2px 10px;
    border-radius: ${tokens.radius.xl};
    font-size: ${tokens.font.size.sm};
    font-weight: ${tokens.font.weight.bold};
    font-family: ${tokens.font.family.sans};
    pointer-events: none;
    letter-spacing: 0.5px;
    background: ${bg};
    color: ${textColor};
    box-shadow: ${tokens.shadow.sm};
    user-select: none;
    display: flex;
    align-items: center;
    transition: opacity ${tokens.transition.slow} ease;
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

  // Extension icon badge intentionally disabled
  updateExtensionBadge('', bg);
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
    startDevopsAdaptObserver();
  },

  async onNavigate(ctx: ModuleContext) {
    currentCtx = ctx;
    if (window.top !== window.self) return;
    if (isFlowBuilderPage() || isAppBuilderPage()) {
      removeBadge();
      return;
    }
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
    stopDevopsAdaptObserver();
    removeBadge();
    currentCtx = null;
  },
};

registry.register(environmentSafeguard);
