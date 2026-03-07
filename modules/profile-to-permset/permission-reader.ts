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

/** Safely run a query, returning empty array on failure (graceful degradation). */
async function safeQuery(instanceUrl: string, query: string): Promise<any[]> {
  try {
    const result = await sendMessage('executeSOQLAll', { instanceUrl, query });
    return result.records || [];
  } catch {
    return [];
  }
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
  let userPermFieldNames: string[] = [];
  try {
    const describe = await sendMessage('describeObject', {
      instanceUrl,
      objectApiName: 'PermissionSet',
    });
    userPermFieldNames = (describe.fields || [])
      .filter((f: any) => f.type === 'boolean' && f.name.startsWith('Permissions'))
      .map((f: any) => f.name);
  } catch {
    // If describe fails, skip user permissions
  }

  // Step 3: Run all permission queries in parallel
  const queries: Promise<any>[] = [
    // Object Permissions
    sendMessage('executeSOQLAll', {
      instanceUrl,
      query: `SELECT SobjectType, PermissionsRead, PermissionsCreate, PermissionsEdit, PermissionsDelete, PermissionsViewAllRecords, PermissionsModifyAllRecords FROM ObjectPermissions WHERE ParentId = '${permissionSetId}' ORDER BY SobjectType`,
    }),
    // Field Permissions
    sendMessage('executeSOQLAll', {
      instanceUrl,
      query: `SELECT Field, SobjectType, PermissionsRead, PermissionsEdit FROM FieldPermissions WHERE ParentId = '${permissionSetId}' ORDER BY SobjectType, Field`,
    }),
    // Tab Settings
    safeQuery(instanceUrl,
      `SELECT Name, Visibility FROM PermissionSetTabSetting WHERE ParentId = '${permissionSetId}' ORDER BY Name`,
    ),
    // Setup Entity Access (Apex Class, VF Page, Custom Permission)
    safeQuery(instanceUrl,
      `SELECT SetupEntityId, SetupEntityType, SetupEntity.Name FROM SetupEntityAccess WHERE ParentId = '${permissionSetId}' ORDER BY SetupEntityType, SetupEntity.Name`,
    ),
  ];

  // User Permissions query (dynamic fields)
  let userPermQuery: Promise<any> | null = null;
  if (userPermFieldNames.length > 0) {
    userPermQuery = sendMessage('executeSOQLAll', {
      instanceUrl,
      query: `SELECT ${userPermFieldNames.join(', ')} FROM PermissionSet WHERE Id = '${permissionSetId}'`,
    }).catch(() => ({ records: [] }));
    queries.push(userPermQuery);
  }

  const results = await Promise.all(queries);
  const [objResult, fieldResult] = results;
  const tabRecords = results[2] as any[];
  const seaRecords = results[3] as any[];

  // Filter out objects where all permissions are false
  const objectPermissions = (objResult.records || []).filter((op: ObjectPermission) =>
    op.PermissionsRead || op.PermissionsCreate || op.PermissionsEdit ||
    op.PermissionsDelete || op.PermissionsViewAllRecords || op.PermissionsModifyAllRecords
  );

  // Filter out fields where all permissions are false
  const fieldPermissions = (fieldResult.records || []).filter((fp: FieldPermission) =>
    fp.PermissionsRead || fp.PermissionsEdit
  );

  // Extract User Permissions (only those that are true)
  const userPermissions: UserPermission[] = [];
  if (userPermFieldNames.length > 0 && results[4]) {
    const psRecord = (results[4].records || [])[0];
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
