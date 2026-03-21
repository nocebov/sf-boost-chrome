import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';
import { sendMessage } from '../../lib/messaging';
import { getModuleSettings } from '../../lib/storage';
import { showToast } from '../../lib/toast';
import { tokens } from '../../lib/design-tokens';
import { createBadge, createButton } from '../../lib/ui-helpers';
import {
  buildFieldIndex,
  buildFieldSetupUrl,
  buildSelectSnippet,
  normalizeFieldLabelText,
  resolveFieldInfo,
  resolveFieldInfoFromAttributeValue,
  type FieldIndex,
  type FieldInfo,
} from './utils';

const BADGE_CLASS = 'sfboost-field-badge';
const POPOVER_ID = 'sfboost-field-popover';
const RECORD_FIELD_CONTAINER_SELECTOR = 'records-record-layout-item';
const RECORD_LABEL_SELECTOR =
  'span.test-id__field-label, ' +
  '.slds-form-element__label:not(:has(span.test-id__field-label)), ' +
  'records-record-layout-item span[class*="label"]:not(:has(span.test-id__field-label))';
const LIST_HEADER_SELECTOR = 'table[role="grid"] thead th[role="columnheader"], table[role="grid"] thead th';
const TEXT_STRIP_SELECTOR = `.${BADGE_CLASS}, lightning-helptext, abbr.slds-required, button, svg, use`;
const RECORD_LABEL_CANDIDATE_SELECTORS = [
  'span.test-id__field-label',
  'label.slds-form-element__label',
  '.slds-form-element__label',
  '[slot="label"]',
  '[data-target-selection-name*="field-label" i]',
  '[class*="field-label"]',
  '[class*="fieldLabel"]',
  'label',
  'span[class*="label"]',
  'div[class*="label"]',
];
const RECORD_FIELD_ATTRIBUTE_SOURCES = [
  { selector: '[data-target-selection-name]', attribute: 'data-target-selection-name' },
  { selector: '[field-name]', attribute: 'field-name' },
  { selector: '[data-field]', attribute: 'data-field' },
  { selector: '[data-field-name]', attribute: 'data-field-name' },
  { selector: '[data-record-field]', attribute: 'data-record-field' },
] as const;

let currentCtx: ModuleContext | null = null;
let cachedObjectApiName: string | null = null;
let cachedFieldIndex: FieldIndex | null = null;
let observer: MutationObserver | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let navigationGen = 0;
let inspectorVisible = true;
let listenersAttached = false;
let popoverEl: HTMLDivElement | null = null;
let popoverAnchor: HTMLElement | null = null;

let moduleSettingsCache: Record<string, boolean> = {};

function isSupportedPageType(pageType: ModuleContext['pageContext']['pageType']): boolean {
  if (pageType === 'record') return moduleSettingsCache.showOnRecords !== false;
  if (pageType === 'list') return moduleSettingsCache.showOnListViews !== false;
  return false;
}

async function copyText(value: string, successMessage: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    showToast(successMessage);
  } catch {
    showToast('Failed to copy to clipboard');
  }
}

async function getFieldIndexForObject(
  instanceUrl: string,
  objectApiName: string,
): Promise<FieldIndex | null> {
  if (objectApiName === cachedObjectApiName && cachedFieldIndex) {
    return cachedFieldIndex;
  }

  let describeData: unknown;
  try {
    describeData = await sendMessage('describeObject', { instanceUrl, objectApiName });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Describe request failed';
    showToast(`Field Inspector: ${message}`, 'right');
    return null;
  }

  const fields = (
    describeData &&
    typeof describeData === 'object' &&
    'fields' in describeData
  ) ? (describeData as { fields?: unknown }).fields : undefined;

  const fieldIndex = buildFieldIndex(fields);
  if (fieldIndex.byApiName.size === 0) {
    return null;
  }

  cachedObjectApiName = objectApiName;
  cachedFieldIndex = fieldIndex;
  return fieldIndex;
}

function removeNodes(root: ParentNode, selector: string): void {
  root.querySelectorAll(selector).forEach((node) => node.remove());
}

function extractCleanText(element: Element): string {
  const clone = element.cloneNode(true) as HTMLElement;
  removeNodes(clone, TEXT_STRIP_SELECTOR);
  return normalizeFieldLabelText(clone.textContent ?? '');
}

