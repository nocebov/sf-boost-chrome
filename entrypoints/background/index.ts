import { onMessage } from '../../lib/messaging';
import { getSessionFromCookie, clearSessionCache } from './session-manager';
import { migrateStorage } from '../../lib/storage';
import { logger } from '../../lib/logger';
import { describeObject, executeSOQL, executeSOQLAll, executeToolingQueryAll, createPermissionSet, toggleDebugLog } from './api-client';
import { buildInstanceUrl } from '../../lib/salesforce-urls';
import { assertAllowedSalesforceInstanceUrl, isAllowedSalesforceDomain } from '../../lib/salesforce-utils';

function isAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /\b(401|403)\b/.test(error.message) || /unauthorized|forbidden/i.test(error.message);
}

async function withSession<T>(
  instanceUrl: string,
  action: (sessionId: string) => Promise<T>,
): Promise<T> {
  const session = await getSessionFromCookie(instanceUrl);
  if (!session) {
    throw new Error('No active Salesforce session. Please refresh the page and try again.');
  }

  try {
    return await action(session.sessionId);
  } catch (error) {
    if (!isAuthError(error)) {
      throw error;
    }

    clearSessionCache(instanceUrl);
    const refreshedSession = await getSessionFromCookie(instanceUrl);
    if (!refreshedSession) {
      throw new Error('Salesforce session expired. Please refresh the page and try again.');
    }

    return action(refreshedSession.sessionId);
  }
}

function getSenderSalesforcePageUrl(sender: chrome.runtime.MessageSender): URL | null {
  const candidates = [sender.tab?.url, sender.url, sender.origin].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (isAllowedSalesforceDomain(url.hostname)) {
        return url;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function assertSenderMatchesInstanceUrl(
  sender: chrome.runtime.MessageSender,
  instanceUrl: string,
): string {
  const normalizedInstanceUrl = assertAllowedSalesforceInstanceUrl(instanceUrl, 'instance URL');
  const senderUrl = getSenderSalesforcePageUrl(sender);
  if (!senderUrl) {
    throw new Error('Salesforce page context is required for this action');
  }

  const expectedInstanceUrl = assertAllowedSalesforceInstanceUrl(
    buildInstanceUrl(senderUrl.hostname),
    'instance URL',
  );

  if (expectedInstanceUrl !== normalizedInstanceUrl) {
    throw new Error('Requested instance URL does not match the active Salesforce org');
  }

  return normalizedInstanceUrl;
}

export default defineBackground(() => {
  // Run storage migrations on install/update
  chrome.runtime.onInstalled.addListener(() => {
    migrateStorage().catch(e => logger.error(`Storage migration failed: ${e}`));
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== 'updateBadge' || sender.id !== chrome.runtime.id || !sender.tab?.id) {
      return;
    }

    const text = typeof message.data?.text === 'string' ? message.data.text : '';
    const color = typeof message.data?.color === 'string' ? message.data.color : '#6b7280';

    Promise.all([
      chrome.action.setBadgeText({ tabId: sender.tab.id, text }),
      text ? chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color }) : Promise.resolve(),
    ])
      .then(() => sendResponse({ ok: true }))
      .catch((e: Error) => sendResponse({ __error: e.message }));

    return true;
  });

  // Handle session requests
  onMessage('getSession', async (data, sender) => {
    return getSessionFromCookie(assertSenderMatchesInstanceUrl(sender, data.instanceUrl));
  });

  // Handle describe object requests
  onMessage('describeObject', async (data, sender) => {
    const instanceUrl = assertSenderMatchesInstanceUrl(sender, data.instanceUrl);
    return withSession(instanceUrl, (sessionId) =>
      describeObject(instanceUrl, sessionId, data.objectApiName),
    );
  });

  // Handle SOQL query requests
  onMessage('executeSOQL', async (data, sender) => {
    const instanceUrl = assertSenderMatchesInstanceUrl(sender, data.instanceUrl);
    return withSession(instanceUrl, (sessionId) =>
      executeSOQL(instanceUrl, sessionId, data.query),
    );
  });

  // Handle SOQL query all requests
  onMessage('executeSOQLAll', async (data, sender) => {
    const instanceUrl = assertSenderMatchesInstanceUrl(sender, data.instanceUrl);
    return withSession(instanceUrl, (sessionId) =>
      executeSOQLAll(instanceUrl, sessionId, data.query),
    );
  });

  // Handle Tooling API query requests
  onMessage('executeToolingQuery', async (data, sender) => {
    const instanceUrl = assertSenderMatchesInstanceUrl(sender, data.instanceUrl);
    return withSession(instanceUrl, (sessionId) =>
      executeToolingQueryAll(instanceUrl, sessionId, data.query),
    );
  });

  // Handle debug log toggle
  onMessage('toggleDebugLog', async (data, sender) => {
    const instanceUrl = assertSenderMatchesInstanceUrl(sender, data.instanceUrl);
    return withSession(instanceUrl, (sessionId) =>
      toggleDebugLog(instanceUrl, sessionId),
    );
  });

  // Handle Permission Set creation via long-lived port (keeps service worker alive during long operations)
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'createPermissionSet') return;

    port.onMessage.addListener(async (msg: { data: any }) => {
      const safeSend = (payload: object) => { try { port.postMessage(payload); } catch { } };
      try {
        const { instanceUrl: requestedInstanceUrl, ...payload } = msg.data;
        const sender = port.sender;
        if (!sender) {
          safeSend({ type: 'error', error: 'Connection has no sender' });
          return;
        }
        const instanceUrl = assertSenderMatchesInstanceUrl(sender, requestedInstanceUrl);
        const result = await withSession(instanceUrl, (sessionId) =>
          createPermissionSet(instanceUrl, sessionId, payload, (progressMsg) => {
            safeSend({ type: 'progress', message: progressMsg });
          }),
        );
        safeSend({ type: 'complete', result });
      } catch (e) {
        safeSend({ type: 'error', error: e instanceof Error ? e.message : 'Unknown error' });
      }
    });
  });

  // Handle command palette keyboard shortcut
  chrome.commands.onCommand.addListener(async (command: string) => {
    if (command === 'show-command-palette' || command === 'toggle-field-inspector') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: command });
      }
    }
  });

  logger.info('Background service worker started');
});
