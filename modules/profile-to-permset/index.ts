import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';
import { createModal, createSpinner, createButton } from '../../lib/ui-helpers';
import { showToast } from '../../lib/toast';
import {
  extractProfileIdFromUrl,
  readProfilePermissions,
  type ProfilePermissions,
  type ObjectPermission,
  type FieldPermission,
  type UserPermission,
  type TabSetting,
  type SetupEntityAccessItem,
} from './permission-reader';
import { createPermSetViaApi, sanitizeApiName, permSetExists } from './permset-generator';

const BTN_ID = 'sfboost-extract-permset-btn';
const MODAL_ID = 'sfboost-permset-modal';

let currentCtx: ModuleContext | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

// --- Page Detection ---

function isProfilePage(): boolean {
  const pathname = window.location.pathname;
  const href = window.location.href;

  // Top-level Lightning URL
  if (
    pathname.includes('/lightning/setup/EnhancedProfiles/') ||
    pathname.includes('/lightning/setup/Profiles/') ||
    (pathname.includes('/lightning/setup/') && href.includes('address=') && href.includes('00e'))
  ) {
    return true;
  }

  // Inside Classic iframe or direct Classic URL
  if (extractProfileIdFromUrl()) {
    // If we're on a setup/profile page, it usually has classic page title headers
    if (document.querySelector('.setupcontent, .bPageTitle')) {
      return true;
    }
    // Also support checking the path directly if the DOM isn't fully ready yet
    if (pathname.match(/^\/00e[a-zA-Z0-9]{12,15}/)) {
      return true;
    }
  }

  return false;
}

// --- Button Injection ---

function injectButton(): boolean {
  if (document.getElementById(BTN_ID)) return true;
  if (!isProfilePage()) return false;

  const profileId = extractProfileIdFromUrl();
  if (!profileId) return false;

  const headerSelectors = [
    '.slds-page-header__title',
    'h1.slds-page-header__title',
    '.setupcontent h1',
    '.bPageTitle .ptBody h2',
  ];

  let header: Element | null = null;
  for (const sel of headerSelectors) {
    header = document.querySelector(sel);
    if (header) break;
  }
  if (!header) return false;

  const btn = createButton('Extract to Permission Set');
  btn.id = BTN_ID;
  btn.style.marginLeft = '12px';
  btn.style.verticalAlign = 'middle';

  btn.addEventListener('click', () => openWizard(profileId));

  if (header.parentElement) {
    header.parentElement.insertBefore(btn, header.nextSibling);
  }

  return true;
}

function scheduleInject(attempts = 10, delay = 500): void {
  cancelRetry();
  let count = 0;
  const tryInject = () => {
    if (injectButton() || count >= attempts) {
      retryTimer = null;
      return;
    }
    count++;
    retryTimer = setTimeout(tryInject, delay);
  };
  tryInject();
}

