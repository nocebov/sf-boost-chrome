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

/** Fetch all records from a SOQL query, handling pagination via nextRecordsUrl */
export async function executeSOQLAll(
  instanceUrl: string,
  sessionId: string,
  query: string
): Promise<any> {
  let result = await executeSOQL(instanceUrl, sessionId, query);
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
      throw new Error(`SOQL query pagination failed: ${response.status} ${response.statusText}`);
    }
    result = await response.json();
    allRecords.push(...result.records);
  }

  return { ...result, records: allRecords, done: true };
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
    userPermissions: Array<{ name: string }>;
    tabSettings: Array<{ name: string; visibility: string }>;
    setupEntityAccess: Array<{ entityId: string; entityType: string }>;
  },
  onProgress?: (msg: string) => void
): Promise<{ id: string; success: boolean }> {
  const headers = {
    Authorization: `Bearer ${sessionId}`,
    'Content-Type': 'application/json',
  };

  // Step 1: Create the Permission Set
  onProgress?.('Creating Permission Set...');
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
  if (data.objectPermissions.length > 0) {
    onProgress?.(`Adding ${data.objectPermissions.length} Object Permissions...`);
  }
  let opCount = 0;
  for (const obj of data.objectPermissions) {
    if (opCount > 0 && opCount % 10 === 0) onProgress?.(`Adding Object Permissions (${opCount}/${data.objectPermissions.length})...`);
    opCount++;
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
  if (data.fieldPermissions.length > 0) {
    onProgress?.(`Adding ${data.fieldPermissions.length} Field Permissions...`);
  }
  let fpCount = 0;
  for (const field of data.fieldPermissions) {
    if (fpCount > 0 && fpCount % 25 === 0) onProgress?.(`Adding Field Permissions (${fpCount}/${data.fieldPermissions.length})...`);
    fpCount++;
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

  // Step 4: Set User Permissions (single PATCH on the PermissionSet record)
  if (data.userPermissions.length > 0) {
    onProgress?.(`Applying ${data.userPermissions.length} User Permissions...`);
    const permFields: Record<string, boolean> = {};
    for (const up of data.userPermissions) {
      permFields[up.name] = true;
    }
    const patchUrl = `${instanceUrl}/services/data/${API_VERSION}/sobjects/PermissionSet/${permSetId}`;
    const patchResponse = await fetch(patchUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(permFields),
    });
    if (!patchResponse.ok) {
      const err = await patchResponse.json().catch(() => ({}));
      const msg = Array.isArray(err) ? err[0]?.message : err.message || patchResponse.statusText;
      console.warn(`[SF Boost] Failed to set User Permissions: ${msg}`);
    }
  }

  // Step 5: Create Tab Settings
  if (data.tabSettings.length > 0) {
    onProgress?.(`Adding ${data.tabSettings.length} Tab Settings...`);
  }
  let tabCount = 0;
  for (const tab of data.tabSettings) {
    if (tabCount > 0 && tabCount % 25 === 0) onProgress?.(`Adding Tab Settings (${tabCount}/${data.tabSettings.length})...`);
    tabCount++;
    const tabUrl = `${instanceUrl}/services/data/${API_VERSION}/sobjects/PermissionSetTabSetting`;
    const tabResponse = await fetch(tabUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ParentId: permSetId,
        Name: tab.name,
        Visibility: tab.visibility,
      }),
    });
    if (!tabResponse.ok) {
      const err = await tabResponse.json().catch(() => ({}));
      const msg = Array.isArray(err) ? err[0]?.message : err.message || tabResponse.statusText;
      console.warn(`[SF Boost] Failed to create TabSetting for ${tab.name}: ${msg}`);
    }
  }

  // Step 6: Create Setup Entity Access (Apex Class, VF Page, Custom Permission)
  if (data.setupEntityAccess.length > 0) {
    onProgress?.(`Adding ${data.setupEntityAccess.length} Setup Entity Access records...`);
  }
  let seaCount = 0;
  for (const sea of data.setupEntityAccess) {
    if (seaCount > 0 && seaCount % 25 === 0) onProgress?.(`Adding Setup Entity Access (${seaCount}/${data.setupEntityAccess.length})...`);
    seaCount++;
    const seaUrl = `${instanceUrl}/services/data/${API_VERSION}/sobjects/SetupEntityAccess`;
    const seaResponse = await fetch(seaUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ParentId: permSetId,
        SetupEntityId: sea.entityId,
      }),
    });
    if (!seaResponse.ok) {
      const err = await seaResponse.json().catch(() => ({}));
      const msg = Array.isArray(err) ? err[0]?.message : err.message || seaResponse.statusText;
      console.warn(`[SF Boost] Failed to create SetupEntityAccess for ${sea.entityType}: ${msg}`);
    }
  }

  return { id: permSetId, success: true };
}
