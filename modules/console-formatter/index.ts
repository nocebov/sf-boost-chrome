import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';
import {
  CONSOLE_FORMATTER_ACTIVATE_MESSAGE,
  CONSOLE_FORMATTER_DEACTIVATE_MESSAGE,
  CONSOLE_FORMATTER_MODULE_ID,
  isConsoleFormatterSupportedHost,
} from './constants';

async function notifyBackground(type: string): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type });
  } catch (error) {
    console.warn('[SF Boost] Console Formatter background sync failed:', error);
  }
}

const consoleFormatter: SFBoostModule = {
  id: CONSOLE_FORMATTER_MODULE_ID,
  name: 'Console Formatter',
  description: 'Readable console snapshots for Salesforce proxy values',

  async init(_ctx: ModuleContext) {
    if (!isConsoleFormatterSupportedHost(window.location.hostname)) return;
    await notifyBackground(CONSOLE_FORMATTER_ACTIVATE_MESSAGE);
  },

  async onNavigate(_ctx: ModuleContext) {
    // The page-level runtime survives SPA navigation; no action needed.
  },

  destroy() {
    if (!isConsoleFormatterSupportedHost(window.location.hostname)) return;
    void notifyBackground(CONSOLE_FORMATTER_DEACTIVATE_MESSAGE);
  },
};

registry.register(consoleFormatter);
