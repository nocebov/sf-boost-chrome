import { getCachedDescribe, setCachedDescribe } from '../../lib/storage';
import { logger } from '../../lib/logger';

const API_VERSION = 'v63.0';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const MAX_PAGINATION_RECORDS = 50_000;
const RETRYABLE_STATUSES = new Set([408, 429, 503]);

// --- Fetch with retry & timeout ---

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = MAX_RETRIES,
): Promise<Response> {
  const method = (options.method ?? 'GET').toUpperCase();
  const safeToRetry = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
  const totalAttempts = safeToRetry ? maxRetries : 1;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });

      if (response.ok || !RETRYABLE_STATUSES.has(response.status) || attempt === totalAttempts - 1) {
        return response;
      }

      // Retryable status — wait with exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(r => setTimeout(r, delay));
    } catch (e: any) {
      lastError = e;
      if (e.name === 'AbortError') {
        lastError = new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`);
      }
      if (attempt === totalAttempts - 1) break;
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(r => setTimeout(r, delay));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError ?? new Error('Request failed after retries');
}

function authHeaders(sessionId: string): Record<string, string> {
  return {
    Authorization: `Bearer ${sessionId}`,
    'Content-Type': 'application/json',
  };
}

// --- Request deduplication ---

const inflightRequests = new Map<string, Promise<any>>();

async function dedup<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inflightRequests.get(key);
  if (existing) return existing as Promise<T>;

  const promise = factory().finally(() => { inflightRequests.delete(key); });
  inflightRequests.set(key, promise);
  return promise;
}

// --- API functions ---

export async function describeObject(
  instanceUrl: string,
  sessionId: string,
  objectApiName: string,
): Promise<any> {
  const cacheKey = `${instanceUrl}:${objectApiName}`;
  const cached = await getCachedDescribe(cacheKey);
  if (cached) return cached;

  return dedup(`describe:${cacheKey}`, async () => {
    const url = `${instanceUrl}/services/data/${API_VERSION}/sobjects/${encodeURIComponent(objectApiName)}/describe/`;
    const response = await fetchWithRetry(url, { headers: authHeaders(sessionId) });

    if (!response.ok) {
      throw new Error(`Describe failed (${response.status})`);
    }

    const data = await response.json();
    await setCachedDescribe(cacheKey, data);
    return data;
  });
}

export async function executeSOQL(
  instanceUrl: string,
  sessionId: string,
  query: string,
): Promise<any> {
  const url = `${instanceUrl}/services/data/${API_VERSION}/query/?q=${encodeURIComponent(query)}`;
  const response = await fetchWithRetry(url, { headers: authHeaders(sessionId) });

  if (!response.ok) {
    throw new Error(`SOQL query failed (${response.status})`);
  }

  return response.json();
}

export async function executeSOQLAll(
  instanceUrl: string,
  sessionId: string,
  query: string,
): Promise<any> {
  let result = await executeSOQL(instanceUrl, sessionId, query);
  const allRecords = [...result.records];

  while (result.nextRecordsUrl?.trim()) {
    if (allRecords.length >= MAX_PAGINATION_RECORDS) {
      logger.warn(`Pagination limit reached (${MAX_PAGINATION_RECORDS} records). Truncating results.`);
      break;
    }

    const nextUrl = `${instanceUrl}${result.nextRecordsUrl}`;
    const response = await fetchWithRetry(nextUrl, { headers: authHeaders(sessionId) });
    if (!response.ok) {
      throw new Error(`SOQL pagination failed (${response.status})`);
    }
    result = await response.json();
    allRecords.push(...(result.records ?? []));
  }

  return { ...result, records: allRecords, done: true };
}

export async function executeToolingQuery(
  instanceUrl: string,
  sessionId: string,
  query: string,
): Promise<any> {
  const url = `${instanceUrl}/services/data/${API_VERSION}/tooling/query/?q=${encodeURIComponent(query)}`;
  const response = await fetchWithRetry(url, { headers: authHeaders(sessionId) });

  if (!response.ok) {
    throw new Error(`Tooling query failed (${response.status})`);
  }

  return response.json();
}

export async function executeToolingQueryAll(
  instanceUrl: string,
  sessionId: string,
  query: string,
): Promise<any> {
  let result = await executeToolingQuery(instanceUrl, sessionId, query);
  const allRecords = [...result.records];

  while (result.nextRecordsUrl?.trim()) {
    if (allRecords.length >= MAX_PAGINATION_RECORDS) {
      logger.warn(`Tooling pagination limit reached (${MAX_PAGINATION_RECORDS} records). Truncating results.`);
      break;
    }

    const nextUrl = `${instanceUrl}${result.nextRecordsUrl}`;
    const response = await fetchWithRetry(nextUrl, { headers: authHeaders(sessionId) });
    if (!response.ok) {
      throw new Error(`Tooling pagination failed (${response.status})`);
    }
    result = await response.json();
    allRecords.push(...(result.records ?? []));
  }

  return { ...result, records: allRecords, done: true };
}

// --- Permission Set creation with partial failure tracking ---

export interface PermissionFailure {
  type: string;
  name: string;
  error: string;
}

const MAX_PERMISSION_SET_NAME_LENGTH = 80;
const MAX_PERMISSION_SET_LABEL_LENGTH = 80;

interface NormalizedObjectPermission {
  object: string;
  allowRead: boolean;
  allowCreate: boolean;
  allowEdit: boolean;
  allowDelete: boolean;
  viewAllRecords: boolean;
  modifyAllRecords: boolean;
}

interface NormalizedFieldPermission {
  field: string;
  sobjectType: string;
  fieldApiName: string;
  readable: boolean;
  editable: boolean;
}

interface NormalizedPermissionSetPayload {
  name: string;
  label: string;
  objectPermissions: NormalizedObjectPermission[];
  fieldPermissions: NormalizedFieldPermission[];
  userPermissions: Array<{ name: string }>;
  tabSettings: Array<{ name: string; visibility: string }>;
  setupEntityAccess: Array<{ entityId: string; entityType: string }>;
}

function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${field}`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Missing ${field}`);
  }

  return normalized;
}

function assertMaxLength(value: string, maxLength: number, field: string): string {
  if (value.length > maxLength) {
    throw new Error(`${field} exceeds ${maxLength} characters`);
  }

  return value;
}

function assertBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid ${field}`);
  }

  return value;
}

