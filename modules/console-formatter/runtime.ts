import { CONSOLE_FORMATTER_DISABLE_EVENT } from './constants';
import { isSnapshotCandidate, snapshotConsoleArgs, snapshotValue, type SnapshotOptions } from './snapshot';

export interface SFBoostConsoleApi {
  snapshot(value: unknown, options?: SnapshotOptions): unknown;
  log(...args: unknown[]): void;
  dir(labelOrValue: unknown, value?: unknown, options?: SnapshotOptions): void;
  destroy(): void;
}

type ConsoleMethod = (...args: unknown[]) => void;

interface ConsoleFormatterHost {
  console: {
    log: ConsoleMethod;
    warn: ConsoleMethod;
    error: ConsoleMethod;
    info: ConsoleMethod;
    debug: ConsoleMethod;
    table: ConsoleMethod;
    dir: ConsoleMethod;
  };
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  SFBoostConsole?: SFBoostConsoleApi;
  __sfBoostConsoleFormatterState__?: {
    disableListener: EventListener;
    api: SFBoostConsoleApi;
    originalConsole: ConsoleFormatterHost['console'];
  };
}

function makeWrapper(
  consoleHost: ConsoleFormatterHost['console'],
  originalMethod: ConsoleMethod,
  options?: SnapshotOptions,
): ConsoleMethod {
  return (...args: unknown[]) => {
    originalMethod.apply(consoleHost, snapshotConsoleArgs(args, options));
  };
}

function captureConsoleMethods(host: ConsoleFormatterHost): ConsoleFormatterHost['console'] {
  return {
    log: host.console.log,
    warn: host.console.warn,
    error: host.console.error,
    info: host.console.info,
    debug: host.console.debug,
    table: host.console.table,
    dir: host.console.dir,
  };
}

export function installConsoleFormatterRuntime(host: ConsoleFormatterHost): SFBoostConsoleApi {
  if (host.__sfBoostConsoleFormatterState__?.api) {
    return host.__sfBoostConsoleFormatterState__.api;
  }

  const originalConsole = captureConsoleMethods(host);

  const destroy = () => {
    const state = host.__sfBoostConsoleFormatterState__;
    if (!state) return;

    host.removeEventListener(CONSOLE_FORMATTER_DISABLE_EVENT, state.disableListener);
    host.console.log = state.originalConsole.log;
    host.console.warn = state.originalConsole.warn;
    host.console.error = state.originalConsole.error;
    host.console.info = state.originalConsole.info;
    host.console.debug = state.originalConsole.debug;
    host.console.table = state.originalConsole.table;
    host.console.dir = state.originalConsole.dir;
    delete host.SFBoostConsole;
    delete host.__sfBoostConsoleFormatterState__;
  };

  const api: SFBoostConsoleApi = {
    snapshot(value, options) {
      return snapshotValue(value, options);
    },
    log(...args) {
      originalConsole.log.apply(host.console, snapshotConsoleArgs(args));
    },
    dir(labelOrValue, value, options) {
      if (arguments.length === 1) {
        originalConsole.dir.apply(host.console, [
          isSnapshotCandidate(labelOrValue) ? snapshotValue(labelOrValue) : labelOrValue,
        ]);
        return;
      }

      if (typeof labelOrValue === 'string') {
        originalConsole.log.apply(host.console, [
          labelOrValue,
          isSnapshotCandidate(value) ? snapshotValue(value, options) : value,
        ]);
        return;
      }

      originalConsole.dir.apply(host.console, [
        isSnapshotCandidate(labelOrValue)
          ? snapshotValue(labelOrValue, value as SnapshotOptions | undefined)
          : labelOrValue,
      ]);
    },
    destroy,
  };

  const disableListener: EventListener = () => destroy();

  host.console.log = makeWrapper(host.console, originalConsole.log);
  host.console.warn = makeWrapper(host.console, originalConsole.warn);
  host.console.error = makeWrapper(host.console, originalConsole.error);
  host.console.info = makeWrapper(host.console, originalConsole.info);
  host.console.debug = makeWrapper(host.console, originalConsole.debug);
  host.console.table = makeWrapper(host.console, originalConsole.table);
  host.console.dir = makeWrapper(host.console, originalConsole.dir);

  host.addEventListener(CONSOLE_FORMATTER_DISABLE_EVENT, disableListener);
  host.SFBoostConsole = api;
  host.__sfBoostConsoleFormatterState__ = {
    disableListener,
    api,
    originalConsole,
  };

  return api;
}
