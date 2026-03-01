// Type-safe messaging using native Chrome API (MV3, no polyfill needed)

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
}

export type MessageType = keyof MessageMap;

export function sendMessage<T extends MessageType>(
  type: T,
  data: MessageMap[T]['data']
): Promise<MessageMap[T]['response']> {
  return chrome.runtime.sendMessage({ type, data });
}

export function onMessage<T extends MessageType>(
  type: T,
  handler: (data: MessageMap[T]['data']) => Promise<MessageMap[T]['response']>
): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === type) {
      handler(message.data)
        .then(sendResponse)
        .catch((e: Error) => sendResponse({ __error: e.message }));
      return true; // async response
    }
  });
}
