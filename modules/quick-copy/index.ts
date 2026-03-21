import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';
import { getModuleSettings } from '../../lib/storage';
import { showToast } from '../../lib/toast';
import { tokens } from '../../lib/design-tokens';

const COPY_BTN_CLASS = 'sfboost-copy-btn';
let currentCtx: ModuleContext | null = null;
let qcSettings: Record<string, boolean> = {};
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function createCopyButton(text: string, tooltip: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = COPY_BTN_CLASS;
  btn.title = tooltip;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const svgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  svgRect.setAttribute('x', '9');
  svgRect.setAttribute('y', '9');
  svgRect.setAttribute('width', '13');
  svgRect.setAttribute('height', '13');
  svgRect.setAttribute('rx', '2');
  svgRect.setAttribute('ry', '2');
  const svgPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  svgPath.setAttribute('d', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1');
  svg.append(svgRect, svgPath);
  btn.appendChild(svg);
  btn.setAttribute('style', `
    display: inline-flex; align-items: center; justify-content: center;
    width: 24px; height: 24px;
    background: transparent;
    border: 1px solid ${tokens.color.borderMuted};
    border-radius: ${tokens.radius.sm};
    cursor: pointer;
    color: ${tokens.color.textTertiary};
    margin-left: ${tokens.space.sm};
    vertical-align: middle;
    transition: all ${tokens.transition.normal};
    padding: 0;
  `);

  btn.addEventListener('mouseenter', () => {
    btn.style.background = tokens.color.primaryLight;
    btn.style.borderColor = tokens.color.primary;
    btn.style.color = tokens.color.primary;
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'transparent';
    btn.style.borderColor = tokens.color.borderMuted;
    btn.style.color = tokens.color.textTertiary;
  });

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(text);
      showToast(`Copied: ${text.length > 40 ? text.slice(0, 40) + '...' : text}`);
    } catch {
      showToast('Failed to copy to clipboard');
    }
  });

  return btn;
}

const HEADER_SELECTORS = [
  // LWC highlights panel
  'records-lwc-highlights-panel .slds-page-header__title',
  // Highlights details (older Aura layout)
  'records-highlights-details .slds-page-header__title',
  // Entity name title (classic)
  '.entityNameTitle',
  // Generic page header title
  'h1.slds-page-header__title',
  // Formatted name inside highlights (Contact, Lead, PersonAccount)
  'records-lwc-highlights-panel lightning-formatted-name',
  'records-highlights-details lightning-formatted-name',
  // Entity label
  'records-entity-label',
  // Force highlights panel (Aura wrapper)
  '[data-aura-class="forceHighlightsPanel"] .slds-page-header__title',
  // Generic heading in highlights
  'records-lwc-highlights-panel h1',
  'records-highlights-details h1',
  // Name-title wrapper
  '.slds-page-header__name-title h1',
  // Standalone formatted name (last resort)
  'lightning-formatted-name',
];