function assertArray<T>(value: unknown, field: string): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${field}`);
  }

  return value as T[];
}

function dedupeBy<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function mergeBy<T>(items: T[], getKey: (item: T) => string, merge: (existing: T, incoming: T) => void): T[] {
  const merged = new Map<string, T>();

  for (const item of items) {
    const key = getKey(item);
    const existing = merged.get(key);
    if (existing) {
      merge(existing, item);
      continue;
    }

    merged.set(key, item);
  }

  return [...merged.values()];
}

function splitFieldPath(field: string): { sobjectType: string; fieldApiName: string } | null {
  const dotIndex = field.indexOf('.');
  if (dotIndex <= 0 || dotIndex >= field.length - 1) {
    return null;
  }

  return {
    sobjectType: field.slice(0, dotIndex),
    fieldApiName: field.slice(dotIndex + 1),
  };
}

function normalizeObjectPermission(
  item: {
    object: string;
    allowRead: boolean;
    allowCreate: boolean;
    allowEdit: boolean;
    allowDelete: boolean;
    viewAllRecords: boolean;
    modifyAllRecords: boolean;
  },
  index: number,
): NormalizedObjectPermission {
  const object = assertNonEmptyString(item.object, `object permission #${index + 1} object`);
  const allowCreate = assertBoolean(item.allowCreate, `object permission #${index + 1} allowCreate`);
  const allowEdit = assertBoolean(item.allowEdit, `object permission #${index + 1} allowEdit`);
  const allowDelete = assertBoolean(item.allowDelete, `object permission #${index + 1} allowDelete`);
  const modifyAllRecords = assertBoolean(item.modifyAllRecords, `object permission #${index + 1} modifyAllRecords`);
  const viewAllRecords = assertBoolean(item.viewAllRecords, `object permission #${index + 1} viewAllRecords`) || modifyAllRecords;
  const allowRead = assertBoolean(item.allowRead, `object permission #${index + 1} allowRead`)
    || allowCreate
    || allowEdit
    || allowDelete
    || viewAllRecords
    || modifyAllRecords;

  return {
    object,
    allowRead,
    allowCreate,
    allowEdit,
    allowDelete,
    viewAllRecords,
    modifyAllRecords,
  };
}