function extractListHeaderText(header: HTMLElement): string {
  const titleCandidates = [
    header.title,
    ...Array.from(header.querySelectorAll<HTMLElement>('[title]')).map((element) => element.title),
  ]
    .map((value) => normalizeFieldLabelText(value))
    .filter((value) => value && !/(sort|action|resize|menu|select all)/i.test(value));

  return titleCandidates[0] ?? extractCleanText(header);
}

function dedupeFieldInfos(candidates: Array<FieldInfo | null | undefined>): FieldInfo[] {
  const byApiName = new Map<string, FieldInfo>();

  for (const candidate of candidates) {
    if (!candidate) continue;
    byApiName.set(candidate.apiName.toLowerCase(), candidate);
  }

  return Array.from(byApiName.values());
}

function intersectFieldInfos(left: FieldInfo[], right: FieldInfo[]): FieldInfo[] {
  const rightApiNames = new Set(right.map((fieldInfo) => fieldInfo.apiName.toLowerCase()));
  return left.filter((fieldInfo) => rightApiNames.has(fieldInfo.apiName.toLowerCase()));
}

function collectRecordLabelCandidates(container: HTMLElement): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const candidates: HTMLElement[] = [];

  for (const selector of RECORD_LABEL_CANDIDATE_SELECTORS) {
    container.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      if (seen.has(element)) return;
      if (!extractCleanText(element)) return;

      seen.add(element);
      candidates.push(element);
    });
  }

  return candidates;
}

function collectAttributeElements(container: HTMLElement, selector: string): HTMLElement[] {
  const elements: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();

  if (container.matches(selector)) {
    seen.add(container);
    elements.push(container);
  }

  container.querySelectorAll<HTMLElement>(selector).forEach((element) => {
    if (seen.has(element)) return;
    seen.add(element);
    elements.push(element);
  });

  return elements;
}

function collectRecordFieldInfosFromAttributes(
  fieldIndex: FieldIndex,
  container: HTMLElement,
  objectApiName: string,
): FieldInfo[] {
  const candidates: Array<FieldInfo | null> = [];

  for (const source of RECORD_FIELD_ATTRIBUTE_SOURCES) {
    for (const element of collectAttributeElements(container, source.selector)) {
      const attributeValue = element.getAttribute(source.attribute);
      if (!attributeValue) continue;

      candidates.push(resolveFieldInfoFromAttributeValue(fieldIndex, attributeValue, objectApiName));
    }
  }

  return dedupeFieldInfos(candidates);
}

function collectRecordFieldInfosFromLabels(fieldIndex: FieldIndex, container: HTMLElement): FieldInfo[] {
  return dedupeFieldInfos(
    collectRecordLabelCandidates(container).map((labelEl) =>
      resolveFieldInfo(fieldIndex, extractCleanText(labelEl))),
  );
}

function resolveRecordFieldInfo(
  fieldIndex: FieldIndex,
  container: HTMLElement,
  objectApiName: string,
): FieldInfo | null {
  const attributeMatches = collectRecordFieldInfosFromAttributes(fieldIndex, container, objectApiName);
  const labelMatches = collectRecordFieldInfosFromLabels(fieldIndex, container);
  const overlappingMatches = intersectFieldInfos(attributeMatches, labelMatches);

  if (overlappingMatches.length === 1) {
    return overlappingMatches[0] ?? null;
  }
  if (attributeMatches.length === 1) {
    return attributeMatches[0] ?? null;
  }
  if (labelMatches.length === 1) {
    return labelMatches[0] ?? null;
  }

  return null;
}

function findBestRecordBadgeMount(
  fieldIndex: FieldIndex,
  container: HTMLElement,
  fieldInfo: FieldInfo,
): HTMLElement | null {
  const labelCandidates = collectRecordLabelCandidates(container);
  if (labelCandidates.length === 0) {
    return null;
  }

  const matchingLabel = labelCandidates.find((labelEl) => {
    const resolved = resolveFieldInfo(fieldIndex, extractCleanText(labelEl));
    return resolved?.apiName.toLowerCase() === fieldInfo.apiName.toLowerCase();
  });

  return matchingLabel ?? labelCandidates[0] ?? null;
}

