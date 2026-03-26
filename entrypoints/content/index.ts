import { registry } from '../../modules/registry';
import { getEnabledModules, DEFAULTS } from '../../lib/storage';
import { detectOrgType, buildInstanceUrl, parseLightningUrl, isSalesforceOrgHost } from '../../lib/salesforce-urls';
import type { SFPageContext } from '../../modules/types';
import { logger } from '../../lib/logger';

// Import all modules (they self-register on import)
import '../../modules/command-palette';
import '../../modules/field-inspector';
import '../../modules/quick-copy';
import '../../modules/table-filter';
import '../../modules/environment-safeguard';
import '../../modules/deep-dependency-inspector';
import '../../modules/change-set-buddy';
import '../../modules/profile-to-permset';
import '../../modules/hide-devops-bar';
import '../../modules/bulk-check';
import '../../modules/console-formatter';

declare global {
  interface Window { __sfBoostLoaded?: boolean; }
}

/** Module IDs that support running inside classic Setup iframes */
const IFRAME_MODULE_IDS = ['bulk-check'];
const CLASSIC_SETUP_IFRAME_SELECTOR =
  'iframe[src*="/setup/"], iframe[src*="/perm"], iframe[src*="/profiles/"], ' +
  'iframe.setupcontent, iframe[name="setupFrame"], iframe[title*="Setup"]';
const IFRAME_MODULE_UPDATE_MESSAGE = 'sfboost:update-iframe-modules';

let currentCtx: { pageContext: SFPageContext } | null = null;

function buildPageContext(): SFPageContext {
  const { hostname, pathname, search, href } = window.location;
  const orgInfo = detectOrgType(hostname);
  const pageInfo = parseLightningUrl(pathname, search);
  return {
    url: href,
    orgType: orgInfo.orgType,
    myDomain: orgInfo.myDomain,
    sandboxName: orgInfo.sandboxName,
    pageType: pageInfo.pageType,
    objectApiName: pageInfo.objectApiName,
    recordId: pageInfo.recordId,
    instanceUrl: buildInstanceUrl(hostname),
  };
}

function filterEnabledModuleIds(enabledIds: string[], allowedIds?: readonly string[]): string[] {
  if (!allowedIds) return enabledIds;
  return allowedIds.filter((id) => enabledIds.includes(id));
}

async function syncEnabledModules(
  enabledIds: string[],
  allowedIds?: readonly string[],
): Promise<void> {
  if (!currentCtx) return;

  const filteredEnabledIds = filterEnabledModuleIds(enabledIds, allowedIds);
  const enabledSet = new Set(filteredEnabledIds);
  const activeIds = new Set(registry.getActive().map((mod) => mod.id));

  for (const activeId of activeIds) {
    if (!enabledSet.has(activeId)) {
      await registry.disableModule(activeId);
    }
  }

  for (const id of filteredEnabledIds) {
    if (!activeIds.has(id)) {
      await registry.enableModule(id, currentCtx);
    }
  }
}

function isClassicSetupFrameContext(): boolean {
  return parseLightningUrl(window.location.pathname, window.location.search).pageType === 'setup';
}

function broadcastIframeModuleUpdate(enabledIds: string[]): void {
  const payload = {
    source: 'sfboost',
    type: IFRAME_MODULE_UPDATE_MESSAGE,
    enabledIds,
  };

  document.querySelectorAll<HTMLIFrameElement>(CLASSIC_SETUP_IFRAME_SELECTOR).forEach((iframe) => {
    try {
      iframe.contentWindow?.postMessage(payload, '*');
    } catch {
      // Best-effort relay for cross-origin setup iframes.
    }
  });
}

/**
 * Runs inside classic Setup iframes (e.g. profile/permset edit pages).
 * These iframes are cross-origin when the parent is on salesforce-setup.com,
 * so the main-frame content script cannot access their DOM via contentDocument.
 * Instead, we init iframe-compatible modules directly inside the iframe.
 */
async function initClassicSetupIframe(): Promise<void> {
  if (window.__sfBoostLoaded) return;
  window.__sfBoostLoaded = true;

  try {
    let enabledIds: string[];
    try {
      enabledIds = await getEnabledModules();
    } catch {
      enabledIds = DEFAULTS.enabledModules;
    }

    const activeIframeModules = IFRAME_MODULE_IDS.filter(id => enabledIds.includes(id));
    if (activeIframeModules.length === 0) return;

    const { hostname, href } = window.location;
    const orgInfo = detectOrgType(hostname);

    // Treat classic Setup iframes as setup pages so modules' isSetupPage() checks pass
    const pageContext: SFPageContext = {
      url: href,
      orgType: orgInfo.orgType,
      myDomain: orgInfo.myDomain,
      sandboxName: orgInfo.sandboxName,
      pageType: 'setup',
      instanceUrl: buildInstanceUrl(hostname),
    };

    const ctx = { pageContext };
    currentCtx = ctx;

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName !== 'sync' || !changes.enabledModules) return;
      const nextEnabled = Array.isArray(changes.enabledModules.newValue)
        ? changes.enabledModules.newValue
        : DEFAULTS.enabledModules;
      syncEnabledModules(nextEnabled, IFRAME_MODULE_IDS).catch((e) => {
        logger.error(`Failed to sync iframe module toggles: ${e}`);
      });
    };

    const handleRuntimeMessage = (message: { type?: string; enabledIds?: string[] }) => {
      if (message.type !== 'sfboost:update-modules') return;
      const nextEnabled = Array.isArray(message.enabledIds) ? message.enabledIds : DEFAULTS.enabledModules;
      syncEnabledModules(nextEnabled, IFRAME_MODULE_IDS).catch((e) => {
        logger.error(`Failed to apply iframe module update: ${e}`);
      });
    };

    const handleParentMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.source !== 'sfboost' || data.type !== IFRAME_MODULE_UPDATE_MESSAGE) return;

      const nextEnabled = Array.isArray(data.enabledIds) ? data.enabledIds : DEFAULTS.enabledModules;
      syncEnabledModules(nextEnabled, IFRAME_MODULE_IDS).catch((e) => {
        logger.error(`Failed to relay iframe module update: ${e}`);
      });
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    window.addEventListener('message', handleParentMessage);

    if (activeIframeModules.length > 0) {
      await registry.initModules(ctx, activeIframeModules);
      logger.debug(`Classic Setup iframe modules loaded: ${activeIframeModules.join(', ')}`);
      return;
    }

    logger.debug('Classic Setup iframe is ready for module toggles');
  } catch (e) {
    logger.error(`Classic Setup iframe init failed: ${e}`);
  }
}

