import { registry } from '../../modules/registry';
import { getEnabledModules, DEFAULTS } from '../../lib/storage';
import { detectOrgType, buildInstanceUrl, parseLightningUrl } from '../../lib/salesforce-urls';
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

declare global {
  interface Window { __sfBoostLoaded?: boolean; }
}

let currentCtx: { pageContext: SFPageContext } | null = null;

function buildPageContext(): SFPageContext {
  const { hostname, pathname, href } = window.location;
  const orgInfo = detectOrgType(hostname);
  const pageInfo = parseLightningUrl(pathname);
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

async function syncEnabledModules(enabledIds: string[]): Promise<void> {
  if (!currentCtx) return;

  const enabledSet = new Set(enabledIds);
  const activeIds = new Set(registry.getActive().map((mod) => mod.id));

  for (const activeId of activeIds) {
    if (!enabledSet.has(activeId)) {
      await registry.disableModule(activeId);
    }
  }

  for (const id of enabledIds) {
    if (!activeIds.has(id)) {
      await registry.enableModule(id, currentCtx);
    }
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

  async main() {
    if (window.top !== window.self) return;

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

      // Cleanup on page unload
      window.addEventListener('beforeunload', () => {
        if (navPollInterval) clearInterval(navPollInterval);
        chrome.storage.onChanged.removeListener(handleStorageChange);
        chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
        currentCtx = null;
        registry.destroyAll();
      });

      logger.debug(`Content script loaded for ${pageContext.orgType} org`);
    } catch (e) {
      logger.error(`Content script initialization failed: ${e}`);
      if (navPollInterval) clearInterval(navPollInterval);
    }
  },
});