function closePopover(): void {
  if (popoverAnchor) {
    popoverAnchor.setAttribute('aria-expanded', 'false');
  }

  popoverEl?.remove();
  popoverEl = null;
  popoverAnchor = null;

  document.removeEventListener('mousedown', handleDocumentPointerDown, true);
  document.removeEventListener('keydown', handleDocumentKeydown, true);
  window.removeEventListener('resize', handleViewportChange, true);
  window.removeEventListener('scroll', handleViewportChange, true);
}

function positionPopover(anchor: HTMLElement, popover: HTMLDivElement): void {
  const rect = anchor.getBoundingClientRect();
  const gutter = 12;
  const maxWidth = Math.min(360, window.innerWidth - gutter * 2);

  popover.style.maxWidth = `${maxWidth}px`;

  const { width, height } = popover.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + 8;

  if (left + width > window.innerWidth - gutter) {
    left = window.innerWidth - width - gutter;
  }
  if (left < gutter) {
    left = gutter;
  }

  if (top + height > window.innerHeight - gutter) {
    top = rect.top - height - 8;
  }
  if (top < gutter) {
    top = gutter;
  }

  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
}

function handleDocumentPointerDown(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Node)) {
    closePopover();
    return;
  }

  if (popoverEl?.contains(target) || popoverAnchor?.contains(target)) {
    return;
  }

  closePopover();
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closePopover();
  }
}

function handleViewportChange(): void {
  closePopover();
}

function createInfoRow(label: string, value: string): HTMLDivElement {
  const row = document.createElement('div');
  row.setAttribute('style', `
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
    gap: ${tokens.space.md};
    align-items: start;
  `);

  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  labelEl.setAttribute('style', `
    color: ${tokens.color.textSecondary};
    font-size: ${tokens.font.size.sm};
    font-weight: ${tokens.font.weight.medium};
  `);

  const valueEl = document.createElement('span');
  valueEl.textContent = value;
  valueEl.setAttribute('style', `
    color: ${tokens.color.textPrimary};
    font-size: ${tokens.font.size.base};
    line-height: 1.4;
    word-break: break-word;
  `);

  row.append(labelEl, valueEl);
  return row;
}

function createCodeBlock(text: string): HTMLPreElement {
  const pre = document.createElement('pre');
  pre.textContent = text;
  pre.setAttribute('style', `
    margin: 0;
    padding: ${tokens.space.md};
    background: ${tokens.color.surfaceSubtle};
    border: 1px solid ${tokens.color.borderDefault};
    border-radius: ${tokens.radius.sm};
    color: ${tokens.color.textPrimary};
    font-family: ${tokens.font.family.mono};
    font-size: ${tokens.font.size.sm};
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
  `);
  return pre;
}

