import { onMessage } from '../../lib/messaging';
import { getSessionFromCookie } from './session-manager';
import { describeObject, executeSOQL, executeToolingQueryAll, createPermissionSet } from './api-client';

export default defineBackground(() => {
  // Handle session requests
  onMessage('getSession', async (data) => {
    return getSessionFromCookie(data.instanceUrl);
  });

  // Handle describe object requests
  onMessage('describeObject', async (data) => {
    const session = await getSessionFromCookie(data.instanceUrl);
    if (!session) throw new Error('No active Salesforce session');
    return describeObject(data.instanceUrl, session.sessionId, data.objectApiName);
  });

  // Handle SOQL query requests
  onMessage('executeSOQL', async (data) => {
    const session = await getSessionFromCookie(data.instanceUrl);
    if (!session) throw new Error('No active Salesforce session');
    return executeSOQL(data.instanceUrl, session.sessionId, data.query);
  });

  // Handle Tooling API query requests
  onMessage('executeToolingQuery', async (data) => {
    const session = await getSessionFromCookie(data.instanceUrl);
    if (!session) throw new Error('No active Salesforce session');
    return executeToolingQueryAll(data.instanceUrl, session.sessionId, data.query);
  });

  // Handle Permission Set creation requests
  onMessage('createPermissionSet', async (data) => {
    const session = await getSessionFromCookie(data.instanceUrl);
    if (!session) throw new Error('No active Salesforce session');
    return createPermissionSet(data.instanceUrl, session.sessionId, data);
  });

  // Handle command palette keyboard shortcut
  chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'show-command-palette' || command === 'toggle-field-inspector') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: command });
      }
    }
  });

  console.log('[SF Boost] Background service worker started');
});
