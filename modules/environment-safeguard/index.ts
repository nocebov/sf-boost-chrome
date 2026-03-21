import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';
import type { OrgSettings, ModuleSettings } from '../../lib/storage';
import { getOrgSettings, getModuleSettings } from '../../lib/storage';
import { sendMessage } from '../../lib/messaging';
import { tokens } from '../../lib/design-tokens';
import { resolveEnvironmentAppearance, getTitlePrefix, type EnvironmentAppearance } from './appearance';
import { ColoredFaviconController } from './favicon';

const BADGE_ID = 'sfboost-env-badge';
let originalTitle = '';
let clockInterval: ReturnType<typeof setInterval> | null = null;
let orgTimeZone: string | null = null;
const faviconController = new ColoredFaviconController();

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

async function fetchOrgTimeZone(instanceUrl: string): Promise<string | null> {
  if (orgTimeZone) return orgTimeZone;
  try {
    const result = await sendMessage('executeSOQL', {
      instanceUrl,
      query: 'SELECT TimeZoneSidKey FROM Organization LIMIT 1',
    });
    if (result?.records?.[0]?.TimeZoneSidKey) {
      orgTimeZone = result.records[0].TimeZoneSidKey;
      return orgTimeZone;
    }
  } catch {
    // Silently fall back — clock won't show
  }
  return null;
}

function formatOrgTime(timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
    hour12: false,
  }).format(new Date());
}

function stopClock(): void {
  if (clockInterval) {
    clearInterval(clockInterval);
    clockInterval = null;
  }
}

function startClock(clockEl: HTMLElement, timeZone: string): void {
  stopClock();
  clockEl.textContent = formatOrgTime(timeZone);
  clockInterval = setInterval(() => {
    clockEl.textContent = formatOrgTime(timeZone);
  }, 15_000); // update every 15s — minute precision is enough
}

async function loadSafeguardState(
  ctx: ModuleContext,
): Promise<{ settings: OrgSettings; appearance: EnvironmentAppearance; moduleSettings: ModuleSettings }> {
  const [settings, moduleSettings] = await Promise.all([
    getOrgSettings(ctx.pageContext.myDomain),
    getModuleSettings('environment-safeguard'),
  ]);
  return {
    settings,
    moduleSettings,
    appearance: resolveEnvironmentAppearance(
      ctx.pageContext.orgType,
      settings,
      ctx.pageContext.sandboxName,
    ),
  };
}

async function injectBadge(
  ctx: ModuleContext,
  settings: OrgSettings,
  appearance: EnvironmentAppearance,
  moduleSettings: ModuleSettings,
): Promise<void> {
  // Remove existing badge if any
  document.getElementById(BADGE_ID)?.remove();
  stopClock();

  // Hide badge on Flow Builder and App Builder pages — it overlaps the canvas toolbar
  if (isFlowBuilderPage() || isAppBuilderPage()) {
    updateExtensionBadge('');
    return;
  }

  const { orgType, sandboxName, instanceUrl } = ctx.pageContext;
  const badgeEnabled = settings.badgeEnabled !== false; // default true
  if (!badgeEnabled) {
    updateExtensionBadge('');
    return;
  }

  const badge = document.createElement('div');
  badge.id = BADGE_ID;
  badge.setAttribute('style', `
    position: fixed;
    top: ${computeBadgeTop()};
    left: 80px;
    z-index: ${tokens.zIndex.badge};
    font-family: ${tokens.font.family.sans};
    pointer-events: none;
    user-select: none;
    box-shadow: ${tokens.shadow.sm};
    border-radius: ${tokens.radius.xl};
    overflow: hidden;
    transition: opacity ${tokens.transition.slow} ease;
  `);

  // Top row — environment label
  const labelRow = document.createElement('div');
  labelRow.setAttribute('style', `
    padding: 2px 10px;
    font-size: ${tokens.font.size.sm};
    font-weight: ${tokens.font.weight.bold};
    letter-spacing: 0.5px;
    background: ${appearance.backgroundColor};
    color: ${appearance.textColor};
    text-align: center;
  `);
  labelRow.textContent = appearance.label;
  badge.appendChild(labelRow);

  // Bottom row — org clock (respects showClock setting)
  const showClock = moduleSettings.showClock !== false;
  if (showClock) {
    const clockRow = document.createElement('div');
    clockRow.setAttribute('style', `
      padding: 1px 10px;
      font-size: ${tokens.font.size.xs};
      font-weight: ${tokens.font.weight.medium};
      font-variant-numeric: tabular-nums;
      background: ${appearance.backgroundColor};
      color: ${appearance.textColor};
      opacity: 0.85;
      text-align: center;
      border-top: 1px solid rgba(255,255,255,0.2);
    `);
    clockRow.textContent = '—';
    badge.appendChild(clockRow);

    // Fetch timezone and start the clock
    fetchOrgTimeZone(instanceUrl).then((tz) => {
      if (tz && document.getElementById(BADGE_ID)) {
        startClock(clockRow, tz);
      }
    });
  }

  document.body.appendChild(badge);

  // Update tab title with environment prefix (respects showTitlePrefix setting)
  const showTitlePrefix = moduleSettings.showTitlePrefix !== false;
  if (showTitlePrefix) {
    const prefix = getTitlePrefix(orgType, sandboxName);
    if (prefix && !document.title.startsWith(prefix)) {
      originalTitle = document.title;
      document.title = `${prefix} ${document.title}`;
    }
  }

  // Extension icon badge intentionally disabled
  updateExtensionBadge('', appearance.backgroundColor);
}

function removeBadge(): void {
  stopClock();
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
    if (window.top !== window.self) return;
    const { settings, appearance, moduleSettings } = await loadSafeguardState(ctx);
    if (moduleSettings.showFavicon !== false) {
      faviconController.apply(appearance);
    }
    await injectBadge(ctx, settings, appearance, moduleSettings);
    startDevopsAdaptObserver();
  },

  async onNavigate(ctx: ModuleContext) {
    if (window.top !== window.self) return;
    const { settings, appearance, moduleSettings } = await loadSafeguardState(ctx);
    if (moduleSettings.showFavicon !== false) {
      faviconController.apply(appearance);
    } else {
      faviconController.clear();
    }
    if (isFlowBuilderPage() || isAppBuilderPage()) {
      removeBadge();
      return;
    }
    // Badge persists across SPA navigation — only re-inject if needed
    if (!document.getElementById(BADGE_ID)) {
      await injectBadge(ctx, settings, appearance, moduleSettings);
    }
    // Keep title prefix updated (respects showTitlePrefix setting)
    if (moduleSettings.showTitlePrefix !== false) {
      const prefix = getTitlePrefix(ctx.pageContext.orgType, ctx.pageContext.sandboxName);
      if (prefix && !document.title.startsWith(prefix)) {
        originalTitle = document.title;
        document.title = `${prefix} ${document.title}`;
      }
    }
  },

  destroy() {
    stopDevopsAdaptObserver();
    faviconController.clear();
    removeBadge();
  },
};

registry.register(environmentSafeguard);