function cancelRetry(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

// --- Wizard UI ---

async function openWizard(profileId: string): Promise<void> {
  if (!currentCtx) return;
  const instanceUrl = currentCtx.pageContext.instanceUrl;

  const { card, close } = createModal(MODAL_ID, { width: '700px', maxHeight: '560px' });

  // Header
  const headerDiv = createHeader('Extract Profile to Permission Set', close);
  card.appendChild(headerDiv);

  // Loading step
  const loadingDiv = createLoadingStep('Reading profile permissions...');
  card.appendChild(loadingDiv);

  try {
    const permissions = await readProfilePermissions(instanceUrl, profileId);
    loadingDiv.remove();
    renderSelectionStep(card, permissions, instanceUrl, close);
  } catch (err: any) {
    loadingDiv.remove();
    const errorDiv = document.createElement('div');
    errorDiv.setAttribute('style', 'padding: 20px; color: #ef4444; font-size: 13px;');
    errorDiv.textContent = `Error reading profile: ${err.message}`;
    card.appendChild(errorDiv);
  }
}

function createHeader(titleText: string, close: () => void): HTMLDivElement {
  const headerDiv = document.createElement('div');
  headerDiv.setAttribute('style', `
    padding: 16px 20px;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: space-between;
  `);

  const title = document.createElement('h2');
  title.setAttribute('style', 'margin: 0; font-size: 16px; font-weight: 700; color: #181818;');
  title.textContent = titleText;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '\u00d7';
  closeBtn.setAttribute('style', `
    border: none; background: none; font-size: 22px; cursor: pointer;
    color: #706e6b; padding: 0 4px; line-height: 1;
  `);
  closeBtn.addEventListener('click', close);

  headerDiv.append(title, closeBtn);
  return headerDiv;
}

function createLoadingStep(text: string): HTMLDivElement {
  const div = document.createElement('div');
  div.setAttribute('style', 'padding: 40px; display: flex; flex-direction: column; align-items: center; gap: 12px;');
  div.appendChild(createSpinner());
  const label = document.createElement('span');
  label.setAttribute('style', 'color: #706e6b; font-size: 13px;');
  label.textContent = text;
  div.appendChild(label);
  return div;
}

function renderSelectionStep(
  card: HTMLDivElement,
  permissions: ProfilePermissions,
  instanceUrl: string,
  close: () => void
): void {
  const body = document.createElement('div');
  body.setAttribute('style', 'padding: 16px 20px; overflow-y: auto; max-height: 380px;');

  // Profile info summary
  const info = document.createElement('div');
  info.setAttribute('style', 'margin-bottom: 16px; font-size: 13px; color: #706e6b;');
  const counts: string[] = [`Profile: ${permissions.profileName}`];
  if (permissions.objectPermissions.length) counts.push(`${permissions.objectPermissions.length} objects`);
  if (permissions.fieldPermissions.length) counts.push(`${permissions.fieldPermissions.length} fields`);
  if (permissions.userPermissions.length) counts.push(`${permissions.userPermissions.length} user perms`);
  if (permissions.tabSettings.length) counts.push(`${permissions.tabSettings.length} tabs`);
  const seaCount = permissions.apexClassAccess.length + permissions.vfPageAccess.length + permissions.customPermissions.length;
  if (seaCount) counts.push(`${seaCount} access entries`);
  info.textContent = counts.join(' | ');
  body.appendChild(info);

  // Selection sets for each permission type
  const selectedObjects = new Set<number>();
  const selectedFields = new Set<number>();
  const selectedUserPerms = new Set<number>();
  const selectedTabs = new Set<number>();
  const selectedApex = new Set<number>();
  const selectedVF = new Set<number>();
  const selectedCustomPerms = new Set<number>();

  // Object Permissions section
  if (permissions.objectPermissions.length > 0) {
    body.appendChild(createPermissionSection(
      'Object Permissions',
      permissions.objectPermissions,
      (op: ObjectPermission) => op.SobjectType,
      (op: ObjectPermission) => {
        const perms = [];
        if (op.PermissionsRead) perms.push('R');
        if (op.PermissionsCreate) perms.push('C');
        if (op.PermissionsEdit) perms.push('E');
        if (op.PermissionsDelete) perms.push('D');
        if (op.PermissionsViewAllRecords) perms.push('VA');
        if (op.PermissionsModifyAllRecords) perms.push('MA');
        return perms.join(', ');
      },
      selectedObjects,
    ));
  }

  // Field Permissions section
  if (permissions.fieldPermissions.length > 0) {
    body.appendChild(createPermissionSection(
      'Field Permissions',
      permissions.fieldPermissions,
      (fp: FieldPermission) => fp.Field,
      (fp: FieldPermission) => {
        const perms = [];
        if (fp.PermissionsRead) perms.push('Read');
        if (fp.PermissionsEdit) perms.push('Edit');
        return perms.join(', ');
      },
      selectedFields,
    ));
  }

  // User Permissions (System Permissions) section
  if (permissions.userPermissions.length > 0) {
    body.appendChild(createPermissionSection(
      'User Permissions',
      permissions.userPermissions,
      (up: UserPermission) => up.label,
      () => '',
      selectedUserPerms,
    ));
  }

  // Tab Settings section
  if (permissions.tabSettings.length > 0) {
    body.appendChild(createPermissionSection(
      'Tab Settings',
      permissions.tabSettings,
      (ts: TabSetting) => ts.Name,
      (ts: TabSetting) => ts.Visibility,
      selectedTabs,
    ));
  }

  // Apex Class Access section
  if (permissions.apexClassAccess.length > 0) {
    body.appendChild(createPermissionSection(
      'Apex Class Access',
      permissions.apexClassAccess,
      (item: SetupEntityAccessItem) => item.Name,
      () => '',
      selectedApex,
    ));
  }

  // Visualforce Page Access section
  if (permissions.vfPageAccess.length > 0) {
    body.appendChild(createPermissionSection(
      'Visualforce Page Access',
      permissions.vfPageAccess,
      (item: SetupEntityAccessItem) => item.Name,
      () => '',
      selectedVF,
    ));
  }

  // Custom Permissions section
  if (permissions.customPermissions.length > 0) {
    body.appendChild(createPermissionSection(
      'Custom Permissions',
      permissions.customPermissions,
      (item: SetupEntityAccessItem) => item.Name,
      () => '',
      selectedCustomPerms,
    ));
  }

  card.appendChild(body);

  // Footer: name input + create button
  const footer = document.createElement('div');
  footer.setAttribute('style', `
    padding: 16px 20px;
    border-top: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    gap: 12px;
  `);

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Permission Set name...';
  nameInput.value = sanitizeApiName(`${permissions.profileName}_Extracted`);
  nameInput.setAttribute('style', `
    flex: 1; padding: 8px 12px;
    border: 1px solid #d8dde6; border-radius: 4px;
    font-size: 13px; outline: none; color: #181818;
  `);
  nameInput.addEventListener('focus', () => { nameInput.style.borderColor = '#0176d3'; });
  nameInput.addEventListener('blur', () => { nameInput.style.borderColor = '#d8dde6'; });

  const createBtn = createButton('Create Permission Set');
  createBtn.addEventListener('click', async () => {
    const name = sanitizeApiName(nameInput.value.trim());
    if (!name) {
      showToast('Please enter a name');
      return;
    }

    const exists = await permSetExists(instanceUrl, name);
    if (exists) {
      showToast('Permission Set with this name already exists');
      return;
    }

    // Gather selected permissions from all types
    const objPerms = permissions.objectPermissions.filter((_, i) => selectedObjects.has(i));
    const fldPerms = permissions.fieldPermissions.filter((_, i) => selectedFields.has(i));
    const usrPerms = permissions.userPermissions.filter((_, i) => selectedUserPerms.has(i));
    const tabPerms = permissions.tabSettings.filter((_, i) => selectedTabs.has(i));
    const seaPerms = [
      ...permissions.apexClassAccess.filter((_, i) => selectedApex.has(i)),
      ...permissions.vfPageAccess.filter((_, i) => selectedVF.has(i)),
      ...permissions.customPermissions.filter((_, i) => selectedCustomPerms.has(i)),
    ];

    const totalSelected = objPerms.length + fldPerms.length + usrPerms.length + tabPerms.length + seaPerms.length;
    if (totalSelected === 0) {
      showToast('Select at least one permission');
      return;
    }

    // Replace footer with loading
    footer.textContent = '';
    const loadingSpan = document.createElement('span');
    loadingSpan.setAttribute('style', 'display: flex; align-items: center; gap: 8px; color: #706e6b; font-size: 13px;');
    loadingSpan.appendChild(createSpinner(18));
    const loadingText = document.createElement('span');
    loadingText.textContent = `Creating Permission Set with ${totalSelected} permissions...`;
    loadingSpan.appendChild(loadingText);
    footer.appendChild(loadingSpan);

    try {
      const result = await createPermSetViaApi({
        instanceUrl,
        name,
        label: nameInput.value.trim() || name,
        objectPermissions: objPerms,
        fieldPermissions: fldPerms,
        userPermissions: usrPerms,
        tabSettings: tabPerms,
        setupEntityAccess: seaPerms,
      });

      footer.textContent = '';
      const successDiv = document.createElement('div');
      successDiv.setAttribute('style', 'display: flex; align-items: center; gap: 8px; color: #16a34a; font-size: 13px;');
      successDiv.textContent = `Permission Set created successfully!`;

      const openLink = document.createElement('a');
      openLink.href = `${instanceUrl}/lightning/setup/PermSets/page?address=/${result.id}`;
      openLink.target = '_blank';
      openLink.textContent = 'Open';
      openLink.setAttribute('style', 'color: #0176d3; text-decoration: underline; margin-left: 8px;');

      successDiv.appendChild(openLink);
      footer.appendChild(successDiv);
    } catch (err: any) {
      footer.textContent = '';
      const errorDiv = document.createElement('span');
      errorDiv.setAttribute('style', 'color: #ef4444; font-size: 13px;');
      errorDiv.textContent = `Error: ${err.message}`;
      footer.appendChild(errorDiv);
    }
  });

  footer.append(nameInput, createBtn);
  card.appendChild(footer);
}

function createPermissionSection<T>(
  title: string,
  items: T[],
  getLabel: (item: T) => string,
  getDetail: (item: T) => string,
  selectedSet: Set<number>,
): HTMLDivElement {
  const section = document.createElement('div');
  section.setAttribute('style', 'margin-bottom: 16px;');

  // Section header with Select All
  const header = document.createElement('div');
  header.setAttribute('style', `
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px; background: #f3f4f6; border-radius: 6px;
    margin-bottom: 4px;
  `);

  const titleSpan = document.createElement('span');
  titleSpan.setAttribute('style', 'font-size: 13px; font-weight: 600; color: #374151;');
  titleSpan.textContent = `${title} (${items.length})`;

  const selectAllLabel = document.createElement('label');
  selectAllLabel.setAttribute('style', 'display: flex; align-items: center; gap: 6px; font-size: 12px; color: #706e6b; cursor: pointer;');
  const selectAllCb = document.createElement('input');
  selectAllCb.type = 'checkbox';
  selectAllCb.checked = true;
  selectAllLabel.append(selectAllCb);
  selectAllLabel.appendChild(document.createTextNode('Select All'));

  header.append(titleSpan, selectAllLabel);
  section.appendChild(header);

  // Items list
  const list = document.createElement('div');
  list.setAttribute('style', 'max-height: 200px; overflow-y: auto; padding: 4px 0;');

  // Initialize all selected
  items.forEach((_, i) => selectedSet.add(i));

  const checkboxes: HTMLInputElement[] = [];

  items.forEach((item, index) => {
    const row = document.createElement('div');
    row.setAttribute('style', `
      display: flex; align-items: center; gap: 8px;
      padding: 4px 12px; font-size: 12px;
    `);

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.addEventListener('change', () => {
      if (cb.checked) {
        selectedSet.add(index);
      } else {
        selectedSet.delete(index);
      }
      selectAllCb.checked = selectedSet.size === items.length;
    });
    checkboxes.push(cb);

    const label = document.createElement('span');
    label.setAttribute('style', 'color: #181818; font-family: monospace;');
    label.textContent = getLabel(item);

    const detail = document.createElement('span');
    detail.setAttribute('style', 'color: #9ca3af; margin-left: auto;');
    detail.textContent = getDetail(item);

    row.append(cb, label, detail);
    list.appendChild(row);
  });

  selectAllCb.addEventListener('change', () => {
    const checked = selectAllCb.checked;
    checkboxes.forEach((cb, i) => {
      cb.checked = checked;
      if (checked) selectedSet.add(i); else selectedSet.delete(i);
    });
  });

  section.appendChild(list);
  return section;
}

// --- Module ---

const profileToPermset: SFBoostModule = {
  id: 'profile-to-permset',
  name: 'Profile to Permission Set',
  description: 'Extract all Profile permissions to a new Permission Set',
  defaultEnabled: false,

  async init(ctx: ModuleContext) {
    currentCtx = ctx;
    if (isProfilePage()) {
      scheduleInject();
    }
  },

  async onNavigate(ctx: ModuleContext) {
    currentCtx = ctx;
    cancelRetry();
    document.getElementById(BTN_ID)?.remove();
    document.getElementById(MODAL_ID)?.remove();
    document.getElementById(`${MODAL_ID}-backdrop`)?.remove();

    if (isProfilePage()) {
      scheduleInject();
    }
  },

  destroy() {
    cancelRetry();
    document.getElementById(BTN_ID)?.remove();
    document.getElementById(MODAL_ID)?.remove();
    document.getElementById(`${MODAL_ID}-backdrop`)?.remove();
    currentCtx = null;
  },
};

registry.register(profileToPermset);
