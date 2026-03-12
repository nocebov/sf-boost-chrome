import { sendMessage } from '../../lib/messaging';
import { assertSalesforceId } from '../../lib/salesforce-utils';

export interface ObjectPermission {
  SobjectType: string;
  PermissionsRead: boolean;
  PermissionsCreate: boolean;
  PermissionsEdit: boolean;
  PermissionsDelete: boolean;
  PermissionsViewAllRecords: boolean;
  PermissionsModifyAllRecords: boolean;
}

export interface FieldPermission {
  Field: string;
  SobjectType: string;
  PermissionsRead: boolean;
  PermissionsEdit: boolean;
}

export interface UserPermission {
  name: string;
  label: string;
}

export interface TabSetting {
  Name: string;
  Visibility: string;
}

export interface SetupEntityAccessItem {
  SetupEntityId: string;
  SetupEntityType: string;
  Name: string;
}

export interface ProfilePermissions {
  profileName: string;
  permissionSetId: string;
  objectPermissions: ObjectPermission[];
  fieldPermissions: FieldPermission[];
  userPermissions: UserPermission[];
  tabSettings: TabSetting[];
  apexClassAccess: SetupEntityAccessItem[];
  vfPageAccess: SetupEntityAccessItem[];
  customPermissions: SetupEntityAccessItem[];
}

/**
 * Extract the Profile ID from the current URL.
 * Profile pages: /lightning/setup/EnhancedProfiles/page?address=/{profileId}
 */
export function extractProfileIdFromUrl(): string | null {
  const url = window.location.href;
  const decodedUrl = decodeURIComponent(url);

  // Enhanced Profiles: ?address=/{profileId}
  const addressMatch = decodedUrl.match(/[?&]address=\/([a-zA-Z0-9]{15,18})/);
  if (addressMatch?.[1]) return addressMatch[1];

  // Direct profile URL with ID in path
  const pathMatch = decodedUrl.match(/\/([a-zA-Z0-9]{15,18})(?:\/view|\?|$)/);
  if (pathMatch?.[1]?.startsWith('00e')) return pathMatch[1]; // 00e = Profile keyPrefix

  return null;
}

