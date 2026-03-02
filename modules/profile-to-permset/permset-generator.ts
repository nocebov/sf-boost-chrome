import { sendMessage } from '../../lib/messaging';
import type {
  ObjectPermission,
  FieldPermission,
  UserPermission,
  TabSetting,
  SetupEntityAccessItem,
} from './permission-reader';

export interface PermSetCreationParams {
  instanceUrl: string;
  name: string;
  label: string;
  objectPermissions: ObjectPermission[];
  fieldPermissions: FieldPermission[];
  userPermissions: UserPermission[];
  tabSettings: TabSetting[];
  setupEntityAccess: SetupEntityAccessItem[];
}

export interface PermSetCreationResult {
  id: string;
  success: boolean;
}

/**
 * Create a Permission Set via the REST API with the given permissions.
 */
export async function createPermSetViaApi(
  params: PermSetCreationParams
): Promise<PermSetCreationResult> {
  const result = await sendMessage('createPermissionSet', {
    instanceUrl: params.instanceUrl,
    name: params.name,
    label: params.label,
    objectPermissions: params.objectPermissions.map(op => ({
      object: op.SobjectType,
      allowRead: op.PermissionsRead,
      allowCreate: op.PermissionsCreate,
      allowEdit: op.PermissionsEdit,
      allowDelete: op.PermissionsDelete,
      viewAllRecords: op.PermissionsViewAllRecords,
      modifyAllRecords: op.PermissionsModifyAllRecords,
    })),
    fieldPermissions: params.fieldPermissions.map(fp => ({
      field: fp.Field,
      readable: fp.PermissionsRead,
      editable: fp.PermissionsEdit,
    })),
    userPermissions: params.userPermissions.map(up => ({
      name: up.name,
    })),
    tabSettings: params.tabSettings.map(ts => ({
      name: ts.Name,
      visibility: ts.Visibility,
    })),
    setupEntityAccess: params.setupEntityAccess.map(sea => ({
      entityId: sea.SetupEntityId,
      entityType: sea.SetupEntityType,
    })),
  });

  return {
    id: result.id,
    success: result.success,
  };
}

/**
 * Generate a safe API name from a label (no spaces, no special chars).
 */
export function sanitizeApiName(label: string): string {
  return label
    .replace(/[^a-zA-Z0-9_ ]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

/**
 * Check if a Permission Set with the given name already exists.
 */
export async function permSetExists(
  instanceUrl: string,
  name: string
): Promise<boolean> {
  try {
    const result = await sendMessage('executeToolingQuery', {
      instanceUrl,
      query: `SELECT Id FROM PermissionSet WHERE Name = '${name.replace(/'/g, "\\'")}' AND IsOwnedByProfile = false LIMIT 1`,
    });
    return (result.records?.length || 0) > 0;
  } catch {
    return false;
  }
}
