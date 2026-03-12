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
import { isAllowedSalesforceDomain } from '../../lib/salesforce-utils';

const BTN_ID = 'sfboost-extract-permset-btn';
const MODAL_ID = 'sfboost-permset-modal';

let currentCtx: ModuleContext | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function getAccessibleDocuments(): Document[] {
  const docs = [document];
  const iframes = document.querySelectorAll('iframe');

  for (const iframe of Array.from(iframes)) {
    try {
      const src = iframe.src || '';
      if (src) {
        const iframeUrl = new URL(src, window.location.origin);
        if (!isAllowedSalesforceDomain(iframeUrl.hostname)) continue;
      }

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc && !docs.includes(iframeDoc)) {
        docs.push(iframeDoc);
      }
    } catch {
      continue;
    }
  }

  return docs;
}

function queryAcrossDocuments(selectors: string[]): Element | null {
  for (const doc of getAccessibleDocuments()) {
    for (const selector of selectors) {
      const match = doc.querySelector(selector);
      if (match) return match;
    }
  }

  return null;
}

function removeByIdAcrossDocuments(id: string): void {
  for (const doc of getAccessibleDocuments()) {
    doc.getElementById(id)?.remove();
  }
}

function findByIdAcrossDocuments(id: string): HTMLElement | null {
  for (const doc of getAccessibleDocuments()) {
    const match = doc.getElementById(id);
    if (match instanceof HTMLElement) return match;
  }

  return null;
}

// --- Page Detection ---

