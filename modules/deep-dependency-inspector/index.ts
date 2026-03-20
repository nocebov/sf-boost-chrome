import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';
import { sendMessage } from '../../lib/messaging';
import { createModal, createSpinner, createButton, createFilterBar } from '../../lib/ui-helpers';
import { showToast } from '../../lib/toast';
import { assertSalesforceId, isAllowedSalesforceDomain } from '../../lib/salesforce-utils';
import { tokens } from '../../lib/design-tokens';

const BTN_ID = 'sfboost-deep-scan-btn';
const MODAL_ID = 'sfboost-dependency-modal';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let currentCtx: ModuleContext | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let observer: MutationObserver | null = null;

// --- Cache ---

interface CacheEntry {
  data: DependencyRecord[];
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

function getCached(key: string): DependencyRecord[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: DependencyRecord[]): void {
  cache.set(key, { data, timestamp: Date.now() });
}

// --- Page Detection ---

interface PageInfo {
  componentId: string;
  componentType: string;
}

function extractSalesforceIdFromAddress(value: string | null): string | null {
  if (!value) return null;

  const rawCandidate = value.match(/([a-zA-Z0-9]{15,18})/)?.[1];
  if (rawCandidate) return rawCandidate;

  try {
    return decodeURIComponent(value).match(/([a-zA-Z0-9]{15,18})/)?.[1] ?? null;
  } catch {
    return null;
  }
}

function getComponentFromUrl(): PageInfo | null {
  const pathname = window.location.pathname;

  // Object Manager > Field: /lightning/setup/ObjectManager/{ObjectId}/FieldsAndRelationships/{FieldId}/view
  const fieldMatch = pathname.match(
    /\/lightning\/setup\/ObjectManager\/\w+\/FieldsAndRelationships\/(\w{15,18})\//
  );
  if (fieldMatch?.[1]) {
    return { componentId: fieldMatch[1], componentType: 'CustomField' };
  }

  // Object Manager > Validation Rules: /lightning/setup/ObjectManager/.../ValidationRules/{id}/view
  const validationMatch = pathname.match(
    /\/lightning\/setup\/ObjectManager\/\w+\/ValidationRules\/(\w{15,18})\//
  );
  if (validationMatch?.[1]) {
    return { componentId: validationMatch[1], componentType: 'ValidationRule' };
  }

  // Apex Classes: /lightning/setup/ApexClasses/page?address=/{classId}
  if (pathname.includes('/lightning/setup/ApexClasses/')) {
    const address = new URLSearchParams(window.location.search).get('address');
    const classId = extractSalesforceIdFromAddress(address);
    if (classId) return { componentId: classId, componentType: 'ApexClass' };
  }

  // Apex Triggers: /lightning/setup/ApexTriggers/page?address=/{triggerId}
  if (pathname.includes('/lightning/setup/ApexTriggers/')) {
    const address = new URLSearchParams(window.location.search).get('address');
    const triggerId = extractSalesforceIdFromAddress(address);
    if (triggerId) return { componentId: triggerId, componentType: 'ApexTrigger' };
  }

  // Flows: /lightning/setup/Flows/{flowId}/view or /builder_platform_interaction/{flowId}
  const flowMatch = pathname.match(/\/lightning\/setup\/Flows\/(\w{15,18})\/view/);
  if (flowMatch?.[1]) {
    return { componentId: flowMatch[1], componentType: 'Flow' };
  }
  const flowBuilderMatch = pathname.match(/\/builder_platform_interaction\/(\w{15,18})/);
  if (flowBuilderMatch?.[1]) {
    return { componentId: flowBuilderMatch[1], componentType: 'Flow' };
  }

  // Lightning Web Components: /lightning/setup/LightningComponentBundles/page?address=/{id}
  if (pathname.includes('/lightning/setup/LightningComponentBundles/')) {
    const address = new URLSearchParams(window.location.search).get('address');
    const lwcId = extractSalesforceIdFromAddress(address);
    if (lwcId) return { componentId: lwcId, componentType: 'LightningComponentBundle' };
  }

  // Aura Components: /lightning/setup/AuraBundleDefinitions/page?address=/{id}
  if (pathname.includes('/lightning/setup/AuraBundleDefinitions/')) {
    const address = new URLSearchParams(window.location.search).get('address');
    const auraId = extractSalesforceIdFromAddress(address);
    if (auraId) return { componentId: auraId, componentType: 'AuraDefinitionBundle' };
  }

  return null;
}

function findNodeInDocumentOrIframes(selectors: string[]): Element | null {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }

