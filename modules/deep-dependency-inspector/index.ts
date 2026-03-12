import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';
import { sendMessage } from '../../lib/messaging';
import { createModal, createSpinner, createButton } from '../../lib/ui-helpers';
import { showToast } from '../../lib/toast';
import { assertSalesforceId, isAllowedSalesforceDomain } from '../../lib/salesforce-utils';

const BTN_ID = 'sfboost-deep-scan-btn';
const MODAL_ID = 'sfboost-dependency-modal';

let currentCtx: ModuleContext | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

// --- Page Detection ---

interface PageInfo {
  componentId: string;   // Salesforce ID (for API query via RefMetadataComponentId)
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

  // Apex Classes: /lightning/setup/ApexClasses/page?address=/{classId}
  if (pathname.includes('/lightning/setup/ApexClasses/')) {
    const address = new URLSearchParams(window.location.search).get('address');
    const classId = extractSalesforceIdFromAddress(address);
    if (classId) return { componentId: classId, componentType: 'ApexClass' };
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
      // Verify iframe origin before accessing content
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
  // Try to get the field/component name from the page header
  const selectors = [
    'h1.slds-page-header__title',
    '.slds-page-header__title',
    '.uiOutputText[data-aura-rendered-by]',
    '.pageDescription', // Classic Aloha setup pages
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

  // Find header to inject near
  const headerSelectors = [
    '.slds-page-header__title',
    '.slds-page-header__detail-block',
    'h1.slds-page-header__title',
    '.test-id__field-header',
    '.entityNameTitle',
    '.pageDescription', // Classic Aloha setup pages
  ];

  const header = findNodeInDocumentOrIframes(headerSelectors);
  if (!header) return false;

  const btn = createButton('Deep Scan', { small: false });
  btn.id = BTN_ID;
  btn.style.marginLeft = '12px';
  btn.style.verticalAlign = 'middle';

  btn.addEventListener('click', () => runDeepScan());

  // Insert after header
  if (header.parentElement) {
    header.parentElement.insertBefore(btn, header.nextSibling);
  }

  return true;
}

function scheduleInject(attempts = 15, delay = 500): void {
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

// --- Deep Scan ---

interface DependencyRecord {
  MetadataComponentId: string;
  MetadataComponentName: string;
  MetadataComponentType: string;
  RefMetadataComponentId: string;
  RefMetadataComponentName: string;
  RefMetadataComponentType: string;
}

interface GroupedDependencies {
  [type: string]: DependencyRecord[];
}

async function runDeepScan(): Promise<void> {
  if (!currentCtx) return;

  const info = getComponentFromUrl();
  if (!info?.componentId) {
    showToast('Could not determine component ID from URL');
    return;
  }

  // Display name from page header (label, used only for UI)
  const displayName = extractComponentNameFromHeader() ?? info.componentId;

  const { card, close } = createModal(MODAL_ID, { width: '640px' });

  // Header
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
  title.textContent = `Dependencies: ${displayName}`;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '\u00d7';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.setAttribute('style', `
    border: none; background: none; font-size: 22px; cursor: pointer;
    color: #706e6b; padding: 0 4px; line-height: 1;
  `);
  closeBtn.addEventListener('click', close);

  headerDiv.append(title, closeBtn);
  card.appendChild(headerDiv);

  // Loading
  const loadingDiv = document.createElement('div');
  loadingDiv.setAttribute('style', 'padding: 40px; display: flex; flex-direction: column; align-items: center; gap: 12px;');
  loadingDiv.appendChild(createSpinner());
  const loadingText = document.createElement('span');
  loadingText.setAttribute('style', 'color: #706e6b; font-size: 13px;');
  loadingText.textContent = 'Scanning dependencies...';
  loadingDiv.appendChild(loadingText);
  card.appendChild(loadingDiv);

  try {
    const safeId = assertSalesforceId(info.componentId, 'component');
    const usedByQuery = `SELECT MetadataComponentId, MetadataComponentName, MetadataComponentType, RefMetadataComponentId, RefMetadataComponentName, RefMetadataComponentType FROM MetadataComponentDependency WHERE RefMetadataComponentId = '${safeId}'`;

    const result = await sendMessage('executeToolingQuery', {
      instanceUrl: currentCtx.pageContext.instanceUrl,
      query: usedByQuery,
    });

    loadingDiv.remove();
    renderResults(card, result.records || [], displayName, close);
  } catch (err: any) {
    loadingDiv.remove();
    const errorDiv = document.createElement('div');
    errorDiv.setAttribute('style', 'padding: 20px; color: #ef4444; font-size: 13px;');
    errorDiv.textContent = `Error: ${err.message}`;
    card.appendChild(errorDiv);
  }
}

function renderResults(
  card: HTMLDivElement,
  records: DependencyRecord[],
  componentName: string,
  close: () => void
): void {
  const body = document.createElement('div');
  body.setAttribute('style', 'padding: 12px 20px; flex: 1; min-height: 0; overflow-y: auto;');

  if (records.length === 0) {
    const empty = document.createElement('div');
    empty.setAttribute('style', 'padding: 24px; text-align: center; color: #706e6b; font-size: 13px;');
    empty.textContent = 'No dependencies found. This component is not referenced anywhere.';
    body.appendChild(empty);
    card.appendChild(body);
    return;
  }

  // Summary
  const summary = document.createElement('div');
  summary.setAttribute('style', 'margin-bottom: 12px; font-size: 13px; color: #706e6b;');
  summary.textContent = `Found ${records.length} reference(s)`;
  body.appendChild(summary);

  // Group by type
  const grouped: GroupedDependencies = {};
  for (const rec of records) {
    const type = rec.MetadataComponentType || 'Other';
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(rec);
  }

  // Type icon map
  const typeIcons: Record<string, string> = {
    Flow: '\u{1F504}',
    ApexClass: '\u{1F4DD}',
    ApexTrigger: '\u26A1',
    LightningComponentBundle: '\u{1F4E6}',
    CustomField: '\u{1F3F7}',
    ValidationRule: '\u2705',
    WorkflowRule: '\u{1F527}',
    Layout: '\u{1F4CB}',
    FlexiPage: '\u{1F4F1}',
  };

  for (const [type, deps] of Object.entries(grouped).sort((a, b) => b[1].length - a[1].length)) {
    const section = document.createElement('div');
    section.setAttribute('style', 'margin-bottom: 8px;');

    const sectionHeader = document.createElement('div');
    sectionHeader.setAttribute('style', `
      padding: 8px 12px;
      background: #f3f4f6;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      color: #374151;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
    `);
    const icon = typeIcons[type] || '\u{1F4C4}';
    sectionHeader.textContent = `${icon} ${type} (${deps.length})`;

    const itemList = document.createElement('div');
    itemList.setAttribute('style', 'padding: 4px 0 4px 24px;');

    for (const dep of deps) {
      const item = document.createElement('div');
      item.setAttribute('style', `
        padding: 6px 8px;
        font-size: 13px;
        color: #0176d3;
        cursor: pointer;
        border-radius: 4px;
        transition: background 0.1s;
      `);
      item.textContent = dep.MetadataComponentName;
      item.addEventListener('mouseenter', () => { item.style.background = '#f0f7ff'; });
      item.addEventListener('mouseleave', () => { item.style.background = ''; });
      item.addEventListener('click', () => {
        navigator.clipboard.writeText(dep.MetadataComponentName);
        showToast(`Copied: ${dep.MetadataComponentName}`, 'right');
      });
      itemList.appendChild(item);
    }

    // Toggle collapse
    let collapsed = false;
    sectionHeader.addEventListener('click', () => {
      collapsed = !collapsed;
      itemList.style.display = collapsed ? 'none' : 'block';
    });

    section.append(sectionHeader, itemList);
    body.appendChild(section);
  }

  // Copy all button
  const copyAllBtn = createButton('Copy All', { primary: false, small: true });
  copyAllBtn.style.marginTop = '12px';
  copyAllBtn.addEventListener('click', () => {
    const text = records
      .map(r => `${r.MetadataComponentType}: ${r.MetadataComponentName}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    showToast('Copied all dependencies', 'right');
  });
  body.appendChild(copyAllBtn);

  card.appendChild(body);
}

// --- Cleanup ---

function removeButton(): void {
  document.getElementById(BTN_ID)?.remove();

  // Clean up inside iframes as well
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
  const pathname = window.location.pathname;
  return (
    (pathname.includes('/ObjectManager/') && pathname.includes('/FieldsAndRelationships/')) ||
    pathname.includes('/lightning/setup/ApexClasses/')
  );
}

const deepDependencyInspector: SFBoostModule = {
  id: 'deep-dependency-inspector',
  name: 'Deep Dependency Inspector',
  description: 'Show where Object Manager fields and Apex classes are used',

  async init(ctx: ModuleContext) {
    currentCtx = ctx;
    if (isRelevantPage()) {
      scheduleInject();
    }
  },

  async onNavigate(ctx: ModuleContext) {
    currentCtx = ctx;
    cancelRetry();
    removeButton();
    removeModal();
    if (isRelevantPage()) {
      scheduleInject();
    }
  },

  destroy() {
    cancelRetry();
    removeButton();
    removeModal();
    currentCtx = null;
  },
};

registry.register(deepDependencyInspector);