function isProfilePage(): boolean {
  const pathname = window.location.pathname;
  const href = window.location.href;

  // Explicitly exclude PermSet pages (their IDs start with 0PS, not 00e)
  if (pathname.includes('/lightning/setup/PermSets/') || pathname.includes('/lightning/setup/EnhancedPermSets/')) {
    return false;
  }

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
    if (queryAcrossDocuments(['.setupcontent', '.bPageTitle'])) {
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
  if (findByIdAcrossDocuments(BTN_ID)) return true;
  if (!isProfilePage()) return false;

  const profileId = extractProfileIdFromUrl();
  if (!profileId) return false;

  const headerSelectors = [
    '.slds-page-header__title',
    'h1.slds-page-header__title',
    '.setupcontent h1',
    '.bPageTitle .ptBody h2',
  ];

  const header = queryAcrossDocuments(headerSelectors);
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
  closeBtn.setAttribute('aria-label', 'Close');
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

interface CreationNotice {
  type: string;
  name: string;
  error: string;
}

interface SelectionSummary {
  total: number;
  objectPermissions: number;
  fieldPermissions: number;
  userPermissions: number;
  tabSettings: number;
  setupEntityAccess: number;
}

interface NoticeGroup {
  key: string;
  title: string;
  description: string;
  tone: 'warning' | 'danger' | 'neutral';
  items: CreationNotice[];
}

interface ExecutionStageConfig {
  id: string;
  title: string;
  description: string;
}

interface ExecutionStageView {
  row: HTMLDivElement;
  dot: HTMLSpanElement;
  title: HTMLSpanElement;
  description: HTMLSpanElement;
}

interface ExecutionView {
  root: HTMLDivElement;
  statusPill: HTMLSpanElement;
  statusTitle: HTMLHeadingElement;
  statusText: HTMLParagraphElement;
  stageViews: Map<string, ExecutionStageView>;
  resultPanel: HTMLDivElement;
}

const EXECUTION_STAGES: ExecutionStageConfig[] = [
  { id: 'prepare', title: 'Prepare Request', description: 'Checking the selected permissions and preparing the API request.' },
  { id: 'validate-fields', title: 'Validate Fields', description: 'Verifying field permissions against this org and fixing invalid entries.' },
  { id: 'validate-objects', title: 'Validate Objects', description: 'Filtering object permissions that this org can actually accept.' },
  { id: 'create-permset', title: 'Create Permission Set', description: 'Creating the Permission Set container record.' },
  { id: 'apply-objects', title: 'Apply Object Access', description: 'Adding object-level access, including retrying dependencies in a safer order.' },
  { id: 'apply-fields', title: 'Apply Field Access', description: 'Adding field-level access after normalization and validation.' },
  { id: 'apply-users', title: 'Apply User Permissions', description: 'Applying system permissions.' },
  { id: 'apply-tabs', title: 'Apply Tabs', description: 'Adding tab visibility settings.' },
  { id: 'apply-access', title: 'Apply Setup Access', description: 'Adding Apex, Visualforce, and custom permission access entries.' },
  { id: 'finish', title: 'Finish', description: 'Summarizing the outcome and presenting readable results.' },
];

function summarizeSelection(
  objectPermissions: ObjectPermission[],
  fieldPermissions: FieldPermission[],
  userPermissions: UserPermission[],
  tabSettings: TabSetting[],
  setupEntityAccess: SetupEntityAccessItem[],
): SelectionSummary {
  return {
    objectPermissions: objectPermissions.length,
    fieldPermissions: fieldPermissions.length,
    userPermissions: userPermissions.length,
    tabSettings: tabSettings.length,
    setupEntityAccess: setupEntityAccess.length,
    total:
      objectPermissions.length +
      fieldPermissions.length +
      userPermissions.length +
      tabSettings.length +
      setupEntityAccess.length,
  };
}

function setCardExpanded(card: HTMLDivElement): void {
  card.style.width = 'calc(100vw - 48px)';
  card.style.maxWidth = '1080px';
  card.style.height = 'calc(100vh - 48px)';
  card.style.maxHeight = 'calc(100vh - 48px)';
  card.style.borderRadius = '14px';
  card.style.transition = [
    'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
    'opacity 0.15s',
    'width 0.18s ease',
    'height 0.18s ease',
    'max-height 0.18s ease',
    'max-width 0.18s ease',
  ].join(', ');
}

function createStatCard(label: string, value: string, accent = '#0176d3'): HTMLDivElement {
  const card = document.createElement('div');
  card.setAttribute('style', `
    min-width: 64px;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid #dbe4f0;
    background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
    text-align: center;
  `);

  const valueEl = document.createElement('div');
  valueEl.setAttribute('style', `font-size: 16px; font-weight: 700; color: ${accent}; line-height: 1.1;`);
  valueEl.textContent = value;

  const labelEl = document.createElement('div');
  labelEl.setAttribute('style', 'margin-top: 2px; color: #52606d; font-size: 10px;');
  labelEl.textContent = label;

  card.append(valueEl, labelEl);
  return card;
}

function setExecutionStageStyle(view: ExecutionStageView, state: 'pending' | 'active' | 'done' | 'failed'): void {
  const palette = {
    pending: { dot: '#d7dee7', title: '#6b7280', row: '#f8fafc', border: '#e5e7eb' },
    active: { dot: '#0176d3', title: '#0f172a', row: '#eef6ff', border: '#93c5fd' },
    done: { dot: '#16a34a', title: '#14532d', row: '#f0fdf4', border: '#86efac' },
    failed: { dot: '#dc2626', title: '#7f1d1d', row: '#fef2f2', border: '#fca5a5' },
  }[state];

  view.row.style.background = palette.row;
  view.row.style.borderColor = palette.border;
  view.dot.style.background = palette.dot;
  view.title.style.color = palette.title;
}

function updateExecutionStages(view: ExecutionView, activeStageId: string, terminal: 'running' | 'success' | 'failure' = 'running'): void {
  const activeIndex = EXECUTION_STAGES.findIndex((stage) => stage.id === activeStageId);

  EXECUTION_STAGES.forEach((stage, index) => {
    const stageView = view.stageViews.get(stage.id);
    if (!stageView) return;

    if (terminal === 'success') {
      setExecutionStageStyle(stageView, 'done');
      return;
    }

    if (terminal === 'failure') {
      if (index < activeIndex) {
        setExecutionStageStyle(stageView, 'done');
      } else if (index === activeIndex) {
        setExecutionStageStyle(stageView, 'failed');
      } else {
        setExecutionStageStyle(stageView, 'pending');
      }
      return;
    }

    if (index < activeIndex) {
      setExecutionStageStyle(stageView, 'done');
    } else if (index === activeIndex) {
      setExecutionStageStyle(stageView, 'active');
    } else {
      setExecutionStageStyle(stageView, 'pending');
    }
  });
}

function inferExecutionStage(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('validating') && lower.includes('field permissions')) return 'validate-fields';
  if (lower.includes('validating') && lower.includes('object permissions')) return 'validate-objects';
  if (lower.includes('creating permission set')) return 'create-permset';
  if (lower.includes('object permissions')) return 'apply-objects';
  if (lower.includes('field permissions')) return 'apply-fields';
  if (lower.includes('user permissions')) return 'apply-users';
  if (lower.includes('tab settings')) return 'apply-tabs';
  if (lower.includes('setup entity access')) return 'apply-access';
  if (
    lower.includes('rolled back') ||
    lower.includes('permission set created') ||
    lower.includes('errors detected')
  ) {
    return 'finish';
  }

  return 'prepare';
}

function updateActiveStageDescription(view: ExecutionView, stageId: string, message: string): void {
  const stageView = view.stageViews.get(stageId);
  if (stageView) {
    stageView.description.textContent = message;
  }
}

function createExecutionView(summary: SelectionSummary, permissionSetName: string): ExecutionView {
  const root = document.createElement('div');
  root.setAttribute('style', `
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: linear-gradient(180deg, #f8fbff 0%, #f8fafc 100%);
  `);

  // --- Compact top bar ---
  const top = document.createElement('div');
  top.setAttribute('style', `
    flex: 0 0 auto;
    padding: 12px 16px;
    border-bottom: 1px solid #dbe4f0;
    background: rgba(255,255,255,0.88);
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  `);

  const intro = document.createElement('div');
  intro.setAttribute('style', 'flex: 1 1 auto; min-width: 200px; display: flex; flex-direction: column; gap: 4px;');

  const statusRow = document.createElement('div');
  statusRow.setAttribute('style', 'display: flex; align-items: center; gap: 8px;');

  const statusPill = document.createElement('span');
  statusPill.setAttribute('style', `
    padding: 2px 8px;
    border-radius: 999px;
    background: #dbeafe;
    color: #1d4ed8;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  `);
  statusPill.textContent = 'In Progress';

  const statusTitle = document.createElement('h3');
  statusTitle.setAttribute('style', 'margin: 0; font-size: 15px; font-weight: 700; color: #0f172a;');
  statusTitle.textContent = 'Creating Permission Set';

  statusRow.append(statusPill, statusTitle);

  const statusText = document.createElement('p');
  statusText.setAttribute('style', 'margin: 0; color: #64748b; font-size: 11px; line-height: 1.3;');
  statusText.textContent = `Target: ${permissionSetName}`;

  intro.append(statusRow, statusText);

  const statGrid = document.createElement('div');
  statGrid.setAttribute('style', 'flex: 0 0 auto; display: flex; gap: 6px;');
  statGrid.append(
    createStatCard('Requested', `${summary.total}`),
    createStatCard('Objects', `${summary.objectPermissions}`, '#0f766e'),
    createStatCard('Fields', `${summary.fieldPermissions}`, '#7c3aed'),
    createStatCard('Other', `${summary.userPermissions + summary.tabSettings + summary.setupEntityAccess}`, '#b45309'),
  );

  top.append(intro, statGrid);

  // --- Workspace: stages sidebar + result panel ---
  const workspace = document.createElement('div');
  workspace.setAttribute('style', `
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    gap: 12px;
    padding: 12px;
    overflow: hidden;
  `);

  // Execution Stages sidebar
  const stageCard = document.createElement('div');
  stageCard.setAttribute('style', `
    flex: 0 0 240px;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 10px;
    background: rgba(255,255,255,0.92);
    border: 1px solid #dbe4f0;
    border-radius: 10px;
  `);

  const stageHeading = document.createElement('div');
  stageHeading.setAttribute('style', 'font-size: 10px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px;');
  stageHeading.textContent = 'Execution Stages';
  stageCard.appendChild(stageHeading);

  const stageList = document.createElement('div');
  stageList.setAttribute('style', `
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  `);
  stageCard.appendChild(stageList);

  const stageViews = new Map<string, ExecutionStageView>();
  for (const stage of EXECUTION_STAGES) {
    const row = document.createElement('div');
    row.setAttribute('style', `
      display: grid;
      grid-template-columns: 8px minmax(0, 1fr);
      gap: 6px;
      align-items: start;
      padding: 5px 8px;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
    `);

    const dot = document.createElement('span');
    dot.setAttribute('style', 'width: 8px; height: 8px; border-radius: 999px; margin-top: 3px; background: #d7dee7;');

    const textWrap = document.createElement('div');
    textWrap.setAttribute('style', 'display: flex; flex-direction: column; gap: 1px; min-width: 0;');

    const title = document.createElement('span');
    title.setAttribute('style', 'font-size: 11px; font-weight: 600; color: #6b7280;');
    title.textContent = stage.title;

    const description = document.createElement('span');
    description.setAttribute('style', 'font-size: 10px; color: #64748b; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;');
    description.textContent = stage.description;

    textWrap.append(title, description);
    row.append(dot, textWrap);
    stageList.appendChild(row);
    stageViews.set(stage.id, { row, dot, title, description });
  }

  // Result panel (full right side)
  const resultPanel = document.createElement('div');
  resultPanel.setAttribute('style', `
    flex: 1 1 0;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border-radius: 10px;
    border: 1px dashed #cbd5e1;
    background: rgba(255,255,255,0.78);
    color: #475569;
  `);

  const resultHint = document.createElement('div');
  resultHint.setAttribute('style', 'font-size: 12px; line-height: 1.45; color: #64748b; padding: 20px 0; text-align: center;');
  resultHint.textContent = 'Results will appear here when the run finishes. Watch the stage tracker for live progress.';
  resultPanel.appendChild(resultHint);

  workspace.append(stageCard, resultPanel);
  root.append(top, workspace);

  const view: ExecutionView = {
    root,
    statusPill,
    statusTitle,
    statusText,
    stageViews,
    resultPanel,
  };

  updateExecutionStages(view, 'prepare', 'running');
  return view;
}

function categorizeNotice(notice: CreationNotice): Omit<NoticeGroup, 'items'> {
  const error = notice.error.toLowerCase();

  if (error.includes('downgraded to read-only')) {
    return {
      key: 'readonly-downgrade',
      title: 'Converted To Read-Only',
      description: 'These fields exist, but Salesforce does not allow edit access for them in this org. They were kept as read-only instead of causing a failure.',
      tone: 'warning',
    };
  }

  if (error.includes('was not found on')) {
    return {
      key: 'missing-field',
      title: 'Missing Fields In Target Org',
      description: 'These fields were present in the source profile data but are not available in the current org or enabled feature set.',
      tone: 'warning',
    };
  }

  if (error.includes('not permissionable')) {
    return {
      key: 'not-permissionable',
      title: 'Non-Permissionable Fields',
      description: 'Salesforce marked these fields as not permissionable, so they were skipped.',
      tone: 'warning',
    };
  }

  if (error.includes('not allowed by objectpermissions')) {
    return {
      key: 'unsupported-object',
      title: 'Unsupported Object Permissions',
      description: 'These object types cannot receive Object Permissions in this org, so they were skipped before insert.',
      tone: 'warning',
    };
  }

  if (error.includes('ignored duplicate insert') || error.includes('duplicate row exists')) {
    return {
      key: 'duplicate',
      title: 'Duplicate Entries Ignored',
      description: 'Salesforce already had an identical row queued or created for these permissions, so duplicates were ignored safely.',
      tone: 'neutral',
    };
  }

  if (error.includes('rollback')) {
    return {
      key: 'rollback',
      title: 'Rollback Problems',
      description: 'The creation flow hit an error and also had trouble cleaning up the partial Permission Set.',
      tone: 'danger',
    };
  }

  return {
    key: 'other',
    title: 'Other Warnings',
    description: 'These items were adjusted or skipped for reasons that do not fit the common categories.',
    tone: 'warning',
  };
}

function groupNotices(notices: CreationNotice[]): NoticeGroup[] {
  const groups = new Map<string, NoticeGroup>();

  for (const notice of notices) {
    const category = categorizeNotice(notice);
    const existing = groups.get(category.key);
    if (existing) {
      existing.items.push(notice);
      continue;
    }

    groups.set(category.key, {
      ...category,
      items: [notice],
    });
  }

  return [...groups.values()].sort((a, b) => b.items.length - a.items.length);
}

function createOutcomeCard(
  title: string,
  value: string,
  _description: string,
  palette: { background: string; border: string; title: string; value: string },
): HTMLDivElement {
  const card = document.createElement('div');
  card.setAttribute('style', `
    flex: 1 1 0;
    min-width: 80px;
    padding: 8px 10px;
    border-radius: 8px;
    background: ${palette.background};
    border: 1px solid ${palette.border};
    text-align: center;
  `);

  const valueEl = document.createElement('div');
  valueEl.setAttribute('style', `font-size: 18px; font-weight: 700; color: ${palette.value}; line-height: 1.1;`);
  valueEl.textContent = value;

  const label = document.createElement('div');
  label.setAttribute('style', `margin-top: 2px; font-size: 10px; font-weight: 600; color: ${palette.title}; text-transform: uppercase; letter-spacing: 0.03em;`);
  label.textContent = title;

  card.append(valueEl, label);
  return card;
}

function createNoticeGroupSection(group: NoticeGroup, openByDefault = false): HTMLDetailsElement {
  const palette = group.tone === 'danger'
    ? { border: '#fecaca', background: '#fef2f2', title: '#991b1b', badge: '#dc2626' }
    : group.tone === 'neutral'
      ? { border: '#dbe4f0', background: '#f8fafc', title: '#334155', badge: '#64748b' }
      : { border: '#fde68a', background: '#fffaf0', title: '#92400e', badge: '#d97706' };

  const details = document.createElement('details');
  details.open = openByDefault;
  details.setAttribute('style', `
    border: 1px solid ${palette.border};
    border-radius: 8px;
    background: ${palette.background};
    overflow: hidden;
  `);

  const summary = document.createElement('summary');
  summary.setAttribute('style', `
    list-style: none;
    cursor: pointer;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  `);

  const title = document.createElement('span');
  title.setAttribute('style', `font-size: 12px; font-weight: 700; color: ${palette.title};`);
  title.textContent = group.title;

  const badge = document.createElement('span');
  badge.setAttribute('style', `
    flex: 0 0 auto;
    padding: 2px 7px;
    border-radius: 999px;
    background: #ffffff;
    color: ${palette.badge};
    border: 1px solid ${palette.border};
    font-size: 10px;
    font-weight: 700;
  `);
  badge.textContent = `${group.items.length}`;

  summary.append(title, badge);
  details.appendChild(summary);

  const list = document.createElement('div');
  list.setAttribute('style', `
    display: flex;
    flex-direction: column;
    gap: 3px;
    max-height: 300px;
    overflow-y: auto;
    padding: 0 10px 8px;
  `);

  group.items.forEach((item) => {
    const row = document.createElement('div');
    row.setAttribute('style', `
      display: flex;
      gap: 8px;
      padding: 4px 6px;
      border-radius: 4px;
      background: rgba(255,255,255,0.72);
      font-size: 10px;
      line-height: 1.35;
    `);

    const name = document.createElement('span');
    name.setAttribute('style', 'font-family: ui-monospace, SFMono-Regular, Consolas, monospace; color: #0f172a; white-space: nowrap; flex: 0 0 auto; max-width: 200px; overflow: hidden; text-overflow: ellipsis;');
    name.textContent = `${item.type}: ${item.name}`;
    name.title = `${item.type}: ${item.name}`;

    const error = document.createElement('span');
    error.setAttribute('style', 'color: #475569; flex: 1 1 auto; min-width: 0;');
    error.textContent = item.error;

    row.append(name, error);
    list.appendChild(row);
  });

  details.appendChild(list);
  return details;
}

function renderExecutionResult(
  view: ExecutionView,
  result: Awaited<ReturnType<typeof createPermSetViaApi>>,
  instanceUrl: string,
  summary: SelectionSummary,
): void {
  view.resultPanel.textContent = '';
  // Switch from dashed placeholder to solid result container
  view.resultPanel.style.border = '1px solid #dbe4f0';
  view.resultPanel.style.background = 'rgba(255,255,255,0.92)';

  const warningGroups = groupNotices(result.warnings);
  const failureGroups = groupNotices(result.failures);

  view.statusPill.textContent = result.success ? (result.warnings.length > 0 ? 'Completed With Warnings' : 'Completed') : 'Failed';
  view.statusPill.style.background = result.success
    ? (result.warnings.length > 0 ? '#fef3c7' : '#dcfce7')
    : '#fee2e2';
  view.statusPill.style.color = result.success
    ? (result.warnings.length > 0 ? '#92400e' : '#166534')
    : '#991b1b';
  view.statusTitle.textContent = result.success
    ? (result.warnings.length > 0 ? 'Created With Adjustments' : 'Created Successfully')
    : 'Creation Failed';

  // Compact banner with action
  const banner = document.createElement('div');
  banner.setAttribute('style', `
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid ${result.success ? (result.warnings.length > 0 ? '#fde68a' : '#86efac') : '#fca5a5'};
    background: ${result.success
      ? (result.warnings.length > 0 ? '#fffaf0' : '#f0fdf4')
      : '#fef2f2'};
  `);

  const bannerText = document.createElement('div');
  bannerText.setAttribute('style', 'font-size: 12px; line-height: 1.4; color: #475569; flex: 1 1 auto; min-width: 200px;');
  bannerText.textContent = result.success
    ? (result.warnings.length > 0
      ? 'Some permissions were downgraded, skipped, or ignored. Review warnings below.'
      : 'All selected permissions were applied successfully.')
    : (result.rolledBack
      ? 'Request was rejected. The incomplete Permission Set was rolled back.'
      : 'Request was rejected. Rollback did not complete cleanly.');

  banner.appendChild(bannerText);

  const bannerActions = document.createElement('div');
  bannerActions.setAttribute('style', 'display: flex; gap: 8px; align-items: center; flex: 0 0 auto;');

  if (result.success) {
    const openLink = document.createElement('a');
    openLink.href = `${instanceUrl}/lightning/setup/PermSets/page?address=/${result.id}`;
    openLink.target = '_blank';
    openLink.textContent = 'Open Permission Set';
    openLink.setAttribute('style', `
      padding: 6px 12px;
      border-radius: 999px;
      background: #0176d3;
      color: #ffffff;
      text-decoration: none;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    `);
    bannerActions.appendChild(openLink);
  }

  const outcomeChip = document.createElement('span');
  outcomeChip.setAttribute('style', `
    padding: 4px 8px;
    border-radius: 999px;
    border: 1px solid #dbe4f0;
    background: rgba(255,255,255,0.8);
    color: #334155;
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
  `);
  outcomeChip.textContent = result.success ? `Warnings: ${result.warnings.length}` : `Issues: ${result.failures.length}`;
  bannerActions.appendChild(outcomeChip);
  banner.appendChild(bannerActions);

  // Compact metrics row
  const metrics = document.createElement('div');
  metrics.setAttribute('style', 'display: flex; gap: 8px;');
  metrics.append(
    createOutcomeCard(
      'Requested',
      `${summary.total}`,
      '',
      { background: '#eff6ff', border: '#bfdbfe', title: '#1d4ed8', value: '#1d4ed8' },
    ),
    createOutcomeCard(
      'Warnings',
      `${result.warnings.length}`,
      '',
      { background: '#fffaf0', border: '#fde68a', title: '#92400e', value: '#d97706' },
    ),
    createOutcomeCard(
      'Issues',
      `${result.failures.length}`,
      '',
      { background: result.failures.length > 0 ? '#fef2f2' : '#f8fafc', border: result.failures.length > 0 ? '#fecaca' : '#dbe4f0', title: result.failures.length > 0 ? '#991b1b' : '#334155', value: result.failures.length > 0 ? '#dc2626' : '#334155' },
    ),
  );

  // Warning/failure groups - scrollable within result panel
  const groupsWrap = document.createElement('div');
  groupsWrap.setAttribute('style', 'display: flex; flex-direction: column; gap: 8px;');

  if (failureGroups.length > 0) {
    const heading = document.createElement('div');
    heading.setAttribute('style', 'font-size: 12px; font-weight: 700; color: #991b1b;');
    heading.textContent = 'Blocking Issues';
    groupsWrap.appendChild(heading);
    failureGroups.forEach((group, index) => {
      groupsWrap.appendChild(createNoticeGroupSection(group, index === 0));
    });
  }

  if (warningGroups.length > 0) {
    const heading = document.createElement('div');
    heading.setAttribute('style', `font-size: 12px; font-weight: 700; color: ${failureGroups.length > 0 ? '#334155' : '#92400e'};`);
    heading.textContent = 'Warnings And Adjustments';
    groupsWrap.appendChild(heading);
    warningGroups.forEach((group) => {
      groupsWrap.appendChild(createNoticeGroupSection(group, false));
    });
  }

  if (warningGroups.length === 0 && failureGroups.length === 0) {
    const cleanState = document.createElement('div');
    cleanState.setAttribute('style', `
      padding: 10px;
      border-radius: 8px;
      border: 1px solid #bbf7d0;
      background: #f0fdf4;
      color: #166534;
      font-size: 11px;
      line-height: 1.4;
    `);
    cleanState.textContent = 'All selected permissions matched the target org. No adjustments needed.';
    groupsWrap.appendChild(cleanState);
  }

  // Export bar (only if there are notices to export)
  const allNotices = [
    ...result.failures.map((n) => ({ ...n, severity: 'Issue' as const })),
    ...result.warnings.map((n) => ({ ...n, severity: 'Warning' as const })),
  ];

  if (allNotices.length > 0) {
    const exportBar = document.createElement('div');
    exportBar.setAttribute('style', `
      display: flex;
      gap: 6px;
      align-items: center;
    `);

    const exportLabel = document.createElement('span');
    exportLabel.setAttribute('style', 'font-size: 11px; color: #64748b; margin-right: auto;');
    exportLabel.textContent = `Export ${allNotices.length} items:`;

    const buildRows = (): string[][] => {
      const header = ['Severity', 'Category', 'Permission Type', 'API Name', 'Detail'];
      const rows = allNotices.map((n) => {
        const cat = categorizeNotice(n);
        return [n.severity, cat.title, n.type, n.name, n.error];
      });
      return [header, ...rows];
    };

    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy for Excel';
    copyBtn.setAttribute('style', `
      padding: 5px 10px;
      border-radius: 6px;
      border: 1px solid #dbe4f0;
      background: #ffffff;
      color: #334155;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s;
    `);
    copyBtn.addEventListener('mouseenter', () => { copyBtn.style.background = '#f1f5f9'; });
    copyBtn.addEventListener('mouseleave', () => { copyBtn.style.background = '#ffffff'; });
    copyBtn.addEventListener('click', () => {
      const rows = buildRows();
      const tsv = rows.map((r) => r.join('\t')).join('\n');
      navigator.clipboard.writeText(tsv).then(() => {
        const prev = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        copyBtn.style.background = '#f0fdf4';
        copyBtn.style.borderColor = '#86efac';
        copyBtn.style.color = '#166534';
        setTimeout(() => {
          copyBtn.textContent = prev;
          copyBtn.style.background = '#ffffff';
          copyBtn.style.borderColor = '#dbe4f0';
          copyBtn.style.color = '#334155';
        }, 1500);
      });
    });

    const csvBtn = document.createElement('button');
    csvBtn.textContent = 'Download CSV';
    csvBtn.setAttribute('style', `
      padding: 5px 10px;
      border-radius: 6px;
      border: 1px solid #dbe4f0;
      background: #ffffff;
      color: #334155;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s;
    `);
    csvBtn.addEventListener('mouseenter', () => { csvBtn.style.background = '#f1f5f9'; });
    csvBtn.addEventListener('mouseleave', () => { csvBtn.style.background = '#ffffff'; });
    csvBtn.addEventListener('click', () => {
      const rows = buildRows();
      const csvContent = rows.map((r) =>
        r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','),
      ).join('\n');
      const bom = '\uFEFF';
      const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'permset-notices.csv';
      a.click();
      URL.revokeObjectURL(url);
    });

    exportBar.append(exportLabel, copyBtn, csvBtn);
    view.resultPanel.append(banner, metrics, exportBar, groupsWrap);
  } else {
    view.resultPanel.append(banner, metrics, groupsWrap);
  }
}

