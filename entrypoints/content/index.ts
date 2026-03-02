import { registry } from '../../modules/registry';
import { getEnabledModules } from '../../lib/storage';
import { detectOrgType, buildInstanceUrl, parseLightningUrl } from '../../lib/salesforce-urls';
import type { SFPageContext } from '../../modules/types';

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

export default defineContentScript({
  matches: [
    '*://*.salesforce.com/*',
    '*://*.lightning.force.com/*',
    '*://*.my.salesforce.com/*',
    '*://*.salesforce-setup.com/*',
  ],
  allFrames: true,
  runAt: 'document_idle',

  async main() {
    // Prevent double-injection on extension reload
    if (window.__sfBoostLoaded) return;
    window.__sfBoostLoaded = true;

    const pageContext = buildPageContext();
    const enabledIds = await getEnabledModules();
    const ctx = { pageContext };

    await registry.initModules(ctx, enabledIds);

    // SPA navigation detection
    let lastUrl = window.location.href;

    const checkNavigation = async () => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        const newCtx = { pageContext: buildPageContext() };
        await registry.onNavigate(newCtx);
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
    setInterval(checkNavigation, 1000);

    // Listen for background commands
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'show-command-palette') {
        document.dispatchEvent(new CustomEvent('sfboost:toggle-palette'));
      } else if (message.type === 'toggle-field-inspector') {
        document.dispatchEvent(new CustomEvent('sfboost:toggle-inspector'));
      }
    });

    console.log('[SF Boost] Content script loaded for', pageContext.orgType, 'org');
  },
});