function findRecordHeader(): Element | null {
  // Try standard selectors
  for (const sel of HEADER_SELECTORS) {
    const el = document.querySelector(sel);
    if (el && (el as HTMLElement).offsetParent !== null) return el;
  }
  // Fallback: any visible element from the full selector list (including hidden ones above)
  for (const sel of HEADER_SELECTORS) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

/** Try to inject the copy button. Returns true if the header was found. */
function injectRecordIdCopyButton(): boolean {
  if (!currentCtx) return false;
  const { recordId } = currentCtx.pageContext;
  if (!recordId) return false;

  // Already injected?
  if (document.querySelector(`.${COPY_BTN_CLASS}[data-sfboost-record-id]`)) return true;

  const header = findRecordHeader();
  if (!header) return false;

  const btn = createCopyButton(recordId, `Copy Record ID: ${recordId}`);
  btn.setAttribute('data-sfboost-record-id', 'true');
  header.parentElement?.insertBefore(btn, header.nextSibling);
  return true;
}

function removeCopyButtons() {
  document.querySelectorAll(`.${COPY_BTN_CLASS}`).forEach((el) => el.remove());
}

function cancelRetry() {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
}

/** Retry injection until header is found or attempts exhausted. */
function scheduleInject(attempts = 12, delay = 350) {
  cancelRetry();
  // Try immediately first
  if (injectRecordIdCopyButton()) return;
  let left = attempts - 1;
  const tryAgain = () => {
    if (injectRecordIdCopyButton() || left-- <= 0) { retryTimer = null; return; }
    retryTimer = setTimeout(tryAgain, delay);
  };
  retryTimer = setTimeout(tryAgain, delay);
}

// --- List view hover copy ---

const LIST_COPY_CLASS = 'sfboost-list-copy';
const LIST_STYLE_ID = 'sfboost-list-copy-style';
let listDelegate: ((e: MouseEvent) => void) | null = null;
let listObserver: MutationObserver | null = null;
let listObserverDebounce: ReturnType<typeof setTimeout> | null = null;

function extractRecordIdFromRow(row: HTMLTableRowElement): string | null {
  // Try data-row-key-value attribute (Lightning list views)
  const key = row.getAttribute('data-row-key-value');
  if (key && /^[a-zA-Z0-9]{15,18}$/.test(key)) return key;

  // Try links inside the row
  const links = row.querySelectorAll<HTMLAnchorElement>('a[href*="/lightning/r/"]');
  for (const link of links) {
    const m = link.href.match(/\/lightning\/r\/\w+\/(\w{15,18})\//);
    if (m?.[1]) return m[1];
  }

  return null;
}

function createListCopyIcon(recordId: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = LIST_COPY_CLASS;
  btn.setAttribute('data-sfboost-rid', recordId);
  btn.title = `Copy ID: ${recordId}`;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '13');
  svg.setAttribute('height', '13');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const svgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  svgRect.setAttribute('x', '9');
  svgRect.setAttribute('y', '9');
  svgRect.setAttribute('width', '13');
  svgRect.setAttribute('height', '13');
  svgRect.setAttribute('rx', '2');
  svgRect.setAttribute('ry', '2');
  const svgPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  svgPath.setAttribute('d', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1');
  svg.append(svgRect, svgPath);
  btn.appendChild(svg);

  btn.setAttribute('style', `
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: ${tokens.radius.sm};
    cursor: pointer;
    color: ${tokens.color.textTertiary};
    margin-left: ${tokens.space.sm};
    vertical-align: middle;
    padding: 0;
    flex-shrink: 0;
  `);

  return btn;
}

/** Find the cell that contains the record name link and return it along with the anchor */
function findNameCell(row: HTMLTableRowElement): { cell: HTMLElement; anchor: HTMLAnchorElement } | null {
  // Try th[scope="row"] first (Lightning standard)
  const th = row.querySelector<HTMLElement>('th[scope="row"]');
  if (th) {
    const a = th.querySelector<HTMLAnchorElement>('a[href*="/lightning/r/"]');
    if (a) return { cell: th, anchor: a };
  }

  // Fallback: any td/th with a record link
  const cells = row.querySelectorAll<HTMLElement>('td, th');
  for (const cell of cells) {
    const a = cell.querySelector<HTMLAnchorElement>('a[href*="/lightning/r/"]');
    if (a) return { cell, anchor: a };
  }

  return null;
}

function injectCopyButtonForRow(row: HTMLTableRowElement): void {
  if (row.querySelector(`.${LIST_COPY_CLASS}`)) return;
  const recordId = extractRecordIdFromRow(row);
  if (!recordId) return;

  const nameCell = findNameCell(row);
  if (!nameCell) return;

  const btn = createListCopyIcon(recordId);
  // Insert right after the anchor element
  nameCell.anchor.parentElement?.insertBefore(btn, nameCell.anchor.nextSibling);
}

function ensureListStyles(): void {
  if (document.getElementById(LIST_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = LIST_STYLE_ID;
  style.textContent = `
    .${LIST_COPY_CLASS} {
      opacity: 0.3;
      transition: opacity ${tokens.transition.normal}, border-color ${tokens.transition.normal}, color ${tokens.transition.normal};
    }
    tr:hover .${LIST_COPY_CLASS},
    tr[data-row-key-value]:hover .${LIST_COPY_CLASS} {
      opacity: 1;
    }
    .${LIST_COPY_CLASS}:hover {
      background: ${tokens.color.primaryLight} !important;
      border-color: ${tokens.color.primary} !important;
      color: ${tokens.color.primary} !important;
    }
  `;
  document.head.appendChild(style);
}

function injectListViewCopy(): void {
  removeListViewCopy();
  ensureListStyles();

  listDelegate = (e: MouseEvent) => {
    const btn = (e.target as Element)?.closest(`.${LIST_COPY_CLASS}`) as HTMLElement | null;
    if (!btn) return;
    e.stopPropagation();
    e.preventDefault();
    const id = btn.getAttribute('data-sfboost-rid');
    if (id) {
      navigator.clipboard.writeText(id).then(() => showToast(`Copied: ${id}`))
        .catch(() => showToast('Failed to copy'));
    }
  };
  document.addEventListener('click', listDelegate, true);

  const table = document.querySelector<HTMLTableElement>('table[role="grid"]');
  if (!table) return;

  const rows = table.querySelectorAll<HTMLTableRowElement>('tr[data-row-key-value]');
  for (const row of rows) {
    injectCopyButtonForRow(row);
  }

  // Observe table for new rows (e.g. after lazy-load hydration by table-filter)
  const tbody = table.querySelector('tbody') ?? table;
  listObserver = new MutationObserver(() => {
    if (listObserverDebounce) clearTimeout(listObserverDebounce);
    listObserverDebounce = setTimeout(() => {
      listObserverDebounce = null;
      const newRows = table.querySelectorAll<HTMLTableRowElement>('tr[data-row-key-value]');
      for (const row of newRows) {
        injectCopyButtonForRow(row);
      }
    }, 300);
  });
  listObserver.observe(tbody, { childList: true, subtree: true });
}

function removeListViewCopy(): void {
  if (listObserver) { listObserver.disconnect(); listObserver = null; }
  if (listObserverDebounce) { clearTimeout(listObserverDebounce); listObserverDebounce = null; }
  document.getElementById(LIST_STYLE_ID)?.remove();
  document.querySelectorAll(`.${LIST_COPY_CLASS}`).forEach(el => el.remove());
  if (listDelegate) {
    document.removeEventListener('click', listDelegate, true);
    listDelegate = null;
  }
}

let listRetryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleListInject(attempts = 8, delay = 500): void {
  if (listRetryTimer) { clearTimeout(listRetryTimer); listRetryTimer = null; }
  const table = document.querySelector('table[role="grid"] tr[data-row-key-value]');
  if (table) { injectListViewCopy(); return; }
  let left = attempts - 1;
  const tryAgain = () => {
    const found = document.querySelector('table[role="grid"] tr[data-row-key-value]');
    if (found) { injectListViewCopy(); listRetryTimer = null; return; }
    if (left-- <= 0) { listRetryTimer = null; return; }
    listRetryTimer = setTimeout(tryAgain, delay);
  };
  listRetryTimer = setTimeout(tryAgain, delay);
}

const quickCopy: SFBoostModule = {
  id: 'quick-copy',
  name: 'Quick Copy',
  description: 'Copy record IDs and field values with one click',

  async init(ctx: ModuleContext) {
    if (window.top !== window.self) return;
    qcSettings = await getModuleSettings('quick-copy');
    currentCtx = ctx;
    if (ctx.pageContext.pageType === 'record' && qcSettings.copyId !== false) {
      scheduleInject();
    } else if (ctx.pageContext.pageType === 'list' && qcSettings.copyName !== false) {
      scheduleListInject();
    }
  },

  async onNavigate(ctx: ModuleContext) {
    if (window.top !== window.self) return;
    currentCtx = ctx;
    cancelRetry();
    removeCopyButtons();
    removeListViewCopy();
    if (listRetryTimer) { clearTimeout(listRetryTimer); listRetryTimer = null; }
    if (ctx.pageContext.pageType === 'record' && qcSettings.copyId !== false) {
      scheduleInject();
    } else if (ctx.pageContext.pageType === 'list' && qcSettings.copyName !== false) {
      scheduleListInject();
    }
  },

  destroy() {
    if (window.top !== window.self) return;
    cancelRetry();
    removeCopyButtons();
    removeListViewCopy();
    if (listRetryTimer) { clearTimeout(listRetryTimer); listRetryTimer = null; }
  },
};

registry.register(quickCopy);