export default defineContentScript({
  matches: [
    '*://*.salesforce.com/*',
    '*://*.lightning.force.com/*',
    '*://*.my.salesforce.com/*',
    '*://*.salesforce-setup.com/*',
  ],
  runAt: 'document_idle',
  allFrames: true,

  async main() {
    // Classic Setup iframes (cross-origin on salesforce-setup.com pages) —
    // run only iframe-compatible modules (e.g. bulk-check) inside the iframe.
    if (window.top !== window.self) {
      if (isSalesforceOrgHost(window.location.hostname) && isClassicSetupFrameContext()) {
        await initClassicSetupIframe();
      }
      return;
    }

    // Skip non-org Salesforce domains (help, trailhead, developer, etc.)
    if (!isSalesforceOrgHost(window.location.hostname)) return;

    // Prevent double-injection on extension reload
    if (window.__sfBoostLoaded) return;
    window.__sfBoostLoaded = true;

    let navPollInterval: ReturnType<typeof setInterval> | null = null;

    try {
      const pageContext = buildPageContext();

      let enabledIds: string[];
      try {
        enabledIds = await getEnabledModules();
      } catch {
        enabledIds = DEFAULTS.enabledModules;
      }

      const ctx = { pageContext };
      currentCtx = ctx;
      await registry.initModules(ctx, enabledIds);

      // SPA navigation detection
      let lastUrl = window.location.href;

      const checkNavigation = async () => {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) {
          lastUrl = currentUrl;
          try {
            const newCtx = { pageContext: buildPageContext() };
            currentCtx = newCtx;
            await registry.onNavigate(newCtx);
          } catch (e) {
            logger.error(`Navigation handler error: ${e}`);
          }
        }
      };

      const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
        if (areaName !== 'sync' || !changes.enabledModules) return;
      const nextEnabled = Array.isArray(changes.enabledModules.newValue)
        ? changes.enabledModules.newValue
        : DEFAULTS.enabledModules;
      syncEnabledModules(nextEnabled).catch((e) => {
        logger.error(`Failed to sync module toggles: ${e}`);
      });
      broadcastIframeModuleUpdate(nextEnabled);
    };

    const handleRuntimeMessage = (message: { type?: string; enabledIds?: string[] }) => {
      if (message.type === 'show-command-palette') {
        document.dispatchEvent(new CustomEvent('sfboost:toggle-palette'));
      } else if (message.type === 'toggle-field-inspector') {
        document.dispatchEvent(new CustomEvent('sfboost:toggle-inspector'));
      } else if (message.type === 'sfboost:update-modules') {
        const nextEnabled = Array.isArray(message.enabledIds) ? message.enabledIds : DEFAULTS.enabledModules;
        syncEnabledModules(nextEnabled).catch((e) => {
          logger.error(`Failed to apply popup module update: ${e}`);
        });
        broadcastIframeModuleUpdate(nextEnabled);
      }
    };

      // Patch History API
      const origPushState = history.pushState.bind(history);
      const origReplaceState = history.replaceState.bind(history);

      history.pushState = (...args: Parameters<typeof history.pushState>) => {
        origPushState(...args);
        checkNavigation();
      };
      history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
        origReplaceState(...args);
        checkNavigation();
      };

      window.addEventListener('popstate', checkNavigation);

      // Polling fallback — catches edge cases History API patching misses
      navPollInterval = setInterval(checkNavigation, 1000);

      chrome.storage.onChanged.addListener(handleStorageChange);
      chrome.runtime.onMessage.addListener(handleRuntimeMessage);

      // No beforeunload cleanup needed — the browser garbage-collects everything
      // on real page unload. Manual cleanup here is harmful because Salesforce
      // can fire beforeunload without actually navigating away, which would
      // destroy all listeners and leave the extension dead until reload.

      logger.debug(`Content script loaded for ${pageContext.orgType} org`);
    } catch (e) {
      logger.error(`Content script initialization failed: ${e}`);
      if (navPollInterval) clearInterval(navPollInterval);
    }
  },
});