function mergeObjectPermissions(items: NormalizedObjectPermission[]): NormalizedObjectPermission[] {
  return mergeBy(items, (item) => item.object.toLowerCase(), (existing, incoming) => {
    existing.allowRead ||= incoming.allowRead;
    existing.allowCreate ||= incoming.allowCreate;
    existing.allowEdit ||= incoming.allowEdit;
    existing.allowDelete ||= incoming.allowDelete;
    existing.viewAllRecords ||= incoming.viewAllRecords;
    existing.modifyAllRecords ||= incoming.modifyAllRecords;
  });
}

function normalizeFieldPermission(
  item: {
    field: string;
    sobjectType: string;
    readable: boolean;
    editable: boolean;
  },
  index: number,
): NormalizedFieldPermission {
  const rawField = assertNonEmptyString(item.field, `field permission #${index + 1} field`);
  const rawSobjectType = assertNonEmptyString(item.sobjectType, `field permission #${index + 1} sobjectType`);
  const readable = assertBoolean(item.readable, `field permission #${index + 1} readable`);
  const editable = assertBoolean(item.editable, `field permission #${index + 1} editable`);
  const splitField = splitFieldPath(rawField);
  const fieldApiName = splitField?.fieldApiName ?? rawField;
  const sobjectType = rawSobjectType || splitField?.sobjectType;

  if (!sobjectType) {
    throw new Error(`Invalid field permission #${index + 1} sobjectType`);
  }

  return {
    field: `${sobjectType}.${fieldApiName}`,
    sobjectType,
    fieldApiName,
    readable: readable || editable,
    editable,
  };
}

function mergeFieldPermissions(items: NormalizedFieldPermission[]): NormalizedFieldPermission[] {
  return mergeBy(items, (item) => item.field.toLowerCase(), (existing, incoming) => {
    existing.readable ||= incoming.readable;
    existing.editable ||= incoming.editable;
  });
}

function ensureObjectPermissionsForFields(
  objectPermissions: NormalizedObjectPermission[],
  fieldPermissions: NormalizedFieldPermission[],
): NormalizedObjectPermission[] {
  const merged = mergeObjectPermissions(objectPermissions);
  const byObject = new Map(merged.map((item) => [item.object.toLowerCase(), item]));

  for (const fieldPermission of fieldPermissions) {
    const key = fieldPermission.sobjectType.toLowerCase();
    const existing = byObject.get(key);

    if (existing) {
      existing.allowRead ||= fieldPermission.readable || fieldPermission.editable;
      existing.allowEdit ||= fieldPermission.editable;
      continue;
    }

    const created: NormalizedObjectPermission = {
      object: fieldPermission.sobjectType,
      allowRead: fieldPermission.readable || fieldPermission.editable,
      allowCreate: false,
      allowEdit: fieldPermission.editable,
      allowDelete: false,
      viewAllRecords: false,
      modifyAllRecords: false,
    };
    byObject.set(key, created);
    merged.push(created);
  }

  return merged;
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : 'Unknown error';
}

