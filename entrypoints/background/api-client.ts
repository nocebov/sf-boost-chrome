import { getCachedDescribe, setCachedDescribe } from '../../lib/storage';

const API_VERSION = 'v62.0';

export async function describeObject(
  instanceUrl: string,
  sessionId: string,
  objectApiName: string
): Promise<any> {
  const cacheKey = `${instanceUrl}:${objectApiName}`;
  const cached = await getCachedDescribe(cacheKey);
  if (cached) return cached;

  const url = `${instanceUrl}/services/data/${API_VERSION}/sobjects/${objectApiName}/describe/`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${sessionId}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Describe failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  await setCachedDescribe(cacheKey, data);
  return data;
}

export async function executeSOQL(
  instanceUrl: string,
  sessionId: string,
  query: string
): Promise<any> {
  const url = `${instanceUrl}/services/data/${API_VERSION}/query/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${sessionId}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`SOQL query failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function executeToolingQuery(
  instanceUrl: string,
  sessionId: string,
  query: string
): Promise<any> {
  const url = `${instanceUrl}/services/data/${API_VERSION}/tooling/query/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${sessionId}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Tooling query failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/** Fetch all records from a Tooling API query, handling pagination via nextRecordsUrl */
export async function executeToolingQueryAll(
  instanceUrl: string,
  sessionId: string,
  query: string
): Promise<any> {
  let result = await executeToolingQuery(instanceUrl, sessionId, query);
  const allRecords = [...result.records];

  while (result.nextRecordsUrl) {
    const nextUrl = `${instanceUrl}${result.nextRecordsUrl}`;
    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${sessionId}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`Tooling query pagination failed: ${response.status} ${response.statusText}`);
    }
    result = await response.json();
    allRecords.push(...result.records);
  }

  return { ...result, records: allRecords, done: true };
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
  }
): Promise<{ id: string; success: boolean }> {
  const headers = {
    Authorization: `Bearer ${sessionId}`,
    'Content-Type': 'application/json',
  };

  // Step 1: Create the Permission Set
  const psUrl = `${instanceUrl}/services/data/${API_VERSION}/sobjects/PermissionSet`;
  const psResponse = await fetch(psUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      Name: data.name,
      Label: data.label,
    }),
  });

  if (!psResponse.ok) {
    const err = await psResponse.json().catch(() => ({}));
    const msg = Array.isArray(err) ? err[0]?.message : err.message || psResponse.statusText;
    throw new Error(`Failed to create Permission Set: ${msg}`);
  }

  const psResult = await psResponse.json();
  const permSetId = psResult.id;

  // Step 2: Create Object Permissions
  for (const obj of data.objectPermissions) {
    const opUrl = `${instanceUrl}/services/data/${API_VERSION}/sobjects/ObjectPermissions`;
    const opResponse = await fetch(opUrl, {
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
    if (!opResponse.ok) {
      const err = await opResponse.json().catch(() => ({}));
      const msg = Array.isArray(err) ? err[0]?.message : err.message || opResponse.statusText;
      console.warn(`[SF Boost] Failed to create ObjectPermission for ${obj.object}: ${msg}`);
    }
  }

  // Step 3: Create Field Permissions
  for (const field of data.fieldPermissions) {
    const fpUrl = `${instanceUrl}/services/data/${API_VERSION}/sobjects/FieldPermissions`;
    const fpResponse = await fetch(fpUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ParentId: permSetId,
        SobjectType: field.field.split('.')[0],
        Field: field.field,
        PermissionsRead: field.readable,
        PermissionsEdit: field.editable,
      }),
    });
    if (!fpResponse.ok) {
      const err = await fpResponse.json().catch(() => ({}));
      const msg = Array.isArray(err) ? err[0]?.message : err.message || fpResponse.statusText;
      console.warn(`[SF Boost] Failed to create FieldPermission for ${field.field}: ${msg}`);
    }
  }

  return { id: permSetId, success: true };
}
