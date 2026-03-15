import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';
import { createModal, createSpinner, createButton } from '../../lib/ui-helpers';
import { showToast } from '../../lib/toast';
import { tokens } from '../../lib/design-tokens';
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

  btn.addEventListener('click', () => openWizard(profileId));

  // Wrap header + button in a flex row so they sit on the same line
  const wrapper = document.createElement('div');
  wrapper.setAttribute('style', `display: flex; align-items: center; gap: ${tokens.space.md}; flex-wrap: wrap;`);

  if (header.parentElement) {
    header.parentElement.insertBefore(wrapper, header);
    wrapper.appendChild(header);
    wrapper.appendChild(btn);
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

  // Close guard state
  let creationFinished = false;
  let hasNotices = false;
  let reportExported = false;

  const { card, close } = createModal(MODAL_ID, {
    width: '700px',
    maxHeight: '560px',
    onBeforeClose: () => {
      if (creationFinished && hasNotices && !reportExported) {
        return window.confirm('The report has not been copied or downloaded.\nWarnings and issues will be lost.\n\nClose anyway?');
      }
      return true;
    },
  });

  // Header
  const headerDiv = createHeader('Extract Profile to Permission Set', close);
  card.appendChild(headerDiv);

  // Loading step
  const loadingDiv = createLoadingStep('Reading profile permissions...');
  card.appendChild(loadingDiv);

  try {
    const permissions = await readProfilePermissions(instanceUrl, profileId);
    loadingDiv.remove();
    renderSelectionStep(card, permissions, instanceUrl, close, {
      onCreationFinished: (result) => {
        creationFinished = true;
        hasNotices = result.failures.length > 0 || result.warnings.length > 0;
      },
      onReportExported: () => { reportExported = true; },
    });
  } catch (err: any) {
    loadingDiv.remove();
    const errorDiv = document.createElement('div');
    errorDiv.setAttribute('style', `padding: ${tokens.space['2xl']}; color: ${tokens.color.error}; font-size: ${tokens.font.size.base};`);
    errorDiv.textContent = `Error reading profile: ${err.message}`;
    card.appendChild(errorDiv);
  }
}

function createHeader(titleText: string, close: () => void): HTMLDivElement {
  const headerDiv = document.createElement('div');
  headerDiv.setAttribute('style', `
    padding: ${tokens.space.xl} ${tokens.space['2xl']};
    border-bottom: 1px solid ${tokens.color.borderDefault};
    display: flex;
    align-items: center;
    justify-content: space-between;
  `);

  const title = document.createElement('h2');
  title.setAttribute('style', `margin: 0; font-size: ${tokens.font.size.lg}; font-weight: ${tokens.font.weight.bold}; color: ${tokens.color.textPrimary};`);
  title.textContent = titleText;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '\u00d7';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.setAttribute('style', `
    border: none; background: none; font-size: 22px; cursor: pointer;
    color: ${tokens.color.textSalesforceGray}; padding: 0 ${tokens.space.xs}; line-height: 1;
  `);
  closeBtn.addEventListener('click', close);

  headerDiv.append(title, closeBtn);
  return headerDiv;
}

