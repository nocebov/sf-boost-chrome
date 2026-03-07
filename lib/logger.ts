/**
 * Structured logging with sensitive data redaction.
 * Stores recent errors in chrome.storage.local for diagnostics.
 */

const MAX_STORED_ERRORS = 50;
const PREFIX = '[SF Boost]';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface StoredError {
  timestamp: number;
  level: LogLevel;
  message: string;
  module?: string;
}

function sanitize(message: string): string {
  // Redact anything that looks like a session ID (long alphanumeric token)
  return message.replace(/\b[a-zA-Z0-9!]{20,}\b/g, '[REDACTED]');
}

export const logger = {
  debug(message: string, ...args: unknown[]) {
    console.debug(`${PREFIX} ${message}`, ...args);
  },

  info(message: string, ...args: unknown[]) {
    console.info(`${PREFIX} ${message}`, ...args);
  },

  warn(message: string, module?: string) {
    const safe = sanitize(message);
    console.warn(`${PREFIX} ${safe}`);
    storeError('warn', safe, module);
  },

  error(message: string, module?: string) {
    const safe = sanitize(message);
    console.error(`${PREFIX} ${safe}`);
    storeError('error', safe, module);
  },
};

async function storeError(level: LogLevel, message: string, module?: string): Promise<void> {
  try {
    const result = await chrome.storage.local.get('sfboostErrors');
    const errors: StoredError[] = (Array.isArray(result.sfboostErrors) ? result.sfboostErrors : []) as StoredError[];
    errors.push({ timestamp: Date.now(), level, message, module });

    // Keep only the most recent errors
    if (errors.length > MAX_STORED_ERRORS) {
      errors.splice(0, errors.length - MAX_STORED_ERRORS);
    }

    await chrome.storage.local.set({ sfboostErrors: errors });
  } catch {
    // Storage unavailable — silently ignore
  }
}