function isDuplicateInsertError(error: string): boolean {
  return /duplicate row exists|duplicates value/i.test(error);
}

function isDependencyError(error: string): boolean {
  return /depends on permission\(s\)|requires Read on at least one of these objects/i.test(error);
}

function normalizePermissionSetPayload(data: {
  name: string;
  label: string;
  objectPermissions: Array<{
    object: string;
    allowRead: boolean;
    allowCreate: boolean;
    allowEdit: boolean;
    allowDelete: boolean;
    viewAllRecords: boolean;
    modifyAllRecords: boolean;
  }>;
  fieldPermissions: Array<{
    field: string;
    sobjectType: string;
    readable: boolean;
    editable: boolean;
  }>;
  userPermissions: Array<{ name: string }>;
  tabSettings: Array<{ name: string; visibility: string }>;
  setupEntityAccess: Array<{ entityId: string; entityType: string }>;
}): NormalizedPermissionSetPayload {
  const objectPermissions = mergeObjectPermissions(
    assertArray<typeof data.objectPermissions[number]>(data.objectPermissions, 'objectPermissions').map(normalizeObjectPermission),
  );
  const fieldPermissions = mergeFieldPermissions(
    assertArray<typeof data.fieldPermissions[number]>(data.fieldPermissions, 'fieldPermissions').map(normalizeFieldPermission),
  );

  return {
    name: assertMaxLength(assertNonEmptyString(data.name, 'Permission Set name'), MAX_PERMISSION_SET_NAME_LENGTH, 'Permission Set name'),
    label: assertMaxLength(assertNonEmptyString(data.label, 'Permission Set label'), MAX_PERMISSION_SET_LABEL_LENGTH, 'Permission Set label'),
    objectPermissions: ensureObjectPermissionsForFields(objectPermissions, fieldPermissions),
    fieldPermissions,
    userPermissions: dedupeBy(
      assertArray<typeof data.userPermissions[number]>(data.userPermissions, 'userPermissions').map((item, index) => ({
        name: assertNonEmptyString(item.name, `user permission #${index + 1} name`),
      })),
      (item) => item.name,
    ),
    tabSettings: dedupeBy(
      assertArray<typeof data.tabSettings[number]>(data.tabSettings, 'tabSettings').map((item, index) => ({
        name: assertNonEmptyString(item.name, `tab setting #${index + 1} name`),
        visibility: assertNonEmptyString(item.visibility, `tab setting #${index + 1} visibility`),
      })),
      (item) => item.name,
    ),
    setupEntityAccess: dedupeBy(
      assertArray<typeof data.setupEntityAccess[number]>(data.setupEntityAccess, 'setupEntityAccess').map((item, index) => ({
        entityId: assertNonEmptyString(item.entityId, `setup entity access #${index + 1} entityId`),
        entityType: assertNonEmptyString(item.entityType, `setup entity access #${index + 1} entityType`),
      })),
      (item) => item.entityId,
    ),
  };
}

function findDescribeField(describe: any, fieldApiName: string): any | null {
  const fields = Array.isArray(describe?.fields) ? describe.fields : [];
  return fields.find((field: any) =>
    typeof field?.name === 'string' && field.name.toLowerCase() === fieldApiName.toLowerCase()
  ) ?? null;
}

