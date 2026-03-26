export const CONSOLE_FORMATTER_MODULE_ID = 'console-formatter';

export const CONSOLE_FORMATTER_DISABLE_EVENT = 'sfboost:console-formatter:disable';

export const CONSOLE_FORMATTER_ACTIVATE_MESSAGE = 'sfboost:console-formatter:activate';
export const CONSOLE_FORMATTER_DEACTIVATE_MESSAGE = 'sfboost:console-formatter:deactivate';

export const CONSOLE_FORMATTER_BOOTSTRAP_SCRIPT_ID = 'sfboost-console-formatter-bootstrap';
export const CONSOLE_FORMATTER_BOOTSTRAP_SCRIPT_FILE = 'content-scripts/console-formatter-bootstrap.js';

export const CONSOLE_FORMATTER_MATCHES = [
  '*://*.my.salesforce.com/*',
  '*://*.lightning.force.com/*',
  '*://*.salesforce-setup.com/*',
];

export function isConsoleFormatterSupportedHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized.endsWith('.my.salesforce.com') ||
    normalized.endsWith('.lightning.force.com') ||
    normalized.endsWith('.salesforce-setup.com')
  );
}

export const SNAPSHOT_META_KEY = '__sfboostMeta';
