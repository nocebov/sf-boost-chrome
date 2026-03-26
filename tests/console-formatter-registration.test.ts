import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildConsoleFormatterContentScript,
  injectConsoleFormatterIntoTab,
  isConsoleFormatterEnabled,
  syncConsoleFormatterRegistration,
  teardownConsoleFormatterInTab,
} from '../modules/console-formatter/registration';
import { isConsoleFormatterSupportedHost } from '../modules/console-formatter/constants';

const registerContentScripts = vi.fn();
const updateContentScripts = vi.fn();
const unregisterContentScripts = vi.fn();
const executeScript = vi.fn();
const getRegisteredContentScripts = vi.fn();

(globalThis as typeof globalThis & { chrome: typeof chrome }).chrome = {
  scripting: {
    registerContentScripts,
    updateContentScripts,
    unregisterContentScripts,
    executeScript,
    getRegisteredContentScripts,
  },
} as unknown as typeof chrome;

describe('console formatter registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a document_start main-world content script definition', () => {
    expect(buildConsoleFormatterContentScript()).toEqual({
      id: 'sfboost-console-formatter-bootstrap',
      js: ['content-scripts/console-formatter-bootstrap.js'],
      matches: [
        '*://*.my.salesforce.com/*',
        '*://*.lightning.force.com/*',
        '*://*.salesforce-setup.com/*',
      ],
      runAt: 'document_start',
      world: 'MAIN',
      allFrames: false,
    });
  });

  it('registers the runtime content script when enabled and not yet registered', async () => {
    getRegisteredContentScripts.mockResolvedValue([]);

    await syncConsoleFormatterRegistration(true);

    expect(registerContentScripts).toHaveBeenCalledWith([buildConsoleFormatterContentScript()]);
    expect(updateContentScripts).not.toHaveBeenCalled();
  });

  it('updates the runtime content script when enabled and already registered', async () => {
    getRegisteredContentScripts.mockResolvedValue([{ id: 'sfboost-console-formatter-bootstrap' }]);

    await syncConsoleFormatterRegistration(true);

    expect(updateContentScripts).toHaveBeenCalledWith([buildConsoleFormatterContentScript()]);
    expect(registerContentScripts).not.toHaveBeenCalled();
  });

  it('unregisters the runtime content script when disabled', async () => {
    getRegisteredContentScripts.mockResolvedValue([{ id: 'sfboost-console-formatter-bootstrap' }]);

    await syncConsoleFormatterRegistration(false);

    expect(unregisterContentScripts).toHaveBeenCalledWith({
      ids: ['sfboost-console-formatter-bootstrap'],
    });
  });

  it('injects the bootstrap file into the active tab in MAIN world', async () => {
    await injectConsoleFormatterIntoTab(42);

    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 42 },
      files: ['content-scripts/console-formatter-bootstrap.js'],
      world: 'MAIN',
    });
  });

  it('dispatches the disable event into the active tab for teardown', async () => {
    await teardownConsoleFormatterInTab(42);

    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(executeScript.mock.calls[0]?.[0]).toMatchObject({
      target: { tabId: 42 },
      world: 'MAIN',
      args: ['sfboost:console-formatter:disable'],
    });
    expect(typeof executeScript.mock.calls[0]?.[0]?.func).toBe('function');
  });

  it('recognizes whether the module is enabled in storage', () => {
    expect(isConsoleFormatterEnabled(['console-formatter', 'quick-copy'])).toBe(true);
    expect(isConsoleFormatterEnabled(['quick-copy'])).toBe(false);
  });

  it('only supports authenticated org hosts for formatter activation', () => {
    expect(isConsoleFormatterSupportedHost('acme.my.salesforce.com')).toBe(true);
    expect(isConsoleFormatterSupportedHost('acme.lightning.force.com')).toBe(true);
    expect(isConsoleFormatterSupportedHost('acme.salesforce-setup.com')).toBe(true);
    expect(isConsoleFormatterSupportedHost('na123.salesforce.com')).toBe(false);
    expect(isConsoleFormatterSupportedHost('help.salesforce.com')).toBe(false);
  });
});
