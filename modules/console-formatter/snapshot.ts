import { SNAPSHOT_META_KEY } from './constants';

export interface SnapshotOptions {
  full?: boolean;
  maxDepth?: number;
  maxArrayItems?: number;
  maxObjectKeys?: number;
}

interface ResolvedSnapshotOptions {
  maxDepth: number;
  maxArrayItems: number;
  maxObjectKeys: number;
}

interface SnapshotMeta {
  truncatedItems?: number;
  truncatedKeys?: number;
  readErrors?: number;
}

const SAFE_LIMITS: ResolvedSnapshotOptions = {
  maxDepth: 5,
  maxArrayItems: 100,
  maxObjectKeys: 60,
};

const TYPED_ARRAY_TAGS = new Set([
  '[object Int8Array]',
  '[object Uint8Array]',
  '[object Uint8ClampedArray]',
  '[object Int16Array]',
  '[object Uint16Array]',
  '[object Int32Array]',
  '[object Uint32Array]',
  '[object Float32Array]',
  '[object Float64Array]',
  '[object BigInt64Array]',
  '[object BigUint64Array]',
]);

function getObjectTag(value: unknown): string {
  return Object.prototype.toString.call(value);
}

function isDomLike(value: object): boolean {
  try {
    if (typeof Node !== 'undefined' && value instanceof Node) return true;
    if (typeof Event !== 'undefined' && value instanceof Event) return true;
  } catch {
    return false;
  }

  return false;
}

export function isBuiltinPassThrough(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return true;

  const tag = getObjectTag(value);
  if (
    tag === '[object Date]' ||
    tag === '[object RegExp]' ||
    tag === '[object Error]' ||
    tag === '[object Promise]' ||
    tag === '[object Map]' ||
    tag === '[object Set]' ||
    tag === '[object WeakMap]' ||
    tag === '[object WeakSet]' ||
    tag === '[object ArrayBuffer]' ||
    tag === '[object DataView]' ||
    tag === '[object Blob]' ||
    TYPED_ARRAY_TAGS.has(tag)
  ) {
    return true;
  }

  if (isDomLike(value)) return true;

  return false;
}

export function isSnapshotCandidate(value: unknown): boolean {
  if (value === null) return false;
  if (typeof value === 'function') return false;
  if (typeof value !== 'object') return false;
  if (isBuiltinPassThrough(value)) return false;
  return !isSnapshotValue(value);
}

export function isSnapshotValue(value: unknown): boolean {
  return Boolean(
    value &&
    typeof value === 'object' &&
    Object.prototype.hasOwnProperty.call(value, SNAPSHOT_META_KEY),
  );
}

function resolveOptions(options?: SnapshotOptions): ResolvedSnapshotOptions {
  if (options?.full) {
    return {
      maxDepth: Number.POSITIVE_INFINITY,
      maxArrayItems: Number.POSITIVE_INFINITY,
      maxObjectKeys: Number.POSITIVE_INFINITY,
    };
  }

  return {
    maxDepth: options?.maxDepth ?? SAFE_LIMITS.maxDepth,
    maxArrayItems: options?.maxArrayItems ?? SAFE_LIMITS.maxArrayItems,
    maxObjectKeys: options?.maxObjectKeys ?? SAFE_LIMITS.maxObjectKeys,
  };
}

function attachMeta<T extends object>(target: T, meta: SnapshotMeta): T {
  if (!meta.truncatedItems && !meta.truncatedKeys && !meta.readErrors) {
    return target;
  }

  Object.defineProperty(target, SNAPSHOT_META_KEY, {
    value: meta,
    enumerable: true,
    configurable: true,
    writable: true,
  });

  return target;
}

function formatCircular(path: string): string {
  return `[Circular -> ${path}]`;
}

function formatReadError(error: unknown): string {
  const message = error instanceof Error && error.message ? error.message : String(error);
  return `[ReadError: ${message}]`;
}