function createLoadingStep(text: string): HTMLDivElement {
  const div = document.createElement('div');
  div.setAttribute('style', `padding: 40px; display: flex; flex-direction: column; align-items: center; gap: ${tokens.space.lg};`);
  div.appendChild(createSpinner());
  const label = document.createElement('span');
  label.setAttribute('style', `color: ${tokens.color.textSalesforceGray}; font-size: ${tokens.font.size.base};`);
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
  /** Whether items in this group ended up in the Permission Set */
  appliedStatus: 'applied-modified' | 'skipped' | 'auto-added';
  /** Whether the user can manually fix these items */
  fixable: boolean;
  /** Step-by-step instructions shown when fixable === true */
  howToFix?: string;
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

interface StatCardRefs {
  requested: HTMLDivElement;
  requestedLabel: HTMLDivElement;
  objects: HTMLDivElement;
  objectsLabel: HTMLDivElement;
  fields: HTMLDivElement;
  fieldsLabel: HTMLDivElement;
  other: HTMLDivElement;
  otherLabel: HTMLDivElement;
}

interface ExecutionView {
  root: HTMLDivElement;
  statusPill: HTMLSpanElement;
  statusTitle: HTMLHeadingElement;
  statusText: HTMLParagraphElement;
  stageViews: Map<string, ExecutionStageView>;
  resultPanel: HTMLDivElement;
  statRefs: StatCardRefs;
  progressBarFill: HTMLDivElement;
  elapsedSpan: HTMLSpanElement;
  etaSpan: HTMLSpanElement;
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
  card.style.borderRadius = tokens.radius.xl;
  card.style.transition = [
    `transform ${tokens.transition.modalEase}`,
    `opacity ${tokens.transition.normal}`,
    `width ${tokens.transition.normal} ease`,
    `height ${tokens.transition.normal} ease`,
    `max-height ${tokens.transition.normal} ease`,
    `max-width ${tokens.transition.normal} ease`,
  ].join(', ');
}

function createStatCard(label: string, value: string, accent: string = tokens.color.primary): { card: HTMLDivElement; valueEl: HTMLDivElement; labelEl: HTMLDivElement } {
  const card = document.createElement('div');
  card.setAttribute('style', `
    min-width: 64px;
    padding: ${tokens.space.sm} ${tokens.space.lg};
    border-radius: ${tokens.radius.lg};
    border: 1px solid ${tokens.color.borderInput};
    background: linear-gradient(180deg, ${tokens.color.surfaceBase} 0%, ${tokens.color.surfaceRaised} 100%);
    text-align: center;
  `);

  const valueEl = document.createElement('div');
  valueEl.setAttribute('style', `font-size: ${tokens.font.size.lg}; font-weight: ${tokens.font.weight.bold}; color: ${accent}; line-height: 1.1;`);
  valueEl.textContent = value;

  const labelEl = document.createElement('div');
  labelEl.setAttribute('style', `margin-top: 2px; color: ${tokens.color.textSecondary}; font-size: ${tokens.font.size.xs};`);
  labelEl.textContent = label;

  card.append(valueEl, labelEl);
  return { card, valueEl, labelEl };
}

function setExecutionStageStyle(view: ExecutionStageView, state: 'pending' | 'active' | 'done' | 'failed'): void {
  const palette = {
    pending: { dot: '#d7dee7', title: tokens.color.textTertiary, row: tokens.color.surfaceRaised, border: tokens.color.borderDefault },
    active: { dot: tokens.color.primary, title: tokens.color.textPrimary, row: tokens.color.infoLight, border: tokens.color.infoBorder },
    done: { dot: tokens.color.success, title: tokens.color.successText, row: tokens.color.successLight, border: tokens.color.successBorder },
    failed: { dot: tokens.color.error, title: tokens.color.errorText, row: tokens.color.errorLight, border: tokens.color.errorBorder },
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

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function createExecutionView(summary: SelectionSummary, permissionSetName: string): ExecutionView {
  const root = document.createElement('div');
  root.setAttribute('style', `
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: linear-gradient(180deg, ${tokens.color.surfaceRaised} 0%, #f8fafc 100%);
  `);

  // --- Compact top bar ---
  const top = document.createElement('div');
  top.setAttribute('style', `
    flex: 0 0 auto;
    padding: ${tokens.space.lg} ${tokens.space.xl};
    border-bottom: 1px solid ${tokens.color.borderDefault};
    background: rgba(255,255,255,0.88);
    display: flex;
    align-items: center;
    gap: ${tokens.space.lg};
    flex-wrap: wrap;
  `);

  const intro = document.createElement('div');
  intro.setAttribute('style', 'flex: 1 1 auto; min-width: 200px; display: flex; flex-direction: column; gap: ${tokens.space.xs};');

  const statusRow = document.createElement('div');
  statusRow.setAttribute('style', `display: flex; align-items: center; gap: ${tokens.space.md};`);

  const statusPill = document.createElement('span');
  statusPill.setAttribute('style', `
    padding: 2px ${tokens.space.md};
    border-radius: ${tokens.radius.pill};
    background: ${tokens.color.infoLight};
    color: ${tokens.color.infoText};
    font-size: ${tokens.font.size.xs};
    font-weight: ${tokens.font.weight.bold};
    letter-spacing: 0.04em;
    text-transform: uppercase;
  `);
  statusPill.textContent = 'In Progress';

  const statusTitle = document.createElement('h3');
  statusTitle.setAttribute('style', `margin: 0; font-size: 15px; font-weight: ${tokens.font.weight.bold}; color: ${tokens.color.textPrimary};`);
  statusTitle.textContent = 'Creating Permission Set';

  statusRow.append(statusPill, statusTitle);

  const statusText = document.createElement('p');
  statusText.setAttribute('style', `margin: 0; color: ${tokens.color.textTertiary}; font-size: ${tokens.font.size.sm}; line-height: 1.3;`);
  statusText.textContent = `Target: ${permissionSetName}`;

  intro.append(statusRow, statusText);

  const statGrid = document.createElement('div');
  statGrid.setAttribute('style', `flex: 0 0 auto; display: flex; gap: ${tokens.space.sm};`);
  const requestedStat = createStatCard('Requested', `${summary.total}`);
  const objectsStat = createStatCard('Objects', `${summary.objectPermissions}`, tokens.color.envTrailhead);
  const fieldsStat = createStatCard('Fields', `${summary.fieldPermissions}`, tokens.color.envScratch);
  const otherStat = createStatCard('Other', `${summary.userPermissions + summary.tabSettings + summary.setupEntityAccess}`, tokens.color.warning);
  statGrid.append(requestedStat.card, objectsStat.card, fieldsStat.card, otherStat.card);

  top.append(intro, statGrid);

  // --- Workspace: stages sidebar + result panel ---
  const workspace = document.createElement('div');
  workspace.setAttribute('style', `
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    gap: ${tokens.space.lg};
    padding: ${tokens.space.lg};
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
    border: 1px solid ${tokens.color.borderDefault};
    border-radius: ${tokens.radius.xl};
  `);

  const stageHeading = document.createElement('div');
  stageHeading.setAttribute('style', `font-size: ${tokens.font.size.xs}; font-weight: ${tokens.font.weight.bold}; color: ${tokens.color.textSecondary}; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: ${tokens.space.sm};`);
  stageHeading.textContent = 'Execution Stages';
  stageCard.appendChild(stageHeading);

  const stageList = document.createElement('div');
  stageList.setAttribute('style', `
    display: flex;
    flex-direction: column;
    gap: ${tokens.space.xs};
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
      gap: ${tokens.space.sm};
      align-items: start;
      padding: 5px ${tokens.space.md};
      border-radius: ${tokens.radius.md};
      border: 1px solid ${tokens.color.borderDefault};
    `);

    const dot = document.createElement('span');
    dot.setAttribute('style', `width: 8px; height: 8px; border-radius: ${tokens.radius.pill}; margin-top: 3px; background: #d7dee7;`);

    const textWrap = document.createElement('div');
    textWrap.setAttribute('style', 'display: flex; flex-direction: column; gap: 1px; min-width: 0;');

    const title = document.createElement('span');
    title.setAttribute('style', `font-size: ${tokens.font.size.sm}; font-weight: ${tokens.font.weight.semibold}; color: ${tokens.color.textTertiary};`);
    title.textContent = stage.title;

    const description = document.createElement('span');
    description.setAttribute('style', `font-size: ${tokens.font.size.xs}; color: ${tokens.color.textTertiary}; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`);
    description.textContent = stage.description;

    textWrap.append(title, description);
    row.append(dot, textWrap);
    stageList.appendChild(row);
    stageViews.set(stage.id, { row, dot, title, description });
  }

  // Progress bar and timer section at bottom of stage card
  const progressSection = document.createElement('div');
  progressSection.setAttribute('style', `
    margin-top: auto;
    padding: ${tokens.space.md} 0 0;
    border-top: 1px solid ${tokens.color.borderDefault};
  `);

  const progressBarTrack = document.createElement('div');
  progressBarTrack.setAttribute('style', `
    height: 4px;
    border-radius: ${tokens.radius.pill};
    background: ${tokens.color.surfaceSubtle};
    overflow: hidden;
    margin-bottom: ${tokens.space.xs};
  `);

  const progressBarFill = document.createElement('div');
  progressBarFill.setAttribute('style', `
    height: 100%;
    width: 0%;
    border-radius: ${tokens.radius.pill};
    background: ${tokens.color.primary};
    transition: width ${tokens.transition.normal} ease;
  `);
  progressBarTrack.appendChild(progressBarFill);

  const timerRow = document.createElement('div');
  timerRow.setAttribute('style', `
    display: flex;
    justify-content: space-between;
    font-size: ${tokens.font.size.xs};
    color: ${tokens.color.textTertiary};
  `);

  const elapsedSpan = document.createElement('span');
  elapsedSpan.textContent = '0:00';

  const etaSpan = document.createElement('span');
  etaSpan.textContent = '';

  timerRow.append(elapsedSpan, etaSpan);
  progressSection.append(progressBarTrack, timerRow);
  stageCard.appendChild(progressSection);

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
    padding: ${tokens.space.lg};
    border-radius: ${tokens.radius.xl};
    border: 1px dashed ${tokens.color.borderMuted};
    background: rgba(255,255,255,0.78);
    color: ${tokens.color.textSecondary};
  `);

  const resultHint = document.createElement('div');
  resultHint.setAttribute('style', `font-size: 12px; line-height: 1.45; color: ${tokens.color.textTertiary}; padding: ${tokens.space['2xl']} 0; text-align: center;`);
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
    statRefs: {
      requested: requestedStat.valueEl,
      requestedLabel: requestedStat.labelEl,
      objects: objectsStat.valueEl,
      objectsLabel: objectsStat.labelEl,
      fields: fieldsStat.valueEl,
      fieldsLabel: fieldsStat.labelEl,
      other: otherStat.valueEl,
      otherLabel: otherStat.labelEl,
    },
    progressBarFill,
    elapsedSpan,
    etaSpan,
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
      description: 'These field permissions ARE in the Permission Set, but with Read access only (not Edit). This happens when Salesforce marks a field as non-updateable — for example formula fields, auto-number fields, or fields locked at the object level.',
      appliedStatus: 'applied-modified',
      fixable: false,
      howToFix: undefined,
      tone: 'warning',
    };
  }

  if (error.includes('was not found on')) {
    return {
      key: 'missing-field',
      title: 'Missing Fields In Target Org',
      description: 'These field permissions are NOT in the Permission Set. The fields do not exist in this org — typically custom fields that have not been deployed yet, or features that are not enabled.',
      appliedStatus: 'skipped',
      fixable: true,
      howToFix: '1. Deploy the missing custom fields to this org via a Change Set, Metadata API, or Salesforce CLI.\n2. After deployment, open the Permission Set → Object Settings → find the object → click Edit → enable the field permissions manually.\nAlternatively, re-run "Extract to Permission Set" after deploying — the extraction will pick up the newly available fields.',
      tone: 'warning',
    };
  }

  if (error.includes('not permissionable')) {
    return {
      key: 'not-permissionable',
      title: 'Non-Permissionable Fields',
      description: 'These field permissions are NOT in the Permission Set. Salesforce has marked these fields as system-managed and non-permissionable — typically Id, CreatedById, LastModifiedById, or fields on platform-controlled objects. No Permission Set can control them.',
      appliedStatus: 'skipped',
      fixable: false,
      howToFix: undefined,
      tone: 'warning',
    };
  }

  if (error.includes('not allowed by objectpermissions') || error.includes('is not supported for objectpermissions')) {
    return {
      key: 'unsupported-object',
      title: 'Unsupported Object Permissions',
      description: 'These object permissions are NOT in the Permission Set. Salesforce does not allow Permission Set-based access control for these object types — typically internal platform objects, virtual objects, or feature-specific records that Salesforce manages automatically.',
      appliedStatus: 'skipped',
      fixable: false,
      howToFix: undefined,
      tone: 'warning',
    };
  }

  if (error.includes('auto-added read permission')) {
    return {
      key: 'auto-resolved-dependency',
      title: 'Auto-Resolved Dependencies',
      description: 'These object permissions were automatically added because Salesforce requires them as prerequisites for other objects in the set. For example, granting access to Asset requires Read on Account.',
      appliedStatus: 'auto-added',
      fixable: false,
      howToFix: undefined,
      tone: 'neutral',
    };
  }

  if (error.includes('ignored duplicate insert') || error.includes('duplicate row exists')) {
    return {
      key: 'duplicate',
      title: 'Duplicate Entries Ignored',
      description: 'These permissions already existed in the Permission Set (possibly from a previous run). Duplicates were safely ignored — the existing permissions are still in place.',
      appliedStatus: 'applied-modified',
      fixable: false,
      howToFix: undefined,
      tone: 'neutral',
    };
  }

  if (error.includes('rollback')) {
    return {
      key: 'rollback',
      title: 'Rollback Problems',
      description: 'The creation flow encountered a critical error and also had trouble cleaning up the partial Permission Set.',
      appliedStatus: 'skipped',
      fixable: false,
      howToFix: undefined,
      tone: 'danger',
    };
  }

  return {
    key: 'other',
    title: 'Other Warnings',
    description: 'These items were adjusted or skipped for reasons that do not fit the common categories.',
    appliedStatus: 'skipped',
    fixable: false,
    howToFix: undefined,
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
): { card: HTMLDivElement; valueEl: HTMLDivElement } {
  const card = document.createElement('div');
  card.setAttribute('style', `
    flex: 1 1 0;
    min-width: 80px;
    padding: ${tokens.space.md} 10px;
    border-radius: ${tokens.radius.lg};
    background: ${palette.background};
    border: 1px solid ${palette.border};
    text-align: center;
  `);

  const valueEl = document.createElement('div');
  valueEl.setAttribute('style', `font-size: 18px; font-weight: ${tokens.font.weight.bold}; color: ${palette.value}; line-height: 1.1;`);
  valueEl.textContent = value;

  const label = document.createElement('div');
  label.setAttribute('style', `margin-top: 2px; font-size: ${tokens.font.size.xs}; font-weight: ${tokens.font.weight.semibold}; color: ${palette.title}; text-transform: uppercase; letter-spacing: 0.03em;`);
  label.textContent = title;

  card.append(valueEl, label);
  return { card, valueEl };
}

function createNoticeGroupSection(group: NoticeGroup, openByDefault = false): HTMLDetailsElement {
  const palette = group.tone === 'danger'
    ? { border: tokens.color.errorBorder, background: tokens.color.errorLight, title: tokens.color.errorText, badge: tokens.color.error }
    : group.tone === 'neutral'
      ? { border: tokens.color.borderDefault, background: tokens.color.surfaceRaised, title: tokens.color.textSecondary, badge: tokens.color.textTertiary }
      : { border: tokens.color.warningBorder, background: tokens.color.warningLight, title: tokens.color.warningText, badge: tokens.color.warning };

  // Status badge config
  const statusConfig = group.appliedStatus === 'applied-modified'
    ? { label: '✓ Applied (modified)', bg: '#dcfce7', color: tokens.color.successText, border: tokens.color.successBorder }
    : group.appliedStatus === 'auto-added'
      ? { label: '✓ Auto-Added', bg: tokens.color.infoLight, color: tokens.color.infoText, border: tokens.color.infoBorder }
      : { label: '⊘ Not Applied', bg: '#f3f4f6', color: tokens.color.textSecondary, border: tokens.color.borderDefault };

  const details = document.createElement('details');
  details.open = openByDefault;
  details.setAttribute('style', `
    border: 1px solid ${palette.border};
    border-radius: ${tokens.radius.lg};
    background: ${palette.background};
    overflow: hidden;
  `);

  const summary = document.createElement('summary');
  summary.setAttribute('style', `
    list-style: none;
    cursor: pointer;
    padding: ${tokens.space.md} 10px;
    display: flex;
    align-items: center;
    gap: ${tokens.space.md};
  `);

  const titleWrap = document.createElement('div');
  titleWrap.setAttribute('style', 'flex: 1 1 auto; display: flex; align-items: center; gap: 8px; min-width: 0;');

  const title = document.createElement('span');
  title.setAttribute('style', `font-size: 12px; font-weight: ${tokens.font.weight.bold}; color: ${palette.title}; white-space: nowrap;`);
  title.textContent = group.title;

  const statusBadge = document.createElement('span');
  statusBadge.setAttribute('style', `
    padding: 1px 7px;
    border-radius: ${tokens.radius.pill};
    background: ${statusConfig.bg};
    color: ${statusConfig.color};
    border: 1px solid ${statusConfig.border};
    font-size: 10px;
    font-weight: ${tokens.font.weight.semibold};
    white-space: nowrap;
    flex-shrink: 0;
  `);
  statusBadge.textContent = statusConfig.label;

  titleWrap.append(title, statusBadge);

  const badge = document.createElement('span');
  badge.setAttribute('style', `
    flex: 0 0 auto;
    padding: 2px 7px;
    border-radius: ${tokens.radius.pill};
    background: ${tokens.color.surfaceBase};
    color: ${palette.badge};
    border: 1px solid ${palette.border};
    font-size: ${tokens.font.size.xs};
    font-weight: ${tokens.font.weight.bold};
  `);
  badge.textContent = `${group.items.length}`;

  summary.append(titleWrap, badge);
  details.appendChild(summary);

  // Info section: description + how-to-fix (shown inside the accordion, above item list)
  const infoSection = document.createElement('div');
  infoSection.setAttribute('style', `padding: 0 10px ${tokens.space.md};`);

  const descriptionEl = document.createElement('p');
  descriptionEl.setAttribute('style', `
    margin: 0 0 ${tokens.space.sm};
    font-size: ${tokens.font.size.xs};
    line-height: 1.5;
    color: ${tokens.color.textSecondary};
  `);
  descriptionEl.textContent = group.description;
  infoSection.appendChild(descriptionEl);

  if (group.fixable && group.howToFix) {
    const fixBox = document.createElement('div');
    fixBox.setAttribute('style', `
      padding: ${tokens.space.sm} ${tokens.space.md};
      border-radius: ${tokens.radius.md};
      border: 1px solid ${tokens.color.successBorder};
      background: ${tokens.color.successLight};
      margin-bottom: ${tokens.space.sm};
    `);

    const fixTitle = document.createElement('div');
    fixTitle.setAttribute('style', `font-size: ${tokens.font.size.xs}; font-weight: ${tokens.font.weight.bold}; color: ${tokens.color.successText}; margin-bottom: 4px;`);
    fixTitle.textContent = '✦ How to fix';
    fixBox.appendChild(fixTitle);

    const fixSteps = group.howToFix.split('\n');
    for (const step of fixSteps) {
      const stepEl = document.createElement('p');
      stepEl.setAttribute('style', `margin: 2px 0; font-size: ${tokens.font.size.xs}; line-height: 1.5; color: ${tokens.color.successText};`);
      stepEl.textContent = step;
      fixBox.appendChild(stepEl);
    }

    infoSection.appendChild(fixBox);
  } else if (!group.fixable && group.appliedStatus === 'skipped') {
    const noFixNote = document.createElement('p');
    noFixNote.setAttribute('style', `
      margin: 0 0 ${tokens.space.sm};
      font-size: ${tokens.font.size.xs};
      color: ${tokens.color.textTertiary};
      font-style: italic;
    `);
    noFixNote.textContent = 'No action possible — this is a Salesforce platform limitation.';
    infoSection.appendChild(noFixNote);
  }

  details.appendChild(infoSection);

  // Item list — no nested scroll; flows naturally in the main result panel scroll.
  // For long lists, show first VISIBLE_LIMIT items with a "Show all" toggle.
  const VISIBLE_LIMIT = 15;
  const list = document.createElement('div');
  list.setAttribute('style', `
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 0 10px ${tokens.space.md};
  `);

  const createItemRow = (item: { name: string; type: string }): HTMLDivElement => {
    const row = document.createElement('div');
    row.setAttribute('style', `
      display: flex;
      gap: ${tokens.space.md};
      padding: ${tokens.space.xs} ${tokens.space.sm};
      border-radius: ${tokens.radius.sm};
      background: rgba(255,255,255,0.72);
      font-size: ${tokens.font.size.xs};
      line-height: 1.35;
    `);

    const name = document.createElement('span');
    name.setAttribute('style', `font-family: ${tokens.font.family.mono}; color: ${tokens.color.textPrimary}; white-space: nowrap; flex: 0 0 auto; max-width: 220px; overflow: hidden; text-overflow: ellipsis;`);
    name.textContent = item.name;
    name.title = `${item.type}: ${item.name}`;

    row.appendChild(name);
    return row;
  };

  const needsTruncation = group.items.length > VISIBLE_LIMIT;
  const visibleItems = needsTruncation ? group.items.slice(0, VISIBLE_LIMIT) : group.items;
  const hiddenItems = needsTruncation ? group.items.slice(VISIBLE_LIMIT) : [];

  visibleItems.forEach((item) => list.appendChild(createItemRow(item)));

  if (needsTruncation) {
    const hiddenContainer = document.createElement('div');
    hiddenContainer.setAttribute('style', 'display: none; flex-direction: column; gap: 3px;');
    hiddenItems.forEach((item) => hiddenContainer.appendChild(createItemRow(item)));
    list.appendChild(hiddenContainer);

    const toggleBtn = document.createElement('button');
    toggleBtn.setAttribute('style', `
      margin-top: ${tokens.space.xs};
      padding: ${tokens.space.xs} ${tokens.space.sm};
      border: 1px solid ${palette.border};
      border-radius: ${tokens.radius.md};
      background: rgba(255,255,255,0.6);
      color: ${palette.title};
      font-size: ${tokens.font.size.xs};
      font-weight: ${tokens.font.weight.semibold};
      cursor: pointer;
      align-self: flex-start;
      transition: background ${tokens.transition.normal};
    `);
    toggleBtn.textContent = `Show all ${group.items.length} items`;
    toggleBtn.addEventListener('mouseenter', () => { toggleBtn.style.background = 'rgba(255,255,255,0.9)'; });
    toggleBtn.addEventListener('mouseleave', () => { toggleBtn.style.background = 'rgba(255,255,255,0.6)'; });
    toggleBtn.addEventListener('click', () => {
      const isHidden = hiddenContainer.style.display === 'none';
      hiddenContainer.style.display = isHidden ? 'flex' : 'none';
      toggleBtn.textContent = isHidden
        ? `Show first ${VISIBLE_LIMIT} items`
        : `Show all ${group.items.length} items`;
    });
    list.appendChild(toggleBtn);
  }

  details.appendChild(list);
  return details;
}

function renderExecutionResult(
  view: ExecutionView,
  result: Awaited<ReturnType<typeof createPermSetViaApi>>,
  instanceUrl: string,
  summary: SelectionSummary,
  options: { permSetLabel: string; elapsedMs: number; onExport: () => void },
): void {
  view.resultPanel.textContent = '';
  // Switch from dashed placeholder to solid result container
  view.resultPanel.style.border = `1px solid ${tokens.color.borderDefault}`;
  view.resultPanel.style.background = 'rgba(255,255,255,0.92)';

  const warningGroups = groupNotices(result.warnings);
  const failureGroups = groupNotices(result.failures);

  const hasFailures = result.failures.length > 0;
  const hasWarnings = result.warnings.length > 0;

  if (result.success) {
    if (hasFailures) {
      view.statusPill.textContent = 'Partial Success';
      view.statusPill.style.background = tokens.color.warningLight;
      view.statusPill.style.color = tokens.color.warningText;
      view.statusTitle.textContent = 'Created With Some Issues';
    } else if (hasWarnings) {
      view.statusPill.textContent = 'Completed With Warnings';
      view.statusPill.style.background = '#fef3c7';
      view.statusPill.style.color = tokens.color.warningText;
      view.statusTitle.textContent = 'Created With Adjustments';
    } else {
      view.statusPill.textContent = 'Completed';
      view.statusPill.style.background = '#dcfce7';
      view.statusPill.style.color = tokens.color.successText;
      view.statusTitle.textContent = 'Created Successfully';
    }
  } else {
    view.statusPill.textContent = 'Failed';
    view.statusPill.style.background = tokens.color.errorLight;
    view.statusPill.style.color = tokens.color.errorText;
    view.statusTitle.textContent = 'Creation Failed';
  }

  // Compact banner with action
  const banner = document.createElement('div');
  banner.setAttribute('style', `
    display: flex;
    flex-wrap: wrap;
    gap: ${tokens.space.md};
    justify-content: space-between;
    align-items: center;
    padding: 10px ${tokens.space.lg};
    border-radius: ${tokens.radius.xl};
    border: 1px solid ${result.success
      ? (hasFailures ? tokens.color.warningBorder : (hasWarnings ? tokens.color.warningBorder : tokens.color.successBorder))
      : tokens.color.errorBorder};
    background: ${result.success
      ? (hasFailures ? tokens.color.warningLight : (hasWarnings ? tokens.color.warningLight : tokens.color.successLight))
      : tokens.color.errorLight};
  `);

  const bannerText = document.createElement('div');
  bannerText.setAttribute('style', `font-size: 12px; line-height: 1.4; color: ${tokens.color.textSecondary}; flex: 1 1 auto; min-width: 200px;`);
  if (result.success) {
    if (hasFailures) {
      bannerText.textContent = 'Permission Set was created. Some individual permissions could not be applied. Review issues below.';
    } else if (hasWarnings) {
      bannerText.textContent = 'Some permissions were downgraded, skipped, or ignored. Review warnings below.';
    } else {
      bannerText.textContent = 'All selected permissions were applied successfully.';
    }
  } else {
    bannerText.textContent = result.rolledBack
      ? 'Request was rejected. The incomplete Permission Set was rolled back.'
      : 'Request was rejected. Rollback did not complete cleanly.';
  }

  banner.appendChild(bannerText);

  const bannerActions = document.createElement('div');
  bannerActions.setAttribute('style', `display: flex; gap: ${tokens.space.md}; align-items: center; flex: 0 0 auto;`);

  if (result.success) {
    const openLink = document.createElement('a');
    openLink.href = `${instanceUrl}/lightning/setup/PermSets/page?address=/${result.id}`;
    openLink.target = '_blank';
    openLink.textContent = 'Open Permission Set';
    openLink.setAttribute('style', `
      padding: ${tokens.space.sm} ${tokens.space.lg};
      border-radius: ${tokens.radius.pill};
      background: ${tokens.color.primary};
      color: ${tokens.color.textOnPrimary};
      text-decoration: none;
      font-size: ${tokens.font.size.sm};
      font-weight: ${tokens.font.weight.bold};
      white-space: nowrap;
    `);
    bannerActions.appendChild(openLink);
  }

  const outcomeChip = document.createElement('span');
  outcomeChip.setAttribute('style', `
    padding: ${tokens.space.xs} ${tokens.space.md};
    border-radius: ${tokens.radius.pill};
    border: 1px solid ${tokens.color.borderDefault};
    background: rgba(255,255,255,0.8);
    color: ${tokens.color.textSecondary};
    font-size: ${tokens.font.size.xs};
    font-weight: ${tokens.font.weight.semibold};
    white-space: nowrap;
  `);
  if (hasFailures && hasWarnings) {
    outcomeChip.textContent = `${result.failures.length} issues, ${result.warnings.length} warnings`;
  } else if (hasFailures) {
    outcomeChip.textContent = `Issues: ${result.failures.length}`;
  } else {
    outcomeChip.textContent = `Warnings: ${result.warnings.length}`;
  }
  bannerActions.appendChild(outcomeChip);
  banner.appendChild(bannerActions);

  // Permission Set name and elapsed time info row
  const infoRow = document.createElement('div');
  infoRow.setAttribute('style', `
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: ${tokens.font.size.sm};
    color: ${tokens.color.textSecondary};
  `);
  const nameSpan = document.createElement('span');
  nameSpan.setAttribute('style', `font-weight: ${tokens.font.weight.semibold};`);
  nameSpan.textContent = options.permSetLabel;
  const timeSpan = document.createElement('span');
  timeSpan.setAttribute('style', `color: ${tokens.color.textTertiary};`);
  timeSpan.textContent = `Completed in ${formatDuration(options.elapsedMs)}`;
  infoRow.append(nameSpan, timeSpan);

  // Compute applied count from stats
  const stats = result.stats;
  const totalApplied = stats
    ? stats.objects.applied + stats.fields.applied + stats.userPermissions.applied + stats.tabs.applied + stats.setupEntityAccess.applied
    : null;

  // Update header stat cards with post-execution data
  if (stats) {
    view.statRefs.requested.textContent = `${totalApplied}`;
    view.statRefs.requestedLabel.textContent = 'Applied';
    view.statRefs.objects.textContent = `${stats.objects.applied}`;
    if (stats.objects.autoAdded > 0) {
      view.statRefs.objectsLabel.textContent = `Objects (+${stats.objects.autoAdded})`;
    }
    view.statRefs.fields.textContent = `${stats.fields.applied}`;
    view.statRefs.other.textContent = `${stats.userPermissions.applied + stats.tabs.applied + stats.setupEntityAccess.applied}`;
  }

  // Compact metrics row
  const metrics = document.createElement('div');
  metrics.setAttribute('style', `display: flex; gap: ${tokens.space.md}; flex-wrap: wrap;`);
  metrics.append(
    createOutcomeCard(
      'Requested',
      `${summary.total}`,
      '',
      { background: tokens.color.infoLight, border: tokens.color.infoBorder, title: tokens.color.infoText, value: tokens.color.infoText },
    ).card,
  );
  if (totalApplied !== null) {
    metrics.appendChild(
      createOutcomeCard(
        'Applied',
        `${totalApplied}`,
        '',
        { background: tokens.color.successLight, border: tokens.color.successBorder, title: tokens.color.successText, value: tokens.color.success },
      ).card,
    );
  }
  metrics.append(
    createOutcomeCard(
      'Warnings',
      `${result.warnings.length}`,
      '',
      { background: tokens.color.warningLight, border: tokens.color.warningBorder, title: tokens.color.warningText, value: tokens.color.warning },
    ).card,
    createOutcomeCard(
      'Issues',
      `${result.failures.length}`,
      '',
      { background: hasFailures ? tokens.color.errorLight : tokens.color.surfaceRaised, border: hasFailures ? tokens.color.errorBorder : tokens.color.borderDefault, title: hasFailures ? tokens.color.errorText : tokens.color.textSecondary, value: hasFailures ? tokens.color.error : tokens.color.textSecondary },
    ).card,
  );

  // Warning/failure groups - scrollable within result panel
  const groupsWrap = document.createElement('div');
  groupsWrap.setAttribute('style', `display: flex; flex-direction: column; gap: ${tokens.space.md};`);

  if (failureGroups.length > 0) {
    const heading = document.createElement('div');
    heading.setAttribute('style', `font-size: 12px; font-weight: ${tokens.font.weight.bold}; color: ${tokens.color.errorText};`);
    heading.textContent = 'Blocking Issues';
    groupsWrap.appendChild(heading);
    failureGroups.forEach((group, index) => {
      groupsWrap.appendChild(createNoticeGroupSection(group, index === 0));
    });
  }

  if (warningGroups.length > 0) {
    const heading = document.createElement('div');
    heading.setAttribute('style', `font-size: 12px; font-weight: ${tokens.font.weight.bold}; color: ${failureGroups.length > 0 ? tokens.color.textSecondary : tokens.color.warningText};`);
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
      border-radius: ${tokens.radius.lg};
      border: 1px solid ${tokens.color.successBorder};
      background: ${tokens.color.successLight};
      color: ${tokens.color.successText};
      font-size: ${tokens.font.size.sm};
      line-height: 1.4;
    `);
    cleanState.textContent = 'All selected permissions matched the target org. No adjustments needed.';
    groupsWrap.appendChild(cleanState);
  }

  // Export bar
  const allNotices = [
    ...result.failures.map((n) => ({ ...n, severity: 'Issue' as const })),
    ...result.warnings.map((n) => ({ ...n, severity: 'Warning' as const })),
  ];
  const appliedItems = (result.applied ?? []).map((a) => ({
    severity: 'Applied' as const,
    type: a.type,
    name: a.name,
    error: a.detail,
  }));
  const hasExportableItems = allNotices.length > 0 || appliedItems.length > 0;

  if (hasExportableItems) {
    const exportBar = document.createElement('div');
    exportBar.setAttribute('style', `
      display: flex;
      gap: ${tokens.space.sm};
      align-items: center;
      flex-wrap: wrap;
    `);

    const exportLabel = document.createElement('span');
    exportLabel.setAttribute('style', `font-size: ${tokens.font.size.sm}; color: ${tokens.color.textTertiary}; margin-right: auto;`);

    let includeApplied = false;
    const getExportItems = () => includeApplied ? [...appliedItems, ...allNotices] : allNotices;
    const updateLabel = () => {
      const count = getExportItems().length;
      exportLabel.textContent = `Export ${count} items:`;
    };
    updateLabel();

    // Include Applied checkbox
    if (appliedItems.length > 0) {
      const cbLabel = document.createElement('label');
      cbLabel.setAttribute('style', `
        display: flex; align-items: center; gap: ${tokens.space.xs};
        font-size: ${tokens.font.size.xs}; color: ${tokens.color.textSecondary}; cursor: pointer;
        margin-right: ${tokens.space.sm};
      `);
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.addEventListener('change', () => {
        includeApplied = cb.checked;
        updateLabel();
      });
      cbLabel.append(cb, document.createTextNode('Include applied'));
      exportBar.appendChild(cbLabel);
    }

    const buildRows = (): string[][] => {
      const header = ['Severity', 'Category', 'Permission Type', 'API Name', 'Detail'];
      const items = getExportItems();
      const rows = items.map((n) => {
        if (n.severity === 'Applied') {
          return [n.severity, '', n.type, n.name, n.error];
        }
        const cat = categorizeNotice(n);
        return [n.severity, cat.title, n.type, n.name, n.error];
      });
      return [header, ...rows];
    };

    const exportBtnStyle = `
      padding: 5px 10px;
      border-radius: ${tokens.radius.md};
      border: 1px solid ${tokens.color.borderDefault};
      background: ${tokens.color.surfaceBase};
      color: ${tokens.color.textSecondary};
      font-size: ${tokens.font.size.sm};
      font-weight: ${tokens.font.weight.semibold};
      cursor: pointer;
      white-space: nowrap;
      transition: background ${tokens.transition.normal};
    `;

    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy for Excel';
    copyBtn.setAttribute('style', exportBtnStyle);
    copyBtn.addEventListener('mouseenter', () => { copyBtn.style.background = tokens.color.surfaceRaised; });
    copyBtn.addEventListener('mouseleave', () => { copyBtn.style.background = tokens.color.surfaceBase; });
    copyBtn.addEventListener('click', () => {
      const rows = buildRows();
      const tsv = rows.map((r) => r.join('\t')).join('\n');
      navigator.clipboard.writeText(tsv).then(() => {
        options.onExport();
        const prev = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        copyBtn.style.background = tokens.color.successLight;
        copyBtn.style.borderColor = tokens.color.successBorder;
        copyBtn.style.color = tokens.color.successText;
        setTimeout(() => {
          copyBtn.textContent = prev;
          copyBtn.style.background = tokens.color.surfaceBase;
          copyBtn.style.borderColor = tokens.color.borderDefault;
          copyBtn.style.color = tokens.color.textSecondary;
        }, 1500);
      });
    });

    const csvBtn = document.createElement('button');
    csvBtn.textContent = 'Download CSV';
    csvBtn.setAttribute('style', exportBtnStyle);
    csvBtn.addEventListener('mouseenter', () => { csvBtn.style.background = tokens.color.surfaceRaised; });
    csvBtn.addEventListener('mouseleave', () => { csvBtn.style.background = tokens.color.surfaceBase; });
    csvBtn.addEventListener('click', () => {
      options.onExport();
      const rows = buildRows();
      const csvContent = rows.map((r) =>
        r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','),
      ).join('\n');
      const bom = '\uFEFF';
      const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `permset-${options.permSetLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}-report.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });

    exportBar.append(exportLabel, copyBtn, csvBtn);
    view.resultPanel.append(banner, infoRow, metrics, exportBar, groupsWrap);
  } else {
    view.resultPanel.append(banner, infoRow, metrics, groupsWrap);
  }
}

function renderSelectionStep(
  card: HTMLDivElement,
  permissions: ProfilePermissions,
  instanceUrl: string,
  close: () => void,
  callbacks: {
    onCreationFinished: (result: Awaited<ReturnType<typeof createPermSetViaApi>>) => void;
    onReportExported: () => void;
  },
): void {
  const body = document.createElement('div');
  body.setAttribute('style', `padding: ${tokens.space.xl} ${tokens.space['2xl']}; flex: 1; overflow-y: auto;`);

  // Profile info summary
  const info = document.createElement('div');
  info.setAttribute('style', `margin-bottom: ${tokens.space.xl}; font-size: ${tokens.font.size.base}; color: ${tokens.color.textSalesforceGray};`);
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
    padding: ${tokens.space.xl} ${tokens.space['2xl']};
    border-top: 1px solid ${tokens.color.borderDefault};
    display: flex;
    align-items: center;
    gap: ${tokens.space.lg};
  `);

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Permission Set name...';
  nameInput.value = sanitizeApiName(`${permissions.profileName}_Extracted`);
  nameInput.setAttribute('style', `
    flex: 1; padding: ${tokens.space.md} ${tokens.space.lg};
    border: 1px solid ${tokens.color.borderInput}; border-radius: ${tokens.radius.sm};
    font-size: ${tokens.font.size.base}; outline: none; color: ${tokens.color.textPrimary};
  `);
  nameInput.addEventListener('focus', () => { nameInput.style.borderColor = tokens.color.primary; });
  nameInput.addEventListener('blur', () => { nameInput.style.borderColor = tokens.color.borderInput; });

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

    const permSetLabel = nameInput.value.trim() || name;
    const executionView = createExecutionView(summary, permSetLabel);
    card.appendChild(executionView.root);
    updateExecutionStages(executionView, 'prepare', 'running');

    // Timer
    const startTime = Date.now();
    const timerInterval = setInterval(() => {
      executionView.elapsedSpan.textContent = formatDuration(Date.now() - startTime);
    }, 1000);

    try {
      const result = await createPermSetViaApi({
        instanceUrl,
        name,
        label: permSetLabel,
        objectPermissions: objPerms,
        fieldPermissions: fldPerms,
        userPermissions: usrPerms,
        tabSettings: tabPerms,
        setupEntityAccess: seaPerms,
      }, (message, completedItems, totalItems) => {
        const stageId = inferExecutionStage(message);
        executionView.statusText.textContent = message;
        updateActiveStageDescription(executionView, stageId, message);
        updateExecutionStages(executionView, stageId, 'running');

        // Update progress bar
        if (totalItems && totalItems > 0 && completedItems !== undefined) {
          const pct = Math.min(100, Math.round((completedItems / totalItems) * 100));
          executionView.progressBarFill.style.width = `${pct}%`;
          // ETA
          if (completedItems > 0) {
            const elapsed = Date.now() - startTime;
            const rate = completedItems / elapsed;
            const remaining = (totalItems - completedItems) / rate;
            executionView.etaSpan.textContent = `~${formatDuration(remaining)} left`;
          }
        }
      });

      const elapsedMs = Date.now() - startTime;
      callbacks.onCreationFinished(result);

      if (result.success) {
        if (result.failures.length > 0) {
          executionView.statusText.textContent = 'Creation finished with some issues. Review details below.';
        } else if (result.warnings.length > 0) {
          executionView.statusText.textContent = 'Creation finished with warnings.';
        } else {
          executionView.statusText.textContent = 'Creation finished successfully.';
        }
      } else {
        executionView.statusText.textContent = result.rolledBack
          ? 'Creation failed and the partial Permission Set was rolled back.'
          : 'Creation failed and rollback did not complete.';
      }
      updateExecutionStages(executionView, 'finish', result.success ? 'success' : 'failure');
      renderExecutionResult(executionView, result, instanceUrl, summary, {
        permSetLabel,
        elapsedMs,
        onExport: callbacks.onReportExported,
      });
    } catch (err: any) {
      const elapsedMs = Date.now() - startTime;
      const message = err instanceof Error ? err.message : String(err);
      executionView.statusPill.textContent = 'Failed';
      executionView.statusPill.style.background = tokens.color.errorLight;
      executionView.statusPill.style.color = tokens.color.errorText;
      executionView.statusTitle.textContent = 'Unexpected Error';
      executionView.statusText.textContent = message;
      updateExecutionStages(executionView, 'finish', 'failure');
      const errorResult = {
        id: '',
        success: false,
        rolledBack: false,
        warnings: [] as Array<{ type: string; name: string; error: string }>,
        failures: [{ type: 'Error', name: 'createPermSetViaApi', error: message }],
        applied: [] as Array<{ type: string; name: string; detail: string }>,
      };
      callbacks.onCreationFinished(errorResult);
      renderExecutionResult(executionView, errorResult, instanceUrl, summary, {
        permSetLabel,
        elapsedMs,
        onExport: callbacks.onReportExported,
      });
    } finally {
      clearInterval(timerInterval);
      executionView.progressBarFill.style.width = '100%';
      executionView.etaSpan.textContent = '';
      executionView.elapsedSpan.textContent = `Completed in ${formatDuration(Date.now() - startTime)}`;
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
  section.setAttribute('style', `margin-bottom: ${tokens.space.xl};`);

  // Section header with Select All
  const header = document.createElement('div');
  header.setAttribute('style', `
    display: flex; align-items: center; justify-content: space-between;
    padding: ${tokens.space.md} ${tokens.space.lg}; background: ${tokens.color.surfaceSubtle}; border-radius: ${tokens.radius.md};
    margin-bottom: ${tokens.space.xs};
  `);

  const titleSpan = document.createElement('span');
  titleSpan.setAttribute('style', `font-size: ${tokens.font.size.base}; font-weight: ${tokens.font.weight.semibold}; color: ${tokens.color.textSecondary};`);
  titleSpan.textContent = `${title} (${items.length})`;

  const selectAllLabel = document.createElement('label');
  selectAllLabel.setAttribute('style', `display: flex; align-items: center; gap: ${tokens.space.sm}; font-size: 12px; color: ${tokens.color.textSalesforceGray}; cursor: pointer;`);
  const selectAllCb = document.createElement('input');
  selectAllCb.type = 'checkbox';
  selectAllCb.checked = true;
  selectAllLabel.append(selectAllCb);
  selectAllLabel.appendChild(document.createTextNode('Select All'));

  header.append(titleSpan, selectAllLabel);
  section.appendChild(header);

  // Items list
  const list = document.createElement('div');
  list.setAttribute('style', `max-height: 200px; overflow-y: auto; padding: ${tokens.space.xs} 0;`);

  // Initialize all selected
  items.forEach((_, i) => selectedSet.add(i));

  const checkboxes: HTMLInputElement[] = [];

  items.forEach((item, index) => {
    const row = document.createElement('div');
    row.setAttribute('style', `
      display: flex; align-items: center; gap: ${tokens.space.md};
      padding: ${tokens.space.xs} ${tokens.space.lg}; font-size: 12px;
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
    label.setAttribute('style', `color: ${tokens.color.textPrimary}; font-family: ${tokens.font.family.mono};`);
    label.textContent = getLabel(item);

    const detail = document.createElement('span');
    detail.setAttribute('style', `color: ${tokens.color.textMuted}; margin-left: auto;`);
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
