import { describe, expect, it, vi } from 'vitest';
import { CONSOLE_FORMATTER_DISABLE_EVENT } from '../modules/console-formatter/constants';
import { installConsoleFormatterRuntime } from '../modules/console-formatter/runtime';

class TestHost extends EventTarget {
  console = {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    table: vi.fn(),
    dir: vi.fn(),
  };

  SFBoostConsole?: ReturnType<typeof installConsoleFormatterRuntime>;
  __sfBoostConsoleFormatterState__?: {
    disableListener: EventListener;
    api: ReturnType<typeof installConsoleFormatterRuntime>;
    originalConsole: TestHost['console'];
  };
}

describe('console formatter runtime', () => {
  it('wraps console methods and snapshots proxy-like values', () => {
    const host = new TestHost();
    const backing = [{ id: 1 }, { id: 2 }];
    const proxy = new Proxy([] as Array<{ id: number }>, {
      get(_target, property) {
        if (property === 'length') return backing.length;
        if (typeof property === 'string' && /^\d+$/.test(property)) {
          return backing[Number(property)];
        }
        return Reflect.get(backing, property);
      },
    });

    installConsoleFormatterRuntime(host);
    host.console.log('rows', proxy);

    expect(host.SFBoostConsole).toBeDefined();
    expect(host.console.log).not.toBe(host.__sfBoostConsoleFormatterState__?.originalConsole.log);
    expect(host.__sfBoostConsoleFormatterState__?.originalConsole.log).toHaveBeenCalledWith('rows', backing);
  });

  it('leaves primitive arguments untouched', () => {
    const host = new TestHost();
    installConsoleFormatterRuntime(host);

    host.console.info('count', 7, true);

    expect(host.__sfBoostConsoleFormatterState__?.originalConsole.info).toHaveBeenCalledWith('count', 7, true);
  });

  it('exposes a helper namespace for explicit snapshots', () => {
    const host = new TestHost();
    installConsoleFormatterRuntime(host);

    const result = host.SFBoostConsole?.snapshot(Array.from({ length: 101 }, (_, index) => index), { full: true }) as number[];

    expect(host.SFBoostConsole).toBeDefined();
    expect(result).toHaveLength(101);
    expect(result[100]).toBe(100);
  });

  it('restores the original console and removes helpers on disable', () => {
    const host = new TestHost();
    const originalLog = host.console.log;

    installConsoleFormatterRuntime(host);
    host.dispatchEvent(new Event(CONSOLE_FORMATTER_DISABLE_EVENT));

    expect(host.console.log).toBe(originalLog);
    expect(host.SFBoostConsole).toBeUndefined();
    expect(host.__sfBoostConsoleFormatterState__).toBeUndefined();
  });
});