function formatDepthLimit(value: object): string {
  if (Array.isArray(value)) {
    return `[MaxDepth Array(${safeArrayLength(value)})]`;
  }

  const name = value.constructor?.name || 'Object';
  return `[MaxDepth ${name}]`;
}

function safeArrayLength(value: unknown): number {
  try {
    const length = Reflect.get(value as object, 'length');
    return typeof length === 'number' && Number.isFinite(length) && length >= 0 ? length : 0;
  } catch {
    return 0;
  }
}

function getEnumerableKeys(value: object): (string | symbol)[] {
  try {
    const keys = Reflect.ownKeys(value);
    return keys.filter((key) => {
      try {
        const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
        return descriptor ? descriptor.enumerable !== false : true;
      } catch {
        return true;
      }
    });
  } catch {
    const fallbackKeys: string[] = [];
    try {
      for (const key in value as Record<string, unknown>) {
        fallbackKeys.push(key);
      }
    } catch {
      return [];
    }

    return fallbackKeys;
  }
}

function snapshotAny(
  value: unknown,
  options: ResolvedSnapshotOptions,
  seen: WeakMap<object, string>,
  path: string,
  depth: number,
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'function') return value;
  if (typeof value !== 'object') return value;
  if (isBuiltinPassThrough(value)) return value;
  if (isSnapshotValue(value)) return value;

  const objectValue = value as object;
  const circularPath = seen.get(objectValue);
  if (circularPath) return formatCircular(circularPath);
  if (depth >= options.maxDepth) return formatDepthLimit(objectValue);

  seen.set(objectValue, path);

  if (Array.isArray(objectValue)) {
    return snapshotArray(objectValue, options, seen, path, depth + 1);
  }

  return snapshotObject(objectValue, options, seen, path, depth + 1);
}

function snapshotArray(
  value: unknown[],
  options: ResolvedSnapshotOptions,
  seen: WeakMap<object, string>,
  path: string,
  depth: number,
): unknown[] {
  const result: unknown[] = [];
  const meta: SnapshotMeta = {};

  const length = safeArrayLength(value);
  const limit = Math.min(length, options.maxArrayItems);

  for (let index = 0; index < limit; index += 1) {
    const itemPath = `${path}[${index}]`;
    try {
      result.push(snapshotAny(Reflect.get(value, index), options, seen, itemPath, depth));
    } catch (error) {
      meta.readErrors = (meta.readErrors ?? 0) + 1;
      result.push(formatReadError(error));
    }
  }

  if (length > limit) {
    meta.truncatedItems = length - limit;
  }

  return attachMeta(result, meta);
}

function snapshotObject(
  value: object,
  options: ResolvedSnapshotOptions,
  seen: WeakMap<object, string>,
  path: string,
  depth: number,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const meta: SnapshotMeta = {};

  const keys = getEnumerableKeys(value);
  const limit = Math.min(keys.length, options.maxObjectKeys);

  for (let index = 0; index < limit; index += 1) {
    const rawKey = keys[index]!;
    const key = typeof rawKey === 'symbol' ? rawKey.toString() : rawKey;
    const itemPath = `${path}.${key}`;

    try {
      result[key] = snapshotAny(Reflect.get(value, rawKey), options, seen, itemPath, depth);
    } catch (error) {
      meta.readErrors = (meta.readErrors ?? 0) + 1;
      result[key] = formatReadError(error);
    }
  }

  if (keys.length > limit) {
    meta.truncatedKeys = keys.length - limit;
  }

  return attachMeta(result, meta);
}

export function snapshotValue(value: unknown, options?: SnapshotOptions): unknown {
  return snapshotAny(value, resolveOptions(options), new WeakMap<object, string>(), '$', 0);
}

export function snapshotConsoleArgs(args: unknown[], options?: SnapshotOptions): unknown[] {
  return args.map((arg) => (isSnapshotCandidate(arg) ? snapshotValue(arg, options) : arg));
}