function renderPopover(anchor: HTMLElement, fieldInfo: FieldInfo): void {
  if (!currentCtx?.pageContext.objectApiName) {
    return;
  }

  if (popoverAnchor === anchor && popoverEl) {
    closePopover();
    return;
  }

  closePopover();

  const { objectApiName, instanceUrl } = currentCtx.pageContext;
  const popover = document.createElement('div');
  popover.id = POPOVER_ID;
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', `Field details for ${fieldInfo.label}`);
  popover.setAttribute('style', `
    position: fixed;
    z-index: ${tokens.zIndex.overlay};
    width: min(360px, calc(100vw - 24px));
    padding: ${tokens.space.xl};
    background: ${tokens.color.surfaceBase};
    border: 1px solid ${tokens.color.borderDefault};
    border-radius: ${tokens.radius.lg};
    box-shadow: ${tokens.shadow.md};
    display: flex;
    flex-direction: column;
    gap: ${tokens.space.lg};
    font-family: ${tokens.font.family.sans};
  `);

  const header = document.createElement('div');
  header.setAttribute('style', `
    display: flex;
    justify-content: space-between;
    gap: ${tokens.space.md};
    align-items: start;
  `);

  const titleWrap = document.createElement('div');
  titleWrap.setAttribute('style', `
    display: flex;
    flex-direction: column;
    gap: ${tokens.space.xs};
    min-width: 0;
  `);

  const title = document.createElement('strong');
  title.textContent = fieldInfo.label;
  title.setAttribute('style', `
    color: ${tokens.color.textPrimary};
    font-size: ${tokens.font.size.md};
    line-height: 1.3;
  `);

  const apiName = document.createElement('code');
  apiName.textContent = fieldInfo.apiName;
  apiName.setAttribute('style', `
    color: ${tokens.color.primary};
    font-family: ${tokens.font.family.mono};
    font-size: ${tokens.font.size.base};
    word-break: break-word;
  `);

  titleWrap.append(title, apiName);

  const closeBtn = createButton('Close', { primary: false, small: true });
  closeBtn.addEventListener('click', closePopover);

  header.append(titleWrap, closeBtn);

  const tags = document.createElement('div');
  tags.setAttribute('style', `
    display: flex;
    flex-wrap: wrap;
    gap: ${tokens.space.sm};
  `);
  tags.appendChild(createBadge(fieldInfo.type, 'info'));
  tags.appendChild(createBadge(fieldInfo.required ? 'Required' : 'Optional', fieldInfo.required ? 'warning' : 'neutral'));
  if (fieldInfo.custom) tags.appendChild(createBadge('Custom', 'success'));
  if (fieldInfo.externalId) tags.appendChild(createBadge('External ID', 'info'));
  if (fieldInfo.unique) tags.appendChild(createBadge('Unique', 'warning'));
  if (fieldInfo.encrypted) tags.appendChild(createBadge('Encrypted', 'error'));
  if (fieldInfo.calculated) tags.appendChild(createBadge('Formula', 'neutral'));

  const facts = document.createElement('div');
  facts.setAttribute('style', `
    display: flex;
    flex-direction: column;
    gap: ${tokens.space.sm};
  `);
  facts.appendChild(createInfoRow('Object', objectApiName));
  facts.appendChild(createInfoRow('Access', [
    fieldInfo.createable ? 'Create' : null,
    fieldInfo.updateable ? 'Edit' : null,
    fieldInfo.filterable ? 'Filter' : null,
    fieldInfo.sortable ? 'Sort' : null,
  ].filter((value): value is string => value !== null).join(' • ') || 'Read only'));

  if (fieldInfo.length !== undefined) {
    facts.appendChild(createInfoRow('Length', String(fieldInfo.length)));
  }
  if (fieldInfo.precision !== undefined) {
    const scaleSuffix = fieldInfo.scale !== undefined ? ` / scale ${fieldInfo.scale}` : '';
    facts.appendChild(createInfoRow('Precision', `${fieldInfo.precision}${scaleSuffix}`));
  }
  if (fieldInfo.relationshipName) {
    facts.appendChild(createInfoRow('Relationship', fieldInfo.relationshipName));
  }
  if (fieldInfo.referenceTo.length > 0) {
    facts.appendChild(createInfoRow('References', fieldInfo.referenceTo.join(', ')));
  }
  if (fieldInfo.inlineHelpText) {
    facts.appendChild(createInfoRow('Help Text', fieldInfo.inlineHelpText));
  }

  if (fieldInfo.formula) {
    const formulaWrap = document.createElement('div');
    formulaWrap.setAttribute('style', `
      display: flex;
      flex-direction: column;
      gap: ${tokens.space.sm};
    `);

    const formulaLabel = document.createElement('span');
    formulaLabel.textContent = 'Formula';
    formulaLabel.setAttribute('style', `
      color: ${tokens.color.textSecondary};
      font-size: ${tokens.font.size.sm};
      font-weight: ${tokens.font.weight.medium};
    `);

    formulaWrap.append(formulaLabel, createCodeBlock(fieldInfo.formula));
    facts.appendChild(formulaWrap);
  }

  const actions = document.createElement('div');
  actions.setAttribute('style', `
    display: flex;
    flex-wrap: wrap;
    gap: ${tokens.space.sm};
  `);

  const copyApiBtn = createButton('Copy API', { primary: false, small: true });
  copyApiBtn.addEventListener('click', () => {
    void copyText(fieldInfo.apiName, `Copied API name: ${fieldInfo.apiName}`);
  });

  const copySelectBtn = createButton('Copy SOQL', { primary: false, small: true });
  copySelectBtn.addEventListener('click', () => {
    void copyText(
      buildSelectSnippet(objectApiName, fieldInfo.apiName),
      `Copied SOQL for ${fieldInfo.apiName}`,
    );
  });

  const openSetupBtn = createButton('Open Setup', { primary: false, small: true });
  openSetupBtn.addEventListener('click', () => {
    window.open(buildFieldSetupUrl(instanceUrl, objectApiName, fieldInfo.apiName), '_blank', 'noopener,noreferrer');
  });

  actions.append(copyApiBtn, copySelectBtn, openSetupBtn);

  if (fieldInfo.relationshipName) {
    const copyRelationshipBtn = createButton('Copy Relationship', { primary: false, small: true });
    copyRelationshipBtn.addEventListener('click', () => {
      void copyText(fieldInfo.relationshipName!, `Copied relationship name: ${fieldInfo.relationshipName}`);
    });
    actions.appendChild(copyRelationshipBtn);
  }

  popover.append(header, tags, facts, actions);
  document.body.appendChild(popover);

  popoverEl = popover;
  popoverAnchor = anchor;
  popoverAnchor.setAttribute('aria-expanded', 'true');

  positionPopover(anchor, popover);
  document.addEventListener('mousedown', handleDocumentPointerDown, true);
  document.addEventListener('keydown', handleDocumentKeydown, true);
  window.addEventListener('resize', handleViewportChange, true);
  window.addEventListener('scroll', handleViewportChange, true);
}

