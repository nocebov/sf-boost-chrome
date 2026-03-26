import {
  CONSOLE_FORMATTER_BOOTSTRAP_SCRIPT_FILE,
  CONSOLE_FORMATTER_BOOTSTRAP_SCRIPT_ID,
  CONSOLE_FORMATTER_DISABLE_EVENT,
  CONSOLE_FORMATTER_MATCHES,
  CONSOLE_FORMATTER_MODULE_ID,
} from './constants';

export function isConsoleFormatterEnabled(enabledIds: string[]): boolean {
  return enabledIds.includes(CONSOLE_FORMATTER_MODULE_ID);
}

export function buildConsoleFormatterContentScript(): chrome.scripting.RegisteredContentScript {
  return {
    id: CONSOLE_FORMATTER_BOOTSTRAP_SCRIPT_ID,
    js: [CONSOLE_FORMATTER_BOOTSTRAP_SCRIPT_FILE],
    matches: CONSOLE_FORMATTER_MATCHES,
    runAt: 'document_start',
    world: 'MAIN',
    allFrames: false,
  };
}

export async function syncConsoleFormatterRegistration(enabled: boolean): Promise<void> {
  const existing = await chrome.scripting.getRegisteredContentScripts({
    ids: [CONSOLE_FORMATTER_BOOTSTRAP_SCRIPT_ID],
  });

  if (enabled) {
    const contentScript = buildConsoleFormatterContentScript();
    if (existing.length > 0) {
      await chrome.scripting.updateContentScripts([contentScript]);
    } else {
      await chrome.scripting.registerContentScripts([contentScript]);
    }
    return;
  }

  if (existing.length > 0) {
    await chrome.scripting.unregisterContentScripts({
      ids: [CONSOLE_FORMATTER_BOOTSTRAP_SCRIPT_ID],
    });
  }
}

export async function injectConsoleFormatterIntoTab(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [CONSOLE_FORMATTER_BOOTSTRAP_SCRIPT_FILE],
    world: 'MAIN',
  });
}

export async function teardownConsoleFormatterInTab(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (eventName: string) => {
      window.dispatchEvent(new Event(eventName));
    },
    args: [CONSOLE_FORMATTER_DISABLE_EVENT],
  });
}
