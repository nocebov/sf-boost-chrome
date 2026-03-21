// Type-safe messaging using native Chrome API (MV3, no polyfill needed)
import { assertAllowedSalesforceInstanceUrl, isAllowedSalesforceDomain } from './salesforce-utils';

export interface MessageMap {
  getSession: {
    data: { instanceUrl: string };
    response: { sessionId: string } | null;
  };
  describeObject: {
    data: { instanceUrl: string; objectApiName: string };
    response: any;
  };
  executeSOQL: {
    data: { instanceUrl: string; query: string };
    response: any;
  };
  executeSOQLAll: {
    data: { instanceUrl: string; query: string };
    response: any;
  };
  executeToolingQuery: {
    data: { instanceUrl: string; query: string };
    response: any;
  };
  toggleDebugLog: {
    data: { instanceUrl: string };
    response: { active: boolean; expirationDate?: string };
  };
  getOrgLimits: {
    data: { instanceUrl: string };
    response: Record<string, { Max: number; Remaining: number }>;
  };
  createPermissionSet: {
    data: {
      instanceUrl: string;
      name: string;
      label: string;
      objectPermissions: Array<{
        object: string;
        allowRead: boolean;
        allowCreate: boolean;
        allowEdit: boolean;
        allowDelete: boolean;
        viewAllRecords: boolean;
        modifyAllRecords: boolean;
      }>;
      fieldPermissions: Array<{
        field: string;
        sobjectType: string;
        readable: boolean;
        editable: boolean;
      }>;
      userPermissions: Array<{ name: string }>;
      tabSettings: Array<{ name: string; visibility: string }>;
      setupEntityAccess: Array<{ entityId: string; entityType: string }>;
    };
    response: {
      id: string;
      success: boolean;
      rolledBack: boolean;
      failures: Array<{ type: string; name: string; error: string }>;
      warnings: Array<{ type: string; name: string; error: string }>;
      applied?: Array<{ type: string; name: string; detail: string }>;
      stats?: {
        objects: { requested: number; applied: number; duplicates: number; autoAdded: number };
        fields: { requested: number; validated: number; applied: number; duplicates: number };
        userPermissions: { requested: number; applied: number; failed: number };
        tabs: { requested: number; applied: number; duplicates: number };
        setupEntityAccess: { requested: number; applied: number; duplicates: number };
      };
    };
  };
}

export type MessageType = keyof MessageMap;

function normalizeMessageData<T extends MessageType>(data: MessageMap[T]['data']): MessageMap[T]['data'] {
  if (!data || typeof data !== 'object' || !('instanceUrl' in data)) {
    return data;
  }

  const instanceUrl = (data as { instanceUrl?: unknown }).instanceUrl;
  if (typeof instanceUrl !== 'string') {
    throw new Error('Missing Salesforce instance URL');
  }

  return {
    ...data,
    instanceUrl: assertAllowedSalesforceInstanceUrl(instanceUrl),
  } as MessageMap[T]['data'];
}

export async function sendMessage<T extends MessageType>(
  type: T,
  data: MessageMap[T]['data']
): Promise<MessageMap[T]['response']> {
  const response = await chrome.runtime.sendMessage({ type, data: normalizeMessageData(data) });
  if (response && typeof response === 'object' && '__error' in response) {
    throw new Error(response.__error);
  }
  return response;
}

export function createPermissionSetViaPort(
  data: MessageMap['createPermissionSet']['data'],
  onProgress: (message: string, completedItems?: number, totalItems?: number) => void,
): Promise<MessageMap['createPermissionSet']['response']> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const port = chrome.runtime.connect({ name: 'createPermissionSet' });

    port.onMessage.addListener((msg: {
      type: 'progress' | 'complete' | 'error';
      message?: string;
      completedItems?: number;
      totalItems?: number;
      result?: MessageMap['createPermissionSet']['response'];
      error?: string;
    }) => {
      if (msg.type === 'progress' && msg.message) {
        onProgress(msg.message, msg.completedItems, msg.totalItems);
      } else if (msg.type === 'complete' && !settled) {
        settled = true;
        resolve(msg.result!);
        port.disconnect();
      } else if (msg.type === 'error' && !settled) {
        settled = true;
        reject(new Error(msg.error));
        port.disconnect();
      }
    });

    port.onDisconnect.addListener(() => {
      if (!settled) {
        settled = true;
        reject(new Error(
          chrome.runtime.lastError?.message ||
          'Background service worker disconnected unexpectedly',
        ));
      }
    });

    try {
      port.postMessage({ data: normalizeMessageData<'createPermissionSet'>(data) });
    } catch (e) {
      settled = true;
      port.disconnect();
      reject(e);
    }
  });
}

function isTrustedSender(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id && sender.id !== chrome.runtime.id) return false;
  if (sender.id === chrome.runtime.id && !sender.url && !sender.origin && !sender.tab?.url) {
    return true;
  }

  const candidates = [sender.url, sender.origin, sender.tab?.url].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      // Allow extension pages
      if (url.protocol === 'chrome-extension:' && sender.id === chrome.runtime.id) return true;
      // Allow only Salesforce domains
      if (isAllowedSalesforceDomain(url.hostname)) return true;
    } catch {
      continue;
    }
  }

  return sender.id === chrome.runtime.id;
}

export function onMessage<T extends MessageType>(
  type: T,
  handler: (data: MessageMap[T]['data'], sender: chrome.runtime.MessageSender) => Promise<MessageMap[T]['response']>
): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === type) {
      if (!isTrustedSender(sender)) {
        sendResponse({ __error: 'Untrusted sender origin' });
        return true;
      }
      let normalizedData: MessageMap[T]['data'];
      try {
        normalizedData = normalizeMessageData(message.data);
      } catch (error) {
        const messageText = error instanceof Error ? error.message : 'Invalid message payload';
        sendResponse({ __error: messageText });
        return true;
      }
      handler(normalizedData, sender)
        .then(sendResponse)
        .catch((e: Error) => sendResponse({ __error: e.message }));
      return true; // async response
    }
  });
}