function createFieldBadge(fieldInfo: FieldInfo, kind: 'record' | 'list'): HTMLButtonElement {
  const badge = document.createElement('button');
  badge.type = 'button';
  badge.className = BADGE_CLASS;
  badge.textContent = fieldInfo.apiName;
  badge.title = `Type: ${fieldInfo.type}${fieldInfo.required ? ' • Required' : ''}${fieldInfo.relationshipName ? ` • ${fieldInfo.relationshipName}` : ''}\nClick for details • Ctrl/Cmd+Click to copy`;
  badge.setAttribute('aria-haspopup', 'dialog');
  badge.setAttribute('aria-expanded', 'false');
  badge.setAttribute('style', `
    display: inline-flex;
    align-items: center;
    gap: ${tokens.space.xs};
    margin-left: ${tokens.space.sm};
    padding: 1px ${tokens.space.sm};
    background: ${tokens.color.primaryLight};
    color: ${tokens.color.primary};
    font-size: ${tokens.font.size.xs};
    font-weight: ${tokens.font.weight.semibold};
    border-radius: ${tokens.radius.sm};
    font-family: ${tokens.font.family.mono};
    cursor: pointer;
    vertical-align: middle;
    border: 1px solid ${tokens.color.primaryBorder};
    line-height: 1.4;
  `);

  badge.addEventListener('mouseenter', () => {
    badge.style.background = tokens.color.infoLight;
    badge.style.borderColor = tokens.color.infoBorder;
  });
  badge.addEventListener('mouseleave', () => {
    badge.style.background = tokens.color.primaryLight;
    badge.style.borderColor = tokens.color.primaryBorder;
  });

  badge.addEventListener('click', (event) => {
    event.stopPropagation();
    event.preventDefault();

    if (event.ctrlKey || event.metaKey) {
      void copyText(fieldInfo.apiName, `Copied API name: ${fieldInfo.apiName}`);
      return;
    }

    renderPopover(badge, fieldInfo);
  });

  badge.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      renderPopover(badge, fieldInfo);
    }
  });

  return badge;
}

function findListBadgeMount(header: HTMLElement): HTMLElement {
  const contentTarget = header.querySelector<HTMLElement>('a, .slds-truncate, span[title], div[title]');
  if (contentTarget) {
    return contentTarget.matches('a') ? (contentTarget.parentElement ?? header) : contentTarget;
  }

  const button = header.querySelector<HTMLElement>('button');
  if (button?.parentElement) {
    return button.parentElement;
  }

  return header;
}