async function validateFieldPermissions(
  instanceUrl: string,
  sessionId: string,
  fieldPermissions: NormalizedFieldPermission[],
  warnings: PermissionFailure[],
  onProgress?: (msg: string) => void,
): Promise<NormalizedFieldPermission[]> {
  if (fieldPermissions.length === 0) {
    return fieldPermissions;
  }

  onProgress?.(`Validating ${fieldPermissions.length} Field Permissions...`);

  const uniqueObjects = [...new Map(fieldPermissions.map((item) => [item.sobjectType.toLowerCase(), item.sobjectType])).values()];
  const describeResults = new Map<string, any | Error>();

  await Promise.all(uniqueObjects.map(async (objectName) => {
    try {
      describeResults.set(objectName.toLowerCase(), await describeObject(instanceUrl, sessionId, objectName));
    } catch (error) {
      describeResults.set(objectName.toLowerCase(), error instanceof Error ? error : new Error(formatUnknownError(error)));
    }
  }));

  const validFieldPermissions: NormalizedFieldPermission[] = [];

  for (const fieldPermission of fieldPermissions) {
    const describeResult = describeResults.get(fieldPermission.sobjectType.toLowerCase());
    if (describeResult instanceof Error) {
      warnings.push({
        type: 'FieldPermission',
        name: fieldPermission.field,
        error: `Skipped because ${fieldPermission.sobjectType} could not be described: ${describeResult.message}`,
      });
      continue;
    }

    const describeField = findDescribeField(describeResult, fieldPermission.fieldApiName);
    if (!describeField) {
      warnings.push({
        type: 'FieldPermission',
        name: fieldPermission.field,
        error: `Skipped because field ${fieldPermission.fieldApiName} was not found on ${fieldPermission.sobjectType}`,
      });
      continue;
    }

    if (describeField.permissionable === false) {
      warnings.push({
        type: 'FieldPermission',
        name: fieldPermission.field,
        error: 'Skipped because the field is not permissionable in this org',
      });
      continue;
    }

    const editable = fieldPermission.editable && describeField.updateable !== false;
    if (fieldPermission.editable && !editable) {
      warnings.push({
        type: 'FieldPermission',
        name: fieldPermission.field,
        error: 'Edit access was downgraded to read-only because the field is not updateable',
      });
    }

    validFieldPermissions.push({
      field: `${fieldPermission.sobjectType}.${describeField.name}`,
      sobjectType: fieldPermission.sobjectType,
      fieldApiName: describeField.name,
      readable: fieldPermission.readable || editable,
      editable,
    });
  }

  return mergeFieldPermissions(validFieldPermissions);
}

async function validateObjectPermissions(
  instanceUrl: string,
  sessionId: string,
  objectPermissions: NormalizedObjectPermission[],
  warnings: PermissionFailure[],
  onProgress?: (msg: string) => void,
): Promise<NormalizedObjectPermission[]> {
  if (objectPermissions.length === 0) {
    return objectPermissions;
  }

  onProgress?.(`Validating ${objectPermissions.length} Object Permissions...`);

  let describe: any;
  try {
    describe = await describeObject(instanceUrl, sessionId, 'ObjectPermissions');
  } catch (error) {
    warnings.push({
      type: 'ObjectPermission',
      name: 'ObjectPermissions',
      error: `Could not validate allowed object types before insert: ${formatUnknownError(error)}`,
    });
    return objectPermissions;
  }

  const sobjectTypeField = findDescribeField(describe, 'SobjectType');
  const picklistValues = Array.isArray(sobjectTypeField?.picklistValues) ? sobjectTypeField.picklistValues : [];
  const allowedObjects = new Map<string, string>();

  for (const picklistValue of picklistValues) {
    if (picklistValue?.active === false) continue;
    if (typeof picklistValue?.value !== 'string') continue;
    allowedObjects.set(picklistValue.value.toLowerCase(), picklistValue.value);
  }

  if (allowedObjects.size === 0) {
    warnings.push({
      type: 'ObjectPermission',
      name: 'ObjectPermissions.SobjectType',
      error: 'Could not determine allowed object types from describe metadata; skipping pre-validation',
    });
    return objectPermissions;
  }

  const validObjectPermissions: NormalizedObjectPermission[] = [];

  for (const objectPermission of objectPermissions) {
    const canonicalName = allowedObjects.get(objectPermission.object.toLowerCase());
    if (!canonicalName) {
      warnings.push({
        type: 'ObjectPermission',
        name: objectPermission.object,
        error: 'Skipped because this object type is not allowed by ObjectPermissions in this org',
      });
      continue;
    }

    validObjectPermissions.push({
      ...objectPermission,
      object: canonicalName,
    });
  }

  return mergeObjectPermissions(validObjectPermissions);
}

