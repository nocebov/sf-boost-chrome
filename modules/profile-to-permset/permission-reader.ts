import { sendMessage } from '../../lib/messaging';

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

export interface ProfilePermissions {
  profileName: string;
  permissionSetId: string;
  objectPermissions: ObjectPermission[];
  fieldPermissions: FieldPermission[];
}

/**
 * Extract the Profile ID from the current URL.
 * Profile pages: /lightning/setup/EnhancedProfiles/page?address=/{profileId}
 */
export function extractProfileIdFromUrl(): string | null {
  const url = window.location.href;

  // Enhanced Profiles: ?address=/{profileId}
  const addressMatch = url.match(/[?&]address=\/([a-zA-Z0-9]{15,18})/);
  if (addressMatch?.[1]) return addressMatch[1];

  // Direct profile URL with ID in path
  const pathMatch = url.match(/\/([a-zA-Z0-9]{15,18})(?:\/view|\?|$)/);
  if (pathMatch?.[1]?.startsWith('00e')) return pathMatch[1]; // 00e = Profile keyPrefix

  return null;
}

/**
 * Read all OLS and FLS permissions from a Profile using the Tooling API.
 */
export async function readProfilePermissions(
  instanceUrl: string,
  profileId: string
): Promise<ProfilePermissions> {
  // Step 1: Find the PermissionSet associated with this Profile
  const psResult = await sendMessage('executeToolingQuery', {
    instanceUrl,
    query: `SELECT Id, Profile.Name FROM PermissionSet WHERE ProfileId = '${profileId}' LIMIT 1`,
  });

  if (!psResult.records?.length) {
    throw new Error('Could not find PermissionSet for this Profile');
  }

  const permissionSetId = psResult.records[0].Id;
  const profileName = psResult.records[0].Profile?.Name || 'Unknown Profile';

  // Step 2: Read Object Permissions and Field Permissions in parallel
  const [objResult, fieldResult] = await Promise.all([
    sendMessage('executeToolingQuery', {
      instanceUrl,
      query: `SELECT SobjectType, PermissionsRead, PermissionsCreate, PermissionsEdit, PermissionsDelete, PermissionsViewAllRecords, PermissionsModifyAllRecords FROM ObjectPermissions WHERE ParentId = '${permissionSetId}' ORDER BY SobjectType`,
    }),
    sendMessage('executeToolingQuery', {
      instanceUrl,
      query: `SELECT Field, SobjectType, PermissionsRead, PermissionsEdit FROM FieldPermissions WHERE ParentId = '${permissionSetId}' ORDER BY SobjectType, Field`,
    }),
  ]);

  // Filter out objects where all permissions are false
  const objectPermissions = (objResult.records || []).filter((op: ObjectPermission) =>
    op.PermissionsRead || op.PermissionsCreate || op.PermissionsEdit ||
    op.PermissionsDelete || op.PermissionsViewAllRecords || op.PermissionsModifyAllRecords
  );

  // Filter out fields where all permissions are false
  const fieldPermissions = (fieldResult.records || []).filter((fp: FieldPermission) =>
    fp.PermissionsRead || fp.PermissionsEdit
  );

  return {
    profileName,
    permissionSetId,
    objectPermissions,
    fieldPermissions,
  };
}