function applyRecordBadges(fieldIndex: FieldIndex): void {
  const objectApiName = currentCtx?.pageContext.objectApiName;

  if (objectApiName) {
    document.querySelectorAll<HTMLElement>(RECORD_FIELD_CONTAINER_SELECTOR).forEach((container) => {
      if (container.querySelector(`.${BADGE_CLASS}`)) return;

      const fieldInfo = resolveRecordFieldInfo(fieldIndex, container, objectApiName);
      if (!fieldInfo) return;

      const badgeMount = findBestRecordBadgeMount(fieldIndex, container, fieldInfo);
      if (!badgeMount || badgeMount.querySelector(`.${BADGE_CLASS}`)) return;

      badgeMount.appendChild(createFieldBadge(fieldInfo, 'record'));
    });
  }

  document.querySelectorAll<HTMLElement>(RECORD_LABEL_SELECTOR).forEach((labelEl) => {
    if (labelEl.querySelector(`.${BADGE_CLASS}`)) return;

    const fieldInfo = resolveFieldInfo(fieldIndex, extractCleanText(labelEl));
    if (!fieldInfo) return;

    labelEl.appendChild(createFieldBadge(fieldInfo, 'record'));
  });
}

function applyListBadges(fieldIndex: FieldIndex): void {
  document.querySelectorAll<HTMLElement>(LIST_HEADER_SELECTOR).forEach((headerEl) => {
    if (headerEl.querySelector(`.${BADGE_CLASS}`)) return;

    const fieldInfo = resolveFieldInfo(fieldIndex, extractListHeaderText(headerEl));
    if (!fieldInfo) return;

    findListBadgeMount(headerEl).appendChild(createFieldBadge(fieldInfo, 'list'));
  });
}

function applyBadgesToDOM(fieldIndex: FieldIndex): void {
  if (!currentCtx) return;

  if (currentCtx.pageContext.pageType === 'record') {
    applyRecordBadges(fieldIndex);
    return;
  }

  if (currentCtx.pageContext.pageType === 'list') {
    applyListBadges(fieldIndex);
  }
}

function startObserver(fieldIndex: FieldIndex): void {
  stopObserver();

  observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => applyBadgesToDOM(fieldIndex), 250);
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function stopObserver(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

function removeFieldBadges(): void {
  closePopover();
  document.querySelectorAll(`.${BADGE_CLASS}`).forEach((element) => element.remove());
}

async function applyBadges(): Promise<void> {
  if (!currentCtx || !inspectorVisible) return;

  const { objectApiName, instanceUrl, pageType } = currentCtx.pageContext;
  if (!objectApiName || !isSupportedPageType(pageType)) return;

  const gen = navigationGen;
  const fieldIndex = await getFieldIndexForObject(instanceUrl, objectApiName);
  if (!fieldIndex || gen !== navigationGen) return;

  applyBadgesToDOM(fieldIndex);
  startObserver(fieldIndex);
}

function handleInspectorToggle(): void {
  inspectorVisible = !inspectorVisible;

  stopObserver();
  removeFieldBadges();

  if (!inspectorVisible) {
    showToast('Field Inspector hidden');
    return;
  }

  showToast('Field Inspector shown');
  void applyBadges();
}

function attachListeners(): void {
  if (listenersAttached) return;
  document.addEventListener('sfboost:toggle-inspector', handleInspectorToggle as EventListener);
  listenersAttached = true;
}

function detachListeners(): void {
  if (!listenersAttached) return;
  document.removeEventListener('sfboost:toggle-inspector', handleInspectorToggle as EventListener);
  listenersAttached = false;
}

const fieldInspector: SFBoostModule = {
  id: 'field-inspector',
  name: 'Field Inspector',
  description: 'Shows API names on record fields and list columns, with click-through metadata',

  async init(ctx: ModuleContext) {
    if (window.top !== window.self) return;

    moduleSettingsCache = await getModuleSettings('field-inspector');
    currentCtx = ctx;
    attachListeners();

    if (isSupportedPageType(ctx.pageContext.pageType)) {
      await applyBadges();
    }
  },

  async onNavigate(ctx: ModuleContext) {
    if (window.top !== window.self) return;

    navigationGen++;
    stopObserver();
    removeFieldBadges();
    currentCtx = ctx;

    if (isSupportedPageType(ctx.pageContext.pageType) && inspectorVisible) {
      await applyBadges();
    }
  },

  destroy() {
    if (window.top !== window.self) return;

    navigationGen++;
    stopObserver();
    removeFieldBadges();
    detachListeners();
    cachedFieldIndex = null;
    cachedObjectApiName = null;
    currentCtx = null;
    inspectorVisible = true;
  },
};

registry.register(fieldInspector);
