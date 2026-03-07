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
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });

      if (response.ok || !RETRYABLE_STATUSES.has(response.status) || attempt === maxRetries - 1) {
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
      if (attempt === maxRetries - 1) break;
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
      readable: boolean;
      editable: boolean;
    }>;
    userPermissions: Array<{ name: string }>;
    tabSettings: Array<{ name: string; visibility: string }>;
    setupEntityAccess: Array<{ entityId: string; entityType: string }>;
  },
  onProgress?: (msg: string) => void,
): Promise<{ id: string; success: boolean; failures: PermissionFailure[] }> {
  const headers = authHeaders(sessionId);
  const failures: PermissionFailure[] = [];

  async function parseError(response: Response): Promise<string> {
    try {
      const err = await response.json();
      return Array.isArray(err) ? err[0]?.message : err.message || response.statusText;
    } catch {
      return response.statusText;
    }
  }

  // Step 1: Create the Permission Set
  onProgress?.('Creating Permission Set...');
  const psUrl = `${instanceUrl}/services/data/${API_VERSION}/sobjects/PermissionSet`;
  const psResponse = await fetchWithRetry(psUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ Name: data.name, Label: data.label }),
  });

  if (!psResponse.ok) {
    const msg = await parseError(psResponse);
    throw new Error(`Failed to create Permission Set: ${msg}`);
  }

  const psResult = await psResponse.json();
  const permSetId = psResult.id;

  // Step 2: Object Permissions
  if (data.objectPermissions.length > 0) {
    onProgress?.(`Adding ${data.objectPermissions.length} Object Permissions...`);
  }
  for (let i = 0; i < data.objectPermissions.length; i++) {
    const obj = data.objectPermissions[i]!;
    if (i > 0 && i % 10 === 0) onProgress?.(`Adding Object Permissions (${i}/${data.objectPermissions.length})...`);
    const opUrl = `${instanceUrl}/services/data/${API_VERSION}/sobjects/ObjectPermissions`;
    const opResponse = await fetchWithRetry(opUrl, {
      method: 'POST', headers,
      body: JSON.stringify({
        ParentId: permSetId, SobjectType: obj.object,
        PermissionsRead: obj.allowRead, PermissionsCreate: obj.allowCreate,
        PermissionsEdit: obj.allowEdit, PermissionsDelete: obj.allowDelete,
        PermissionsViewAllRecords: obj.viewAllRecords, PermissionsModifyAllRecords: obj.modifyAllRecords,
      }),
    });
    if (!opResponse.ok) {
      failures.push({ type: 'ObjectPermission', name: obj.object, error: await parseError(opResponse) });
    }
  }

  // Step 3: Field Permissions
  if (data.fieldPermissions.length > 0) {
    onProgress?.(`Adding ${data.fieldPermissions.length} Field Permissions...`);
  }
  for (let i = 0; i < data.fieldPermissions.length; i++) {
    const field = data.fieldPermissions[i]!;
    if (i > 0 && i % 25 === 0) onProgress?.(`Adding Field Permissions (${i}/${data.fieldPermissions.length})...`);
    const fpUrl = `${instanceUrl}/services/data/${API_VERSION}/sobjects/FieldPermissions`;
    const fpResponse = await fetchWithRetry(fpUrl, {
      method: 'POST', headers,
      body: JSON.stringify({
        ParentId: permSetId, SobjectType: field.field.split('.')[0],
        Field: field.field, PermissionsRead: field.readable, PermissionsEdit: field.editable,
      }),
    });
    if (!fpResponse.ok) {
      failures.push({ type: 'FieldPermission', name: field.field, error: await parseError(fpResponse) });
    }
  }

  // Step 4: User Permissions (single PATCH)
  if (data.userPermissions.length > 0) {
    onProgress?.(`Applying ${data.userPermissions.length} User Permissions...`);
    const permFields: Record<string, boolean> = {};
    for (const up of data.userPermissions) permFields[up.name] = true;
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
  if (data.tabSettings.length > 0) {
    onProgress?.(`Adding ${data.tabSettings.length} Tab Settings...`);
  }
  for (let i = 0; i < data.tabSettings.length; i++) {
    const tab = data.tabSettings[i]!;
    if (i > 0 && i % 25 === 0) onProgress?.(`Adding Tab Settings (${i}/${data.tabSettings.length})...`);
    const tabUrl = `${instanceUrl}/services/data/${API_VERSION}/sobjects/PermissionSetTabSetting`;
    const tabResponse = await fetchWithRetry(tabUrl, {
      method: 'POST', headers,
      body: JSON.stringify({ ParentId: permSetId, Name: tab.name, Visibility: tab.visibility }),
    });
    if (!tabResponse.ok) {
      failures.push({ type: 'TabSetting', name: tab.name, error: await parseError(tabResponse) });
    }
  }

  // Step 6: Setup Entity Access
  if (data.setupEntityAccess.length > 0) {
    onProgress?.(`Adding ${data.setupEntityAccess.length} Setup Entity Access records...`);
  }
  for (let i = 0; i < data.setupEntityAccess.length; i++) {
    const sea = data.setupEntityAccess[i]!;
    if (i > 0 && i % 25 === 0) onProgress?.(`Adding Setup Entity Access (${i}/${data.setupEntityAccess.length})...`);
    const seaUrl = `${instanceUrl}/services/data/${API_VERSION}/sobjects/SetupEntityAccess`;
    const seaResponse = await fetchWithRetry(seaUrl, {
      method: 'POST', headers,
      body: JSON.stringify({ ParentId: permSetId, SetupEntityId: sea.entityId }),
    });
    if (!seaResponse.ok) {
      failures.push({ type: 'SetupEntityAccess', name: sea.entityType, error: await parseError(seaResponse) });
    }
  }

  if (failures.length > 0) {
    onProgress?.(`Completed with ${failures.length} warning(s)`);
  }

  return { id: permSetId, success: true, failures };
}