  const iframes = document.querySelectorAll('iframe');
  for (const iframe of Array.from(iframes)) {
    try {
      const src = iframe.src || '';
      if (src) {
        try {
          const iframeUrl = new URL(src, window.location.origin);
          if (!isAllowedSalesforceDomain(iframeUrl.hostname)) continue;
        } catch { continue; }
      }
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) continue;
      for (const sel of selectors) {
        const el = doc.querySelector(sel);
        if (el) return el;
      }
    } catch (e) {
      // Ignore cross-origin iframe errors
    }
  }
  return null;
}

function extractComponentNameFromHeader(): string | null {
  const selectors = [
    'h1.slds-page-header__title',
    '.slds-page-header__title',
    '.uiOutputText[data-aura-rendered-by]',
    '.pageDescription',
    'h1',
  ];
  const el = findNodeInDocumentOrIframes(selectors);
  return el?.textContent?.trim() || null;
}

// --- Button Injection ---

function injectButton(): boolean {
  if (document.getElementById(BTN_ID)) return true;

  const info = getComponentFromUrl();
  if (!info?.componentId) return false;

  const headerSelectors = [
    '.slds-page-header__title',
    '.slds-page-header__detail-block',
    'h1.slds-page-header__title',
    '.test-id__field-header',
    '.entityNameTitle',
    '.pageDescription',
  ];

  const header = findNodeInDocumentOrIframes(headerSelectors);
  if (!header) return false;

  const btn = createButton('Deep Scan', { small: false });
  btn.id = BTN_ID;
  btn.style.marginLeft = tokens.space.lg;
  btn.style.verticalAlign = 'middle';

  btn.addEventListener('click', () => runDeepScan());

  if (header.parentElement) {
    header.parentElement.insertBefore(btn, header.nextSibling);
  }

  return true;
}