/** Convert a Permissions* API field name to a human-readable label. */
function permissionFieldToLabel(fieldName: string): string {
  // Strip "Permissions" prefix, then split on camelCase boundaries
  return fieldName
    .replace(/^Permissions/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

function formatReadError(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message;
  }

  return typeof reason === 'string' ? reason : 'Unknown read error';
}

function unwrapQueryResult<T>(
  label: string,
  result: PromiseSettledResult<any>,
  failures: string[],
): T[] {
  if (result.status === 'fulfilled') {
    return (result.value.records || []) as T[];
  }

  failures.push(`${label}: ${formatReadError(result.reason)}`);
  return [];
}

function normalizeObjectApiName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function mergeObjectPermissionRecords(records: ObjectPermission[]): ObjectPermission[] {
  const merged = new Map<string, ObjectPermission>();

  for (const record of records) {
    const sobjectType = normalizeObjectApiName(record.SobjectType);
    if (!sobjectType) continue;

    const key = sobjectType.toLowerCase();
    const existing = merged.get(key);
    if (existing) {
      existing.PermissionsRead ||= record.PermissionsRead;
      existing.PermissionsCreate ||= record.PermissionsCreate;
      existing.PermissionsEdit ||= record.PermissionsEdit;
      existing.PermissionsDelete ||= record.PermissionsDelete;
      existing.PermissionsViewAllRecords ||= record.PermissionsViewAllRecords;
      existing.PermissionsModifyAllRecords ||= record.PermissionsModifyAllRecords;
      continue;
    }

    merged.set(key, {
      SobjectType: sobjectType,
      PermissionsRead: !!record.PermissionsRead,
      PermissionsCreate: !!record.PermissionsCreate,
      PermissionsEdit: !!record.PermissionsEdit,
      PermissionsDelete: !!record.PermissionsDelete,
      PermissionsViewAllRecords: !!record.PermissionsViewAllRecords,
      PermissionsModifyAllRecords: !!record.PermissionsModifyAllRecords,
    });
  }

  return [...merged.values()].sort((a, b) => a.SobjectType.localeCompare(b.SobjectType));
}

function normalizeFieldPermissionRecord(record: FieldPermission): FieldPermission | null {
  const rawField = typeof record.Field === 'string' ? record.Field.trim() : '';
  const rawSobjectType = normalizeObjectApiName(record.SobjectType);
  const normalizedField = rawField.includes('.')
    ? rawField
    : (rawField && rawSobjectType ? `${rawSobjectType}.${rawField}` : rawField);
  const normalizedSobjectType = rawSobjectType || normalizedField.split('.')[0] || '';

  if (!normalizedField || !normalizedSobjectType) {
    return null;
  }

  return {
    Field: normalizedField,
    SobjectType: normalizedSobjectType,
    PermissionsRead: !!record.PermissionsRead,
    PermissionsEdit: !!record.PermissionsEdit,
  };
}

function mergeFieldPermissionRecords(records: FieldPermission[]): FieldPermission[] {
  const merged = new Map<string, FieldPermission>();

  for (const record of records) {
    const normalized = normalizeFieldPermissionRecord(record);
    if (!normalized) continue;

    const key = normalized.Field.toLowerCase();
    const existing = merged.get(key);
    if (existing) {
      existing.PermissionsRead ||= normalized.PermissionsRead;
      existing.PermissionsEdit ||= normalized.PermissionsEdit;
      continue;
    }

    merged.set(key, normalized);
  }

  return [...merged.values()].sort((a, b) => a.Field.localeCompare(b.Field));
}

/**
 * Read all permissions from a Profile: OLS, FLS, User Perms, Tabs, Apex/VF/Custom Permissions.
 */
export async function readProfilePermissions(
  instanceUrl: string,
  profileId: string
): Promise<ProfilePermissions> {
  // Step 1: Find the PermissionSet associated with this Profile
  const safeProfileId = assertSalesforceId(profileId, 'profile');
  const psResult = await sendMessage('executeSOQLAll', {
    instanceUrl,
    query: `SELECT Id, Profile.Name FROM PermissionSet WHERE ProfileId = '${safeProfileId}' LIMIT 1`,
  });

  if (!psResult.records?.length) {
    throw new Error('Could not find PermissionSet for this Profile');
  }

  const permissionSetId = assertSalesforceId(psResult.records[0].Id, 'permissionSet');
  const profileName = psResult.records[0].Profile?.Name || 'Unknown Profile';

  // Step 2: Discover available User Permission fields via describe
  const describe = await sendMessage('describeObject', {
    instanceUrl,
    objectApiName: 'PermissionSet',
  });
  const userPermFieldNames = (describe.fields || [])
    .filter((f: any) => f.type === 'boolean' && f.name.startsWith('Permissions'))
    .map((f: any) => f.name);

  // Step 3: Run all permission queries in parallel
  const queryPromises: Promise<any>[] = [
    sendMessage('executeSOQLAll', {
      instanceUrl,
      query: `SELECT SobjectType, PermissionsRead, PermissionsCreate, PermissionsEdit, PermissionsDelete, PermissionsViewAllRecords, PermissionsModifyAllRecords FROM ObjectPermissions WHERE ParentId = '${permissionSetId}' ORDER BY SobjectType`,
    }),
    sendMessage('executeSOQLAll', {
      instanceUrl,
      query: `SELECT Field, SobjectType, PermissionsRead, PermissionsEdit FROM FieldPermissions WHERE ParentId = '${permissionSetId}' ORDER BY SobjectType, Field`,
    }),
    sendMessage('executeSOQLAll', {
      instanceUrl,
      query: `SELECT Name, Visibility FROM PermissionSetTabSetting WHERE ParentId = '${permissionSetId}' ORDER BY Name`,
    }),
    sendMessage('executeSOQLAll', {
      instanceUrl,
      query: `SELECT SetupEntityId, SetupEntityType, SetupEntity.Name FROM SetupEntityAccess WHERE ParentId = '${permissionSetId}' ORDER BY SetupEntityType, SetupEntity.Name`,
    }),
  ];

  if (userPermFieldNames.length > 0) {
    queryPromises.push(
      sendMessage('executeSOQLAll', {
        instanceUrl,
        query: `SELECT ${userPermFieldNames.join(', ')} FROM PermissionSet WHERE Id = '${permissionSetId}'`,
      }),
    );
  }

  const results = await Promise.allSettled(queryPromises);
  const queryFailures: string[] = [];
  const objectPermissionRecords = unwrapQueryResult<ObjectPermission>('Object Permissions', results[0]!, queryFailures);
  const fieldPermissionRecords = unwrapQueryResult<FieldPermission>('Field Permissions', results[1]!, queryFailures);
  const tabRecords = unwrapQueryResult<TabSetting>('Tab Settings', results[2]!, queryFailures);
  const seaRecords = unwrapQueryResult<any>('Setup Entity Access', results[3]!, queryFailures);

  let permissionSetRecords: any[] = [];
  if (userPermFieldNames.length > 0 && results[4]) {
    permissionSetRecords = unwrapQueryResult<any>('User Permissions', results[4], queryFailures);
  }

  if (queryFailures.length > 0) {
    throw new Error(`Failed to read profile completely: ${queryFailures.join('; ')}`);
  }

  // Filter out objects where all permissions are false
  const objectPermissions = mergeObjectPermissionRecords(objectPermissionRecords).filter((op: ObjectPermission) =>
    op.PermissionsRead || op.PermissionsCreate || op.PermissionsEdit ||
    op.PermissionsDelete || op.PermissionsViewAllRecords || op.PermissionsModifyAllRecords
  );

  // Filter out fields where all permissions are false
  const fieldPermissions = mergeFieldPermissionRecords(fieldPermissionRecords).filter((fp: FieldPermission) =>
    fp.PermissionsRead || fp.PermissionsEdit
  );

  // Extract User Permissions (only those that are true)
  const userPermissions: UserPermission[] = [];
  if (userPermFieldNames.length > 0) {
    const psRecord = permissionSetRecords[0];
    if (psRecord) {
      for (const fieldName of userPermFieldNames) {
        if (psRecord[fieldName] === true) {
          userPermissions.push({
            name: fieldName,
            label: permissionFieldToLabel(fieldName),
          });
        }
      }
      userPermissions.sort((a, b) => a.label.localeCompare(b.label));
    }
  }

  // Tab Settings (filter out hidden/none)
  const tabSettings: TabSetting[] = (tabRecords || []).filter(
    (t: TabSetting) => t.Visibility && t.Visibility !== 'None'
  );

  // Group SetupEntityAccess by type
  const apexClassAccess: SetupEntityAccessItem[] = [];
  const vfPageAccess: SetupEntityAccessItem[] = [];
  const customPermissions: SetupEntityAccessItem[] = [];

  for (const record of seaRecords || []) {
    const item: SetupEntityAccessItem = {
      SetupEntityId: record.SetupEntityId,
      SetupEntityType: record.SetupEntityType,
      Name: record.SetupEntity?.Name || record.SetupEntityId,
    };
    switch (record.SetupEntityType) {
      case 'ApexClass': apexClassAccess.push(item); break;
      case 'ApexPage': vfPageAccess.push(item); break;
      case 'CustomPermission': customPermissions.push(item); break;
    }
  }

  return {
    profileName,
    permissionSetId,
    objectPermissions,
    fieldPermissions,
    userPermissions,
    tabSettings,
    apexClassAccess,
    vfPageAccess,
    customPermissions,
  };
}
