import { describe, expect, it } from 'vitest';
import { SNAPSHOT_META_KEY } from '../modules/console-formatter/constants';
import { snapshotValue } from '../modules/console-formatter/snapshot';

describe('console formatter snapshot', () => {
  it('snapshots nested plain objects and arrays into plain expandable values', () => {
    const source = {
      name: 'Acme',
      records: [{ id: '001', active: true }],
    };

    const snapshot = snapshotValue(source) as {
      name: string;
      records: Array<{ id: string; active: boolean }>;
    };

    expect(snapshot).toEqual({
      name: 'Acme',
      records: [{ id: '001', active: true }],
    });
    expect(snapshot).not.toBe(source);
    expect(snapshot.records).not.toBe(source.records);
  });

  it('reads proxy-backed arrays with empty targets via length and index traps', () => {
    const backing = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const proxy = new Proxy([] as Array<{ id: number }>, {
      get(_target, property) {
        if (property === 'length') return backing.length;
        if (typeof property === 'string' && /^\d+$/.test(property)) {
          return backing[Number(property)];
        }
        return Reflect.get(backing, property);
      },
    });

    const snapshot = snapshotValue(proxy) as Array<{ id: number }>;

    expect(snapshot).toEqual(backing);
    expect(snapshot).not.toBe(proxy);
  });

  it('reads proxy-backed objects via ownKeys and get traps', () => {
    const backing = {
      Name: 'Acme',
      Owner: { Name: 'Ada' },
    };

    const proxy = new Proxy({} as Record<string, unknown>, {
      get(_target, property) {
        return backing[property as keyof typeof backing];
      },
      ownKeys() {
        return Reflect.ownKeys(backing);
      },
      getOwnPropertyDescriptor(_target, property) {
        return {
          configurable: true,
          enumerable: true,
          value: backing[property as keyof typeof backing],
        };
      },
    });

    expect(snapshotValue(proxy)).toEqual(backing);
  });

  it('marks circular references instead of throwing', () => {
    const source: Record<string, unknown> = { label: 'root' };
    source.self = source;

    const snapshot = snapshotValue(source) as Record<string, unknown>;

    expect(snapshot.label).toBe('root');
    expect(snapshot.self).toBe('[Circular -> $]');
  });

  it('marks property read errors instead of failing the whole snapshot', () => {
    const source = {};
    Object.defineProperty(source, 'bad', {
      enumerable: true,
      get() {
        throw new Error('getter exploded');
      },
    });

    const snapshot = snapshotValue(source) as Record<string, unknown>;

    expect(snapshot.bad).toBe('[ReadError: getter exploded]');
  });

  it('truncates large arrays in safe mode and records meta', () => {
    const source = Array.from({ length: 105 }, (_, index) => index);
    const snapshot = snapshotValue(source) as Array<number> & {
      [SNAPSHOT_META_KEY]?: { truncatedItems?: number };
    };

    expect(snapshot).toHaveLength(100);
    expect(snapshot[0]).toBe(0);
    expect(snapshot[99]).toBe(99);
    expect(snapshot[SNAPSHOT_META_KEY]).toEqual({ truncatedItems: 5 });
  });

  it('returns full arrays when explicit full mode is requested', () => {
    const source = Array.from({ length: 105 }, (_, index) => index);
    const snapshot = snapshotValue(source, { full: true }) as Array<number> & {
      [SNAPSHOT_META_KEY]?: { truncatedItems?: number };
    };

    expect(snapshot).toHaveLength(105);
    expect(snapshot[104]).toBe(104);
    expect(snapshot[SNAPSHOT_META_KEY]).toBeUndefined();
  });

  it('passes through built-in values instead of coercing them into plain objects', () => {
    const date = new Date('2025-01-01T00:00:00Z');

    expect(snapshotValue(date)).toBe(date);
  });
});