export async function createPermissionSet(
  instanceUrl: string,
  sessionId: string,
  data: {
    name: string;
    label: string;
    objectPermissions: Array<{
      object: string;
      allowRead: boolean;
      allowCreate: boolean;
      allowEdit: boolean;
      allowDelete: boolean;
      viewAllRecords: boolean;
      modifyAllRecords: boolean;
    }>;
    fieldPermissions: Array<{
      field: string;
      sobjectType: string;
      readable: boolean;
      editable: boolean;
    }>;
    userPermissions: Array<{ name: string }>;
    tabSettings: Array<{ name: string; visibility: string }>;
    setupEntityAccess: Array<{ entityId: string; entityType: string }>;
  },
  onProgress?: (msg: string) => void,
): Promise<{ id: string; success: boolean; rolledBack: boolean; failures: PermissionFailure[]; warnings: PermissionFailure[] }> {
  let normalizedData = normalizePermissionSetPayload(data);
  const headers = authHeaders(sessionId);
  const failures: PermissionFailure[] = [];
  const warnings: PermissionFailure[] = [];
  let permSetId = '';

  async function parseError(response: Response): Promise<string> {
    try {
      const err = await response.json();
      return Array.isArray(err) ? err[0]?.message : err.message || response.statusText;
    } catch {
      return response.statusText;
    }
  }

  async function rollbackPermissionSet(): Promise<string | null> {
    if (!permSetId) return null;

    const deleteUrl = `${instanceUrl}/services/data/${API_VERSION}/sobjects/PermissionSet/${permSetId}`;
    const deleteResponse = await fetchWithRetry(deleteUrl, {
      method: 'DELETE',
      headers,
    });

    if (deleteResponse.ok) {
      return null;
    }

    return parseError(deleteResponse);
  }

  async function finalizeFailure(): Promise<{
    id: string;
    success: boolean;
    rolledBack: boolean;
    failures: PermissionFailure[];
    warnings: PermissionFailure[];
  }> {
    onProgress?.('Errors detected. Rolling back incomplete Permission Set...');
    const rollbackError = await rollbackPermissionSet();
    if (rollbackError) {
      failures.push({ type: 'Rollback', name: normalizedData.name, error: rollbackError });
      onProgress?.('Errors detected and rollback failed');
      return { id: permSetId, success: false, rolledBack: false, failures, warnings };
    }

    onProgress?.('Errors detected. Incomplete Permission Set was rolled back');
    return { id: permSetId, success: false, rolledBack: true, failures, warnings };
  }

  try {
    normalizedData = {
      ...normalizedData,
      fieldPermissions: await validateFieldPermissions(
        instanceUrl,
        sessionId,
        normalizedData.fieldPermissions,
        warnings,
        onProgress,
      ),
    };
    normalizedData = {
      ...normalizedData,
      objectPermissions: ensureObjectPermissionsForFields(
        normalizedData.objectPermissions,
        normalizedData.fieldPermissions,
      ),
    };
    normalizedData = {
      ...normalizedData,
      objectPermissions: await validateObjectPermissions(
        instanceUrl,
        sessionId,
        normalizedData.objectPermissions,
        warnings,
        onProgress,
      ),
    };

    const totalPreparedPermissions =
      normalizedData.objectPermissions.length +
      normalizedData.fieldPermissions.length +
      normalizedData.userPermissions.length +
      normalizedData.tabSettings.length +
      normalizedData.setupEntityAccess.length;

    if (totalPreparedPermissions === 0) {
      throw new Error('No valid permissions remained after validation');
    }

    // Step 1: Create the Permission Set
    onProgress?.('Creating Permission Set...');
    const psUrl = `${instanceUrl}/services/data/${API_VERSION}/sobjects/PermissionSet`;
    const psResponse = await fetchWithRetry(psUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ Name: normalizedData.name, Label: normalizedData.label }),
    });

    if (!psResponse.ok) {
      const msg = await parseError(psResponse);
      throw new Error(`Failed to create Permission Set: ${msg}`);
    }

    const psResult = await psResponse.json();
    permSetId = psResult.id;

    // Step 2: Object Permissions
    if (normalizedData.objectPermissions.length > 0) {
      onProgress?.(`Adding ${normalizedData.objectPermissions.length} Object Permissions...`);
    }
    let pendingObjectPermissions = normalizedData.objectPermissions.map((permission) => ({
      permission,
      lastError: '',
    }));
    const maxObjectPasses = Math.max(2, normalizedData.objectPermissions.length);

    for (let pass = 1; pendingObjectPermissions.length > 0 && pass <= maxObjectPasses; pass++) {
      if (pass > 1) {
        onProgress?.(`Retrying ${pendingObjectPermissions.length} deferred Object Permissions (pass ${pass})...`);
      }

      let createdInPass = 0;
      const deferred: Array<{ permission: NormalizedObjectPermission; lastError: string }> = [];

      for (let i = 0; i < pendingObjectPermissions.length; i++) {
        const obj = pendingObjectPermissions[i]!.permission;
        if (i > 0 && i % 10 === 0) {
          onProgress?.(`Adding Object Permissions (${i}/${pendingObjectPermissions.length})...`);
        }

        const opUrl = `${instanceUrl}/services/data/${API_VERSION}/sobjects/ObjectPermissions`;
        const opResponse = await fetchWithRetry(opUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ParentId: permSetId,
            SobjectType: obj.object,
            PermissionsRead: obj.allowRead,
            PermissionsCreate: obj.allowCreate,
            PermissionsEdit: obj.allowEdit,
            PermissionsDelete: obj.allowDelete,
            PermissionsViewAllRecords: obj.viewAllRecords,
            PermissionsModifyAllRecords: obj.modifyAllRecords,
          }),
        });

        if (opResponse.ok) {
          createdInPass++;
          continue;
        }

        const error = await parseError(opResponse);
        if (isDuplicateInsertError(error)) {
          createdInPass++;
          continue;
        }

        if (isDependencyError(error) && pass < maxObjectPasses) {
          deferred.push({ permission: obj, lastError: error });
          continue;
        }

        failures.push({ type: 'ObjectPermission', name: obj.object, error });
      }

      if (deferred.length === 0) {
        pendingObjectPermissions = [];
        break;
      }

      if (createdInPass === 0 || pass === maxObjectPasses) {
        for (const deferredPermission of deferred) {
          failures.push({
            type: 'ObjectPermission',
            name: deferredPermission.permission.object,
            error: deferredPermission.lastError,
          });
        }
        pendingObjectPermissions = [];
        break;
      }

      pendingObjectPermissions = deferred;
    }

    // Step 3: Field Permissions
    if (normalizedData.fieldPermissions.length > 0) {
      onProgress?.(`Adding ${normalizedData.fieldPermissions.length} Field Permissions...`);
    }
    for (let i = 0; i < normalizedData.fieldPermissions.length; i++) {
      const field = normalizedData.fieldPermissions[i]!;
      if (i > 0 && i % 25 === 0) onProgress?.(`Adding Field Permissions (${i}/${normalizedData.fieldPermissions.length})...`);
      const fpUrl = `${instanceUrl}/services/data/${API_VERSION}/sobjects/FieldPermissions`;
      const fpResponse = await fetchWithRetry(fpUrl, {
        method: 'POST', headers,
        body: JSON.stringify({
          ParentId: permSetId, SobjectType: field.sobjectType,
          Field: field.field, PermissionsRead: field.readable, PermissionsEdit: field.editable,
        }),
      });
      if (!fpResponse.ok) {
        const error = await parseError(fpResponse);
        if (isDuplicateInsertError(error)) {
          continue;
        }
        failures.push({ type: 'FieldPermission', name: field.field, error });
      }
    }

    // Step 4: User Permissions (single PATCH)
    if (normalizedData.userPermissions.length > 0) {
      onProgress?.(`Applying ${normalizedData.userPermissions.length} User Permissions...`);
      const permFields: Record<string, boolean> = {};
      for (const up of normalizedData.userPermissions) permFields[up.name] = true;
      const patchUrl = `${instanceUrl}/services/data/${API_VERSION}/sobjects/PermissionSet/${permSetId}`;
      const patchResponse = await fetchWithRetry(patchUrl, {
        method: 'PATCH', headers,
        body: JSON.stringify(permFields),
      });
      if (!patchResponse.ok) {
        failures.push({ type: 'UserPermissions', name: 'batch', error: await parseError(patchResponse) });
      }
    }

    // Step 5: Tab Settings
    if (normalizedData.tabSettings.length > 0) {
      onProgress?.(`Adding ${normalizedData.tabSettings.length} Tab Settings...`);
    }
    for (let i = 0; i < normalizedData.tabSettings.length; i++) {
      const tab = normalizedData.tabSettings[i]!;
      if (i > 0 && i % 25 === 0) onProgress?.(`Adding Tab Settings (${i}/${normalizedData.tabSettings.length})...`);
      const tabUrl = `${instanceUrl}/services/data/${API_VERSION}/sobjects/PermissionSetTabSetting`;
      const tabResponse = await fetchWithRetry(tabUrl, {
        method: 'POST', headers,
        body: JSON.stringify({ ParentId: permSetId, Name: tab.name, Visibility: tab.visibility }),
      });
      if (!tabResponse.ok) {
        const error = await parseError(tabResponse);
        if (isDuplicateInsertError(error)) {
          continue;
        }
        failures.push({ type: 'TabSetting', name: tab.name, error });
      }
    }

    // Step 6: Setup Entity Access
    if (normalizedData.setupEntityAccess.length > 0) {
      onProgress?.(`Adding ${normalizedData.setupEntityAccess.length} Setup Entity Access records...`);
    }
    for (let i = 0; i < normalizedData.setupEntityAccess.length; i++) {
      const sea = normalizedData.setupEntityAccess[i]!;
      if (i > 0 && i % 25 === 0) onProgress?.(`Adding Setup Entity Access (${i}/${normalizedData.setupEntityAccess.length})...`);
      const seaUrl = `${instanceUrl}/services/data/${API_VERSION}/sobjects/SetupEntityAccess`;
      const seaResponse = await fetchWithRetry(seaUrl, {
        method: 'POST', headers,
        body: JSON.stringify({ ParentId: permSetId, SetupEntityId: sea.entityId }),
      });
      if (!seaResponse.ok) {
        const error = await parseError(seaResponse);
        if (isDuplicateInsertError(error)) {
          continue;
        }
        failures.push({ type: 'SetupEntityAccess', name: sea.entityType, error });
      }
    }

    if (failures.length > 0) {
      return finalizeFailure();
    }

    onProgress?.(warnings.length > 0 ? 'Permission Set created with warnings' : 'Permission Set created successfully');
    return { id: permSetId, success: true, rolledBack: false, failures: [], warnings };
  } catch (error) {
    if (!permSetId) {
      throw error;
    }

    onProgress?.('Unexpected error detected. Rolling back incomplete Permission Set...');
    const rollbackError = await rollbackPermissionSet();
    const baseMessage = error instanceof Error ? error.message : 'Unknown Permission Set creation error';

    if (rollbackError) {
      throw new Error(`${baseMessage}. Rollback failed: ${rollbackError}`);
    }

    throw new Error(`${baseMessage}. Incomplete Permission Set was rolled back.`);
  }
}