function scheduleInject(): void {
  cancelRetry();
  // Try immediately
  if (injectButton()) return;

  // Use MutationObserver to detect when header appears
  observer = new MutationObserver(() => {
    if (injectButton()) {
      disconnectObserver();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Safety fallback: stop observing after 10 seconds
  retryTimer = setTimeout(() => {
    disconnectObserver();
  }, 10_000);
}

function disconnectObserver(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  cancelRetry();
}

function cancelRetry(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

// --- Navigation URLs for dependency types ---

function getSetupUrl(type: string, id: string): string | null {
  switch (type) {
    case 'ApexClass':
      return `/lightning/setup/ApexClasses/page?address=%2F${id}`;
    case 'ApexTrigger':
      return `/lightning/setup/ApexTriggers/page?address=%2F${id}`;
    case 'Flow':
      return `/lightning/setup/Flows/${id}/view`;
    case 'LightningComponentBundle':
      return `/lightning/setup/LightningComponentBundles/page?address=%2F${id}`;
    case 'AuraDefinitionBundle':
      return `/lightning/setup/AuraBundleDefinitions/page?address=%2F${id}`;
    case 'FlexiPage':
      return `/lightning/setup/FlexiPageList/page?address=%2F${id}`;
    default:
      return null;
  }
}

// --- Deep Scan ---

interface DependencyRecord {
  MetadataComponentId: string;
  MetadataComponentName: string;
  MetadataComponentType: string;
  RefMetadataComponentId: string;
  RefMetadataComponentName: string;
  RefMetadataComponentType: string;
}

type ScanDirection = 'usedBy' | 'uses';

async function fetchDependencies(
  instanceUrl: string,
  componentId: string,
  direction: ScanDirection,
  forceRefresh = false
): Promise<DependencyRecord[]> {
  const cacheKey = `${componentId}:${direction}`;

  if (!forceRefresh) {
    const cached = getCached(cacheKey);
    if (cached) return cached;
  }

  const safeId = assertSalesforceId(componentId, 'component');
  const whereClause = direction === 'usedBy'
    ? `RefMetadataComponentId = '${safeId}'`
    : `MetadataComponentId = '${safeId}'`;
  const query = `SELECT MetadataComponentId, MetadataComponentName, MetadataComponentType, RefMetadataComponentId, RefMetadataComponentName, RefMetadataComponentType FROM MetadataComponentDependency WHERE ${whereClause}`;

  const result = await sendMessage('executeToolingQuery', { instanceUrl, query });
  const records: DependencyRecord[] = result.records || [];
  setCache(cacheKey, records);
  return records;
}

async function runDeepScan(forceRefresh = false): Promise<void> {
  if (!currentCtx) return;

  const info = getComponentFromUrl();
  if (!info?.componentId) {
    showToast('Could not determine component ID from URL');
    return;
  }

  const displayName = extractComponentNameFromHeader() ?? info.componentId;

  const { card, close } = createModal(MODAL_ID, { width: '700px' });

  // Header
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
  title.textContent = `Dependencies: ${displayName}`;

  const headerRight = document.createElement('div');
  headerRight.setAttribute('style', `display: flex; align-items: center; gap: ${tokens.space.md};`);

  const refreshBtn = createButton('Refresh', { primary: false, small: true });
  refreshBtn.title = 'Clear cache and re-scan';
  refreshBtn.addEventListener('click', () => {
    close();
    runDeepScan(true);
  });

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '\u00d7';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.setAttribute('style', `
    border: none; background: none; font-size: 22px; cursor: pointer;
    color: ${tokens.color.textSalesforceGray}; padding: 0 ${tokens.space.xs}; line-height: 1;
  `);
  closeBtn.addEventListener('click', close);

  headerRight.append(refreshBtn, closeBtn);
  headerDiv.append(title, headerRight);
  card.appendChild(headerDiv);

  // Tabs
  let activeTab: ScanDirection = 'usedBy';
  const tabBar = document.createElement('div');
  tabBar.setAttribute('style', `
    display: flex;
    border-bottom: 1px solid ${tokens.color.borderDefault};
  `);

  const tabUsedBy = createTabButton('Used By', true);
  const tabUses = createTabButton('Uses', false);

  tabBar.append(tabUsedBy, tabUses);
  card.appendChild(tabBar);

  // Body container
  const bodyContainer = document.createElement('div');
  bodyContainer.setAttribute('style', 'flex: 1; min-height: 0; overflow-y: auto;');
  card.appendChild(bodyContainer);

  function createTabButton(label: string, isActive: boolean): HTMLButtonElement {
    const tab = document.createElement('button');
    tab.textContent = label;
    tab.setAttribute('style', getTabStyle(isActive));
    return tab;
  }

  function getTabStyle(isActive: boolean): string {
    return `
      flex: 1;
      padding: ${tokens.space.md} ${tokens.space.lg};
      border: none;
      background: ${isActive ? tokens.color.surfaceBase : tokens.color.surfaceSubtle};
      color: ${isActive ? tokens.color.primary : tokens.color.textSecondary};
      font-size: ${tokens.font.size.base};
      font-weight: ${isActive ? tokens.font.weight.semibold : tokens.font.weight.medium};
      cursor: pointer;
      border-bottom: 2px solid ${isActive ? tokens.color.primary : 'transparent'};
      font-family: ${tokens.font.family.sans};
      transition: all ${tokens.transition.fast};
    `;
  }

  async function loadTab(direction: ScanDirection, force = false): Promise<void> {
    activeTab = direction;
    tabUsedBy.setAttribute('style', getTabStyle(direction === 'usedBy'));
    tabUses.setAttribute('style', getTabStyle(direction === 'uses'));
    bodyContainer.innerHTML = '';

    // Loading state
    const loadingDiv = document.createElement('div');
    loadingDiv.setAttribute('style', `padding: 40px; display: flex; flex-direction: column; align-items: center; gap: ${tokens.space.lg};`);
    loadingDiv.appendChild(createSpinner());
    const loadingText = document.createElement('span');
    loadingText.setAttribute('style', `color: ${tokens.color.textSalesforceGray}; font-size: ${tokens.font.size.base};`);
    loadingText.textContent = 'Scanning dependencies...';
    loadingDiv.appendChild(loadingText);
    bodyContainer.appendChild(loadingDiv);

    try {
      const records = await fetchDependencies(
        currentCtx!.pageContext.instanceUrl,
        info!.componentId,
        direction,
        force
      );
      bodyContainer.innerHTML = '';
      renderResults(bodyContainer, records, direction);
    } catch (err: any) {
      bodyContainer.innerHTML = '';
      renderError(bodyContainer, err.message, direction);
    }
  }

  tabUsedBy.addEventListener('click', () => {
    if (activeTab !== 'usedBy') loadTab('usedBy');
  });
  tabUses.addEventListener('click', () => {
    if (activeTab !== 'uses') loadTab('uses');
  });

  // Load initial tab
  loadTab('usedBy', forceRefresh);
}

// --- Render ---

const TYPE_ICONS: Record<string, string> = {
  Flow: '\u{1F504}',
  ApexClass: '\u{1F4DD}',
  ApexTrigger: '\u26A1',
  LightningComponentBundle: '\u{1F4E6}',
  AuraDefinitionBundle: '\u{1F4E6}',
  CustomField: '\u{1F3F7}',
  ValidationRule: '\u2705',
  WorkflowRule: '\u{1F527}',
  Layout: '\u{1F4CB}',
  FlexiPage: '\u{1F4F1}',
  CustomObject: '\u{1F4C1}',
  PermissionSet: '\u{1F512}',
  Profile: '\u{1F464}',
};

interface DisplayRecord {
  name: string;
  type: string;
  id: string;
}

function extractDisplayRecords(records: DependencyRecord[], direction: ScanDirection): DisplayRecord[] {
  if (direction === 'usedBy') {
    return records.map(r => ({
      name: r.MetadataComponentName,
      type: r.MetadataComponentType,
      id: r.MetadataComponentId,
    }));
  }
  return records.map(r => ({
    name: r.RefMetadataComponentName,
    type: r.RefMetadataComponentType,
    id: r.RefMetadataComponentId,
  }));
}

function renderError(container: HTMLElement, message: string, direction: ScanDirection): void {
  const errorDiv = document.createElement('div');
  errorDiv.setAttribute('style', `padding: ${tokens.space['2xl']}; text-align: center;`);

  const errorText = document.createElement('div');
  errorText.setAttribute('style', `color: ${tokens.color.error}; font-size: ${tokens.font.size.base}; margin-bottom: ${tokens.space.lg};`);
  errorText.textContent = `Error: ${message}`;
  errorDiv.appendChild(errorText);

  const retryBtn = createButton('Retry', { primary: false, small: true });
  retryBtn.addEventListener('click', () => {
    container.innerHTML = '';
    // Re-trigger the same tab load with force refresh
    const loadingDiv = document.createElement('div');
    loadingDiv.setAttribute('style', `padding: 40px; display: flex; flex-direction: column; align-items: center; gap: ${tokens.space.lg};`);
    loadingDiv.appendChild(createSpinner());
    const loadingText = document.createElement('span');
    loadingText.setAttribute('style', `color: ${tokens.color.textSalesforceGray}; font-size: ${tokens.font.size.base};`);
    loadingText.textContent = 'Retrying...';
    loadingDiv.appendChild(loadingText);
    container.appendChild(loadingDiv);

    const info = getComponentFromUrl();
    if (!info || !currentCtx) return;

    fetchDependencies(currentCtx.pageContext.instanceUrl, info.componentId, direction, true)
      .then(records => {
        container.innerHTML = '';
        renderResults(container, records, direction);
      })
      .catch(err => {
        container.innerHTML = '';
        renderError(container, err.message, direction);
      });
  });
  errorDiv.appendChild(retryBtn);

  container.appendChild(errorDiv);
}

function renderResults(
  container: HTMLElement,
  records: DependencyRecord[],
  direction: ScanDirection
): void {
  const body = document.createElement('div');
  body.setAttribute('style', `padding: ${tokens.space.lg} ${tokens.space['2xl']};`);

  const displayRecords = extractDisplayRecords(records, direction);

  if (displayRecords.length === 0) {
    const empty = document.createElement('div');
    empty.setAttribute('style', `padding: 24px; text-align: center; color: ${tokens.color.textSalesforceGray}; font-size: ${tokens.font.size.base};`);
    empty.textContent = direction === 'usedBy'
      ? 'No dependencies found. This component is not referenced anywhere.'
      : 'No dependencies found. This component does not reference other components.';
    body.appendChild(empty);
    container.appendChild(body);
    return;
  }

  // Summary
  const summary = document.createElement('div');
  summary.setAttribute('style', `margin-bottom: ${tokens.space.lg}; font-size: ${tokens.font.size.base}; color: ${tokens.color.textSalesforceGray};`);
  summary.textContent = `Found ${displayRecords.length} reference(s)`;
  body.appendChild(summary);

  // Filter bar (show when 10+ results)
  let currentFilter = '';
  const sectionContainer = document.createElement('div');

  if (displayRecords.length >= 10) {
    const { container: filterContainer, countSpan } = createFilterBar({
      placeholder: 'Filter dependencies...',
      onInput: (value) => {
        currentFilter = value.toLowerCase();
        renderGroupedSections(sectionContainer, displayRecords, currentFilter, countSpan);
      },
      onClear: () => {
        currentFilter = '';
        renderGroupedSections(sectionContainer, displayRecords, currentFilter, countSpan);
      },
    });
    body.appendChild(filterContainer);
  }

  renderGroupedSections(sectionContainer, displayRecords, currentFilter, null);
  body.appendChild(sectionContainer);

  // Copy All button (tab-separated for Excel)
  const footer = document.createElement('div');
  footer.setAttribute('style', `
    display: flex;
    gap: ${tokens.space.md};
    margin-top: ${tokens.space.lg};
    padding-top: ${tokens.space.lg};
    border-top: 1px solid ${tokens.color.borderDefault};
  `);

  const copyAllBtn = createButton('Copy All', { primary: false, small: true });
  copyAllBtn.addEventListener('click', () => {
    const header = 'Type\tName\tId';
    const rows = displayRecords.map(r => `${r.type}\t${r.name}\t${r.id}`);
    navigator.clipboard.writeText([header, ...rows].join('\n'));
    showToast('Copied all dependencies (tab-separated)', 'right');
  });
  footer.appendChild(copyAllBtn);
  body.appendChild(footer);

  container.appendChild(body);
}

function renderGroupedSections(
  container: HTMLElement,
  records: DisplayRecord[],
  filter: string,
  countSpan: HTMLSpanElement | null
): void {
  container.innerHTML = '';

  const filtered = filter
    ? records.filter(r => r.name.toLowerCase().includes(filter) || r.type.toLowerCase().includes(filter))
    : records;

  if (countSpan) {
    countSpan.textContent = filter ? `${filtered.length} / ${records.length}` : `${records.length}`;
  }

  // Group by type
  const grouped: Record<string, DisplayRecord[]> = {};
  for (const rec of filtered) {
    const type = rec.type || 'Other';
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(rec);
  }

  if (filtered.length === 0 && filter) {
    const noMatch = document.createElement('div');
    noMatch.setAttribute('style', `padding: 16px; text-align: center; color: ${tokens.color.textSalesforceGray}; font-size: ${tokens.font.size.base};`);
    noMatch.textContent = 'No matching dependencies';
    container.appendChild(noMatch);
    return;
  }

  for (const [type, deps] of Object.entries(grouped).sort((a, b) => b[1].length - a[1].length)) {
    const section = document.createElement('div');
    section.setAttribute('style', `margin-bottom: ${tokens.space.md};`);

    const sectionHeader = document.createElement('div');
    sectionHeader.setAttribute('style', `
      padding: ${tokens.space.md} ${tokens.space.lg};
      background: ${tokens.color.surfaceSubtle};
      border-radius: ${tokens.radius.md};
      font-size: ${tokens.font.size.base};
      font-weight: ${tokens.font.weight.semibold};
      color: ${tokens.color.textSecondary};
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: ${tokens.space.md};
      user-select: none;
    `);
    const icon = TYPE_ICONS[type] || '\u{1F4C4}';
    sectionHeader.textContent = `${icon} ${type} (${deps.length})`;

    const itemList = document.createElement('div');
    itemList.setAttribute('style', `padding: ${tokens.space.xs} 0 ${tokens.space.xs} 24px;`);

    for (const dep of deps) {
      const item = document.createElement('div');
      item.setAttribute('style', `
        padding: ${tokens.space.sm} ${tokens.space.md};
        font-size: ${tokens.font.size.base};
        color: ${tokens.color.primary};
        cursor: pointer;
        border-radius: ${tokens.radius.sm};
        transition: background ${tokens.transition.fast};
        display: flex;
        align-items: center;
        gap: ${tokens.space.md};
      `);

      const nameSpan = document.createElement('span');
      nameSpan.textContent = dep.name;
      nameSpan.style.flex = '1';
      item.appendChild(nameSpan);

      const setupUrl = getSetupUrl(dep.type, dep.id);
      if (setupUrl) {
        const linkIcon = document.createElement('span');
        linkIcon.textContent = '\u2197'; // ↗
        linkIcon.setAttribute('style', `
          font-size: ${tokens.font.size.sm};
          color: ${tokens.color.textSalesforceGray};
          opacity: 0;
          transition: opacity ${tokens.transition.fast};
        `);
        linkIcon.title = 'Open in Setup';
        item.appendChild(linkIcon);

        item.addEventListener('mouseenter', () => {
          item.style.background = tokens.color.surfaceSelected;
          linkIcon.style.opacity = '1';
        });
        item.addEventListener('mouseleave', () => {
          item.style.background = '';
          linkIcon.style.opacity = '0';
        });

        item.addEventListener('click', (e) => {
          if (e.ctrlKey || e.metaKey) {
            // Ctrl+Click → copy name
            navigator.clipboard.writeText(dep.name);
            showToast(`Copied: ${dep.name}`, 'right');
          } else {
            // Click → navigate
            window.location.href = setupUrl;
          }
        });

        item.title = `Click to open · Ctrl+Click to copy`;
      } else {
        // No Setup URL available — just copy
        item.addEventListener('mouseenter', () => { item.style.background = tokens.color.surfaceSelected; });
        item.addEventListener('mouseleave', () => { item.style.background = ''; });
        item.addEventListener('click', () => {
          navigator.clipboard.writeText(dep.name);
          showToast(`Copied: ${dep.name}`, 'right');
        });
        item.title = 'Click to copy name';
      }

      itemList.appendChild(item);
    }

    // Toggle collapse
    let collapsed = false;
    sectionHeader.addEventListener('click', () => {
      collapsed = !collapsed;
      itemList.style.display = collapsed ? 'none' : 'block';
    });

    section.append(sectionHeader, itemList);
    container.appendChild(section);
  }
}

// --- Cleanup ---

function removeButton(): void {
  document.getElementById(BTN_ID)?.remove();

  const iframes = document.querySelectorAll('iframe');
  for (const iframe of Array.from(iframes)) {
    try {
      const src = iframe.src || '';
      if (src) {
        try {
          const iframeUrl = new URL(src, window.location.origin);
          if (!isAllowedSalesforceDomain(iframeUrl.hostname)) continue;
        } catch { continue; }
      }
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) continue;
      doc.getElementById(BTN_ID)?.remove();
    } catch (e) {
      // Ignore
    }
  }
}

function removeModal(): void {
  document.getElementById(MODAL_ID)?.remove();
  document.getElementById(`${MODAL_ID}-backdrop`)?.remove();
}

// --- Module ---

function isRelevantPage(): boolean {
  return getComponentFromUrl() !== null;
}

const deepDependencyInspector: SFBoostModule = {
  id: 'deep-dependency-inspector',
  name: 'Deep Dependency Inspector',
  description: 'Show where Salesforce components are used and what they depend on',

  async init(ctx: ModuleContext) {
    currentCtx = ctx;
    if (isRelevantPage()) {
      scheduleInject();
    }
  },

  async onNavigate(ctx: ModuleContext) {
    currentCtx = ctx;
    disconnectObserver();
    removeButton();
    removeModal();
    if (isRelevantPage()) {
      scheduleInject();
    }
  },

  destroy() {
    disconnectObserver();
    removeButton();
    removeModal();
    currentCtx = null;
    cache.clear();
  },
};

registry.register(deepDependencyInspector);
