import { onMessage } from '../../lib/messaging';
import { getSessionFromCookie, clearSessionCache } from './session-manager';
import {
  DEFAULTS,
  getEnabledModules,
  migrateStorage,
  clearOwnedDebugTraceFlagId,
  getOwnedDebugTraceFlagId,
  setOwnedDebugTraceFlagId,
} from '../../lib/storage';
import { logger } from '../../lib/logger';
import { getEmailTemplateApprovals } from './approval-template-usage';
import { describeObject, executeSOQL, executeSOQLAll, executeToolingQueryAll, createPermissionSet, toggleDebugLog, getOrgLimits } from './api-client';
import { buildInstanceUrl } from '../../lib/salesforce-urls';
import { assertAllowedSalesforceInstanceUrl, isAllowedSalesforceDomain } from '../../lib/salesforce-utils';
import {
  CONSOLE_FORMATTER_ACTIVATE_MESSAGE,
  CONSOLE_FORMATTER_DEACTIVATE_MESSAGE,
  isConsoleFormatterSupportedHost,
} from '../../modules/console-formatter/constants';
import {
  injectConsoleFormatterIntoTab,
  isConsoleFormatterEnabled,
  syncConsoleFormatterRegistration,
  teardownConsoleFormatterInTab,
} from '../../modules/console-formatter/registration';

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

async function syncConsoleFormatterRegistrationFromStorage(): Promise<void> {
  const enabledIds = await getEnabledModules();
  await syncConsoleFormatterRegistration(isConsoleFormatterEnabled(enabledIds));
}

export default defineBackground(() => {
  // Run storage migrations on install/update
  chrome.runtime.onInstalled.addListener(() => {
    migrateStorage().catch(e => logger.error(`Storage migration failed: ${e}`));
    syncConsoleFormatterRegistrationFromStorage().catch((e) => {
      logger.error(`Console Formatter registration sync failed: ${e}`);
    });
  });

  syncConsoleFormatterRegistrationFromStorage().catch((e) => {
    logger.error(`Initial Console Formatter registration sync failed: ${e}`);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' || !changes.enabledModules) return;

    const nextEnabled = Array.isArray(changes.enabledModules.newValue)
      ? changes.enabledModules.newValue
      : DEFAULTS.enabledModules;

    syncConsoleFormatterRegistration(isConsoleFormatterEnabled(nextEnabled)).catch((e) => {
      logger.error(`Console Formatter registration update failed: ${e}`);
    });
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return;

    if (message.type === CONSOLE_FORMATTER_ACTIVATE_MESSAGE && sender.tab?.id) {
      const senderUrl = getSenderSalesforcePageUrl(sender);
      if (!senderUrl || !isConsoleFormatterSupportedHost(senderUrl.hostname)) {
        sendResponse({ ok: true, skipped: true });
        return true;
      }
      injectConsoleFormatterIntoTab(sender.tab.id)
        .then(() => sendResponse({ ok: true }))
        .catch((e: Error) => sendResponse({ __error: e.message }));
      return true;
    }

    if (message.type === CONSOLE_FORMATTER_DEACTIVATE_MESSAGE && sender.tab?.id) {
      const senderUrl = getSenderSalesforcePageUrl(sender);
      if (!senderUrl || !isConsoleFormatterSupportedHost(senderUrl.hostname)) {
        sendResponse({ ok: true, skipped: true });
        return true;
      }
      teardownConsoleFormatterInTab(sender.tab.id)
        .then(() => sendResponse({ ok: true }))
        .catch((e: Error) => sendResponse({ __error: e.message }));
      return true;
    }

    if (message.type === 'sfboost:sync-iframe-modules' && sender.tab?.id) {
      const enabledIds = Array.isArray(message.enabledIds) ? message.enabledIds : DEFAULTS.enabledModules;
      chrome.scripting.executeScript({
        target: { tabId: sender.tab.id, allFrames: true },
        func: (eventName: string, ids: string[]) => {
          window.dispatchEvent(new CustomEvent(eventName, { detail: ids }));
        },
        args: ['sfboost:iframe-module-update', enabledIds],
      })
        .then(() => sendResponse({ ok: true }))
        .catch((e: Error) => sendResponse({ __error: e.message }));
      return true;
    }

    if (message.type !== 'updateBadge' || !sender.tab?.id) {
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

  // Read-only Classic Approval Process assignment-template references.
  onMessage('getEmailTemplateApprovals', async (data, sender) => {
    const instanceUrl = assertSenderMatchesInstanceUrl(sender, data.instanceUrl);
    return withSession(instanceUrl, (sessionId) =>
      getEmailTemplateApprovals(instanceUrl, sessionId, data.templateId),
    );
  });

  // Handle org limits request
  onMessage('getOrgLimits', async (data, sender) => {
    const instanceUrl = assertSenderMatchesInstanceUrl(sender, data.instanceUrl);
    return withSession(instanceUrl, (sessionId) =>
      getOrgLimits(instanceUrl, sessionId),
    );
  });

  // Handle debug log toggle
  onMessage('toggleDebugLog', async (data, sender) => {
    const instanceUrl = assertSenderMatchesInstanceUrl(sender, data.instanceUrl);
    const ownedTraceFlagId = await getOwnedDebugTraceFlagId(instanceUrl);
    const result = await withSession(instanceUrl, (sessionId) =>
      toggleDebugLog(instanceUrl, sessionId, ownedTraceFlagId),
    );
    if (result.traceFlagId) {
      await setOwnedDebugTraceFlagId(instanceUrl, result.traceFlagId);
    } else if (result.removedOwnedTraceFlag || (ownedTraceFlagId && result.blockedByExistingLog)) {
      // A stored ID that is no longer active must not make a later external
      // TraceFlag look extension-owned.
      await clearOwnedDebugTraceFlagId(instanceUrl);
    }
    return result;
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
          createPermissionSet(instanceUrl, sessionId, payload, (progressMsg, completedItems, totalItems) => {
            safeSend({ type: 'progress', message: progressMsg, completedItems, totalItems });
          }),
        );
        safeSend({ type: 'complete', result });
      } catch (e) {
        safeSend({ type: 'error', error: e instanceof Error ? e.message : 'Unknown error' });
      }
    });
  });

  // Handle command palette keyboard shortcut
  const COMMAND_EVENT_MAP: Record<string, string> = {
    'show-command-palette': 'sfboost:toggle-palette',
    'toggle-field-inspector': 'sfboost:toggle-inspector',
  };

  chrome.commands.onCommand.addListener(async (command: string) => {
    const eventName = COMMAND_EVENT_MAP[command];
    if (!eventName) return;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    try {
      await chrome.tabs.sendMessage(tab.id, { type: command });
    } catch {
      // Content script message channel unavailable — dispatch event directly
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (name: string) => document.dispatchEvent(new CustomEvent(name)),
          args: [eventName],
        });
      } catch (e) {
        logger.warn(`Failed to deliver command "${command}": ${e}`);
      }
    }
  });

  logger.info('Background service worker started');
});