function renderSelectionStep(
  card: HTMLDivElement,
  permissions: ProfilePermissions,
  instanceUrl: string,
  close: () => void
): void {
  const body = document.createElement('div');
  body.setAttribute('style', 'padding: 16px 20px; flex: 1; overflow-y: auto;');

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

    const summary = summarizeSelection(objPerms, fldPerms, usrPerms, tabPerms, seaPerms);
    if (summary.total === 0) {
      showToast('Select at least one permission');
      return;
    }

    setCardExpanded(card);
    body.remove();
    footer.remove();

    const executionView = createExecutionView(summary, nameInput.value.trim() || name);
    card.appendChild(executionView.root);
    updateExecutionStages(executionView, 'prepare', 'running');

    const progressListener = (msg: any) => {
      if (msg.type === 'sfboost-progress' && msg.message) {
        const message = String(msg.message);
        const stageId = inferExecutionStage(message);
        executionView.statusText.textContent = message;
        updateActiveStageDescription(executionView, stageId, message);
        updateExecutionStages(executionView, stageId, 'running');
      }
    };
    chrome.runtime.onMessage.addListener(progressListener);

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

      executionView.statusText.textContent = result.success
        ? (result.warnings.length > 0 ? 'Creation finished with warnings.' : 'Creation finished successfully.')
        : (result.rolledBack
          ? 'Creation failed and the partial Permission Set was rolled back.'
          : 'Creation failed and rollback did not complete.');
      updateExecutionStages(executionView, 'finish', result.success ? 'success' : 'failure');
      renderExecutionResult(executionView, result, instanceUrl, summary);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      executionView.statusPill.textContent = 'Failed';
      executionView.statusPill.style.background = '#fee2e2';
      executionView.statusPill.style.color = '#991b1b';
      executionView.statusTitle.textContent = 'Unexpected Error';
      executionView.statusText.textContent = message;
      updateExecutionStages(executionView, 'finish', 'failure');
      renderExecutionResult(
        executionView,
        {
          id: '',
          success: false,
          rolledBack: false,
          warnings: [],
          failures: [{ type: 'Error', name: 'createPermSetViaApi', error: message }],
        },
        instanceUrl,
        summary,
      );
    } finally {
      chrome.runtime.onMessage.removeListener(progressListener);
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

  async init(ctx: ModuleContext) {
    currentCtx = ctx;
    if (isProfilePage()) {
      scheduleInject();
    }
  },

  async onNavigate(ctx: ModuleContext) {
    currentCtx = ctx;
    cancelRetry();
    removeByIdAcrossDocuments(BTN_ID);
    document.getElementById(MODAL_ID)?.remove();
    document.getElementById(`${MODAL_ID}-backdrop`)?.remove();

    if (isProfilePage()) {
      scheduleInject();
    }
  },

  destroy() {
    cancelRetry();
    removeByIdAcrossDocuments(BTN_ID);
    document.getElementById(MODAL_ID)?.remove();
    document.getElementById(`${MODAL_ID}-backdrop`)?.remove();
    currentCtx = null;
  },
};

registry.register(profileToPermset);
