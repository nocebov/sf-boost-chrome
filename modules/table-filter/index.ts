import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';
import { getModuleSettings, type ModuleSettings } from '../../lib/storage';
import { tokens } from '../../lib/design-tokens';

const DATA_ATTR = 'data-sfboost-table-filter';
const CONTAINER_CLASS = 'sfboost-table-filter';
const HIGHLIGHT_CLASS = 'sfboost-tf-highlight';
const NO_MATCH_CLASS = 'sfboost-tf-no-match';
const MASK_CLASS = 'sfboost-tf-hydration-mask';
const AUTO_HYDRATE_MAX_ROWS = 2000;
const OBJECT_MANAGER_FIELDS_PATTERN = /\/lightning\/setup\/ObjectManager\/\w+\/FieldsAndRelationships\/view/i;
const HYDRATE_STEP_DELAY_MS = 120;
const HYDRATE_MAX_STEPS = 120;
const HYDRATE_STABLE_BOTTOM_PASSES = 4;
const SCROLLABLE_OVERFLOWS = new Set(['auto', 'overlay', 'scroll']);
const PROGRESSIVE_REFILTER_INTERVAL_MS = 200;

let observer: MutationObserver | null = null;
let scanTimer: ReturnType<typeof setTimeout> | null = null;
let initTimer: ReturnType<typeof setTimeout> | null = null;
let rowTextCache = new WeakMap<HTMLTableRowElement, string>();
let tableStates = new WeakMap<HTMLTableElement, TableState>();
let lifecycleToken = 0;
const activeDebounces = new Set<ReturnType<typeof setTimeout>>();
let tableFilterSettings: ModuleSettings = {};
let mutedObserverMutations = 0;

// --- Table Detection ---

interface DetectedTable {
  table: HTMLTableElement;
}

interface HydrationState {
  promise: Promise<void>;
  onNewRows: Set<() => void>;
  completed: boolean;
}

interface TableLoadSnapshot {
  loaded: number;
  expected: number | null;
  frontier: number;
  leadingNonDataRows: number;
}

interface TableState {
  activeQuery: string;
  clearBtn: HTMLButtonElement;
  countEl: HTMLSpanElement;
  inputEl: HTMLInputElement;
  progressBar: HTMLDivElement;
  hydration: HydrationState | null;
  requestSeq: number;
  rowsHydrated: boolean;
  // Pre-computed on injection to speed up first keystroke
  isLightningGrid: boolean;
  cachedExpectedRowCount: number | null;
  cachedScrollContainer: HTMLElement | null;
  deferLiveFiltering: boolean;
  searchIndex: Map<string, string>;
  maxSeenFrontier: number;
  hydrationStalledFrontier: number | null;
}

interface FilterUIResult {
  container: HTMLDivElement;
  state: TableState;
}

function detectTables(): DetectedTable[] {
  const seen = new Set<HTMLTableElement>();
  const results: DetectedTable[] = [];

  const add = (table: HTMLTableElement) => {
    if (seen.has(table) || table.hasAttribute(DATA_ATTR) || table.hasAttribute('data-sfboost-cs-managed')) return;
    // Skip tiny tables (layout tables, etc.)
    const rows = table.querySelectorAll('tbody tr, tr');
    if (rows.length < 3) return;
    seen.add(table);
    results.push({ table });
  };

  // Classic Setup tables
  document.querySelectorAll<HTMLTableElement>(
    'table.list, .pbBody table, .bRelatedList table, table.x-grid-with-paginator'
  ).forEach(add);

  // Lightning list view tables
  document.querySelectorAll<HTMLTableElement>('table[role="grid"]').forEach(add);

  // Generic fallback: any sizeable table
  document.querySelectorAll<HTMLTableElement>('table').forEach(add);

  return results;
}

// --- Helpers ---

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isLightningGridTable(table: HTMLTableElement): boolean {
  return table.getAttribute('role') === 'grid';
}

function getScrollableAncestor(table: HTMLTableElement, allowViewportFallback: boolean): HTMLElement | null {
  const lightningScroller = table.closest('.slds-scrollable_y');
  if (lightningScroller instanceof HTMLElement && lightningScroller.scrollHeight > lightningScroller.clientHeight + 24) {
    return lightningScroller;
  }

  let current = table.parentElement;
  while (current) {
    const { overflowY } = window.getComputedStyle(current);
    if (SCROLLABLE_OVERFLOWS.has(overflowY) && current.scrollHeight > current.clientHeight + 24) {
      return current;
    }
    current = current.parentElement;
  }

  if (!allowViewportFallback) return null;

  const scrollingEl = document.scrollingElement;
  if (scrollingEl instanceof HTMLElement && scrollingEl.scrollHeight > scrollingEl.clientHeight + 24) {
    return scrollingEl;
  }

  return null;
}

function isUsableScrollContainer(value: HTMLElement | null): value is HTMLElement {
  return value instanceof HTMLElement
    && value.isConnected
    && value.scrollHeight > value.clientHeight + 24;
}

function resolveScrollContainer(
  table: HTMLTableElement,
  cachedScrollContainer: HTMLElement | null,
  allowViewportFallback: boolean,
): HTMLElement | null {
  if (isUsableScrollContainer(cachedScrollContainer)) {
    return cachedScrollContainer;
  }

  return getScrollableAncestor(table, allowViewportFallback);
}

function withObserverMuted<T>(fn: () => T): T {
  mutedObserverMutations += 1;
  try {
    return fn();
  } finally {
    window.setTimeout(() => {
      mutedObserverMutations = Math.max(0, mutedObserverMutations - 1);
    }, 0);
  }
}

function getNodeElement(node: Node | null): HTMLElement | null {
  if (node instanceof HTMLElement) return node;
  return node instanceof Text ? node.parentElement : null;
}

function isFilterUiNode(node: Node | null): boolean {
  return Boolean(getNodeElement(node)?.closest(`.${CONTAINER_CLASS}`));
}

function unwrapElementPreservingText(element: Element): void {
  const parent = element.parentNode;
  if (!parent) return;

  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }

  parent.removeChild(element);
  parent.normalize();
}

function stripManagedMarkup(root: ParentNode): void {
  root.querySelectorAll('[class*="sfboost-"]').forEach(element => {
    if (!(element instanceof HTMLElement)) return;

    if (element.classList.contains(HIGHLIGHT_CLASS)) {
      unwrapElementPreservingText(element);
      return;
    }

    element.remove();
  });
}

// --- Hydration Mask ---

function createHydrationMask(scrollContainer: HTMLElement): HTMLDivElement {
  const rect = scrollContainer.getBoundingClientRect();
  const mask = document.createElement('div');
  mask.className = MASK_CLASS;
  mask.setAttribute('style', `
    position: fixed;
    top: ${rect.top}px;
    left: ${rect.left}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
    background: ${tokens.color.surfaceBase};
    z-index: ${tokens.zIndex.overlay};
    pointer-events: none;
    overflow: hidden;
  `);

  // Thin animated progress line at the top of mask
  const bar = document.createElement('div');
  bar.setAttribute('style', `
    position: absolute;
    top: 0; left: 0;
    height: 2px;
    background: ${tokens.color.primary};
    border-radius: ${tokens.radius.xs};
    width: 10%;
    animation: sfboost-tf-mask-shimmer 1.2s ease-in-out infinite;
  `);
  mask.appendChild(bar);

  // Inject keyframes if not present
  if (!document.getElementById('sfboost-tf-mask-keyframes')) {
    const style = document.createElement('style');
    style.id = 'sfboost-tf-mask-keyframes';
    style.textContent = `
      @keyframes sfboost-tf-mask-shimmer {
        0% { width: 10%; margin-left: 0; }
        50% { width: 40%; margin-left: 30%; }
        100% { width: 10%; margin-left: 90%; }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(mask);
  return mask;
}

function updateMaskPosition(mask: HTMLDivElement, scrollContainer: HTMLElement): void {
  const rect = scrollContainer.getBoundingClientRect();
  mask.style.top = `${rect.top}px`;
  mask.style.left = `${rect.left}px`;
  mask.style.width = `${rect.width}px`;
  mask.style.height = `${rect.height}px`;
}

// --- Search UI Creation ---

function createSearchIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('style', 'flex-shrink: 0;');

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '6.5');
  circle.setAttribute('cy', '6.5');
  circle.setAttribute('r', '5.5');
  circle.setAttribute('stroke', tokens.color.textSalesforceGray);
  circle.setAttribute('stroke-width', '1.5');

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', '10.5');
  line.setAttribute('y1', '10.5');
  line.setAttribute('x2', '15');
  line.setAttribute('y2', '15');
  line.setAttribute('stroke', tokens.color.textSalesforceGray);
  line.setAttribute('stroke-width', '1.5');
  line.setAttribute('stroke-linecap', 'round');

  svg.appendChild(circle);
  svg.appendChild(line);
  return svg;
}

function createProgressBar(): HTMLDivElement {
  const bar = document.createElement('div');
  bar.setAttribute('style', `
    position: absolute;
    bottom: 0; left: 0;
    height: 2px;
    background: ${tokens.color.primary};
    border-radius: ${tokens.radius.xs};
    transition: width ${tokens.transition.normal}, opacity ${tokens.transition.normal};
    width: 0%;
    opacity: 0;
  `);
  return bar;
}

function createFilterUI(table: HTMLTableElement): FilterUIResult {
  const container = document.createElement('div');
  container.className = CONTAINER_CLASS;
  container.setAttribute('style', `
    display: flex;
    align-items: center;
    gap: ${tokens.space.md};
    padding: ${tokens.space.sm} ${tokens.space.lg};
    margin-bottom: ${tokens.space.xs};
    background: ${tokens.color.surfaceBase};
    border: 1px solid ${tokens.color.borderInput};
    border-radius: ${tokens.radius.sm};
    font-family: ${tokens.font.family.sans};
    box-shadow: ${tokens.shadow.xs};
    position: relative;
    overflow: hidden;
  `);

  container.appendChild(createSearchIcon());

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Filter table...';
  input.setAttribute('style', `
    flex: 1;
    padding: 5px ${tokens.space.md};
    border: 1px solid ${tokens.color.borderInput};
    border-radius: ${tokens.radius.sm};
    font-size: ${tokens.font.size.base};
    outline: none;
    color: ${tokens.color.textPrimary};
    background: ${tokens.color.surfaceBase};
    min-width: 180px;
    max-width: 320px;
    transition: border-color ${tokens.transition.normal};
  `);
  input.addEventListener('focus', () => { input.style.borderColor = tokens.color.primary; });
  input.addEventListener('blur', () => { input.style.borderColor = tokens.color.borderInput; });

  const count = document.createElement('span');
  count.setAttribute('style', `
    font-size: ${tokens.font.size.sm};
    color: ${tokens.color.textSalesforceGray};
    white-space: nowrap;
    user-select: none;
  `);

  const clearBtn = document.createElement('button');
  clearBtn.textContent = '\u00d7';
  clearBtn.title = 'Clear filter';
  clearBtn.setAttribute('style', `
    display: none;
    border: none;
    background: none;
    color: ${tokens.color.textSalesforceGray};
    font-size: 18px;
    cursor: pointer;
    padding: 0 ${tokens.space.xs};
    line-height: 1;
    flex-shrink: 0;
    transition: color ${tokens.transition.normal};
  `);
  clearBtn.addEventListener('mouseenter', () => { clearBtn.style.color = tokens.color.textPrimary; });
  clearBtn.addEventListener('mouseleave', () => { clearBtn.style.color = tokens.color.textSalesforceGray; });

  const progressBar = createProgressBar();

  const isGrid = isLightningGridTable(table);
  const state: TableState = {
    activeQuery: '',
    clearBtn,
    countEl: count,
    inputEl: input,
    progressBar,
    hydration: null,
    requestSeq: 0,
    rowsHydrated: false,
    isLightningGrid: isGrid,
    cachedExpectedRowCount: isGrid ? getExpectedRowCount(table) : null,
    cachedScrollContainer: isGrid ? getScrollableAncestor(table, false) : null,
    deferLiveFiltering: false,
    searchIndex: new Map(),
    maxSeenFrontier: 0,
    hydrationStalledFrontier: null,
  };

  let debounce: ReturnType<typeof setTimeout> | null = null;
  const onInput = () => {
    if (debounce) {
      clearTimeout(debounce);
      activeDebounces.delete(debounce);
    }

    debounce = setTimeout(() => {
      activeDebounces.delete(debounce!);
      void runFilter(table, input.value);
    }, 150);

    activeDebounces.add(debounce);
  };

  input.addEventListener('input', onInput);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      void runFilter(table, '');
      input.blur();
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    void runFilter(table, '');
    input.focus();
  });

  container.appendChild(input);
  container.appendChild(count);
  container.appendChild(clearBtn);

  // "Load All" button only for very large tables (>2000 rows)
  if (isLightningGridTable(table)) {
    const expected = getExpectedRowCount(table);
    const loaded = getBodyRows(table).length;
    if (expected != null && loaded < expected && expected > AUTO_HYDRATE_MAX_ROWS) {
      const loadAllBtn = document.createElement('button');
      loadAllBtn.textContent = 'Load All';
      loadAllBtn.title = `Load all ${expected} rows`;
      loadAllBtn.setAttribute('style', `
        padding: 3px ${tokens.space.md};
        border: 1px solid ${tokens.color.borderInput};
        border-radius: ${tokens.radius.sm};
        background: ${tokens.color.surfaceBase};
        color: ${tokens.color.primary};
        font-size: ${tokens.font.size.sm};
        font-family: ${tokens.font.family.sans};
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
        transition: background ${tokens.transition.fast}, border-color ${tokens.transition.fast};
      `);
      loadAllBtn.addEventListener('mouseenter', () => {
        loadAllBtn.style.background = tokens.color.surfaceSelected;
        loadAllBtn.style.borderColor = tokens.color.primaryBorder;
      });
      loadAllBtn.addEventListener('mouseleave', () => {
        loadAllBtn.style.background = tokens.color.surfaceBase;
        loadAllBtn.style.borderColor = tokens.color.borderInput;
      });
      loadAllBtn.addEventListener('click', () => {
        loadAllBtn.disabled = true;
        loadAllBtn.style.opacity = '0.6';
        loadAllBtn.style.cursor = 'default';
        loadAllBtn.textContent = 'Loading...';

        void startHydration(table, state, true, false, true).then(() => {
          const liveState = tableStates.get(table);
          if (liveState !== state || !table.isConnected) return;

          const snapshot = syncSearchIndex(table, state);
          const trackedFrontier = getTrackedFrontier(state, snapshot);
          const fullyLoaded = snapshot.expected != null
            ? trackedFrontier >= snapshot.expected
            : state.rowsHydrated;

          if (fullyLoaded) {
            loadAllBtn.textContent = 'All loaded';
            loadAllBtn.style.color = tokens.color.success;
            loadAllBtn.style.borderColor = tokens.color.success;
          } else {
            loadAllBtn.disabled = false;
            loadAllBtn.style.opacity = '1';
            loadAllBtn.style.cursor = 'pointer';
            loadAllBtn.textContent = 'Retry Load';
            loadAllBtn.style.color = tokens.color.primary;
            loadAllBtn.style.borderColor = tokens.color.borderInput;
          }

          updateCount(table, count, state.activeQuery);

          if (state.activeQuery.trim()) {
            if (state.deferLiveFiltering) {
              resetFilterPresentation(table);
            } else {
              applyFilterToLoadedRows(table, state.activeQuery, count);
            }
          }
        });
      });
      container.appendChild(loadAllBtn);
    }
  }

  container.appendChild(progressBar);
  updateCount(table, count, '');

  return { container, state };
}

// --- Filtering ---

function getBodyRows(table: HTMLTableElement): HTMLTableRowElement[] {
  const tbody = table.querySelector('tbody');
  if (tbody) {
    return Array.from(tbody.querySelectorAll<HTMLTableRowElement>(`:scope > tr:not(.${NO_MATCH_CLASS})`));
  }

  const allRows = Array.from(table.querySelectorAll<HTMLTableRowElement>(`:scope > tr:not(.${NO_MATCH_CLASS})`));
  return allRows.slice(1);
}

function getExpectedRowCount(table: HTMLTableElement): number | null {
  const countSourceCandidates: Array<Element | null> = [
    table,
    table.closest('[aria-rowcount]'),
    table.parentElement?.querySelector('[aria-rowcount]') ?? null,
  ];

  let rawRowCount: number | null = null;
  for (const candidate of countSourceCandidates) {
    if (!(candidate instanceof Element)) continue;
    rawRowCount = parsePositiveInt(candidate.getAttribute('aria-rowcount'));
    if (rawRowCount != null) break;
  }

  if (rawRowCount == null) return null;

  const rowIndexes = getBodyRows(table)
    .map(row => parsePositiveInt(row.getAttribute('aria-rowindex')))
    .filter((value): value is number => value != null);

  if (rowIndexes.length === 0) return rawRowCount;

  const leadingNonDataRows = Math.max(0, Math.min(...rowIndexes) - 1);
  const adjusted = rawRowCount - leadingNonDataRows;
  return adjusted > 0 ? adjusted : rawRowCount;
}

function getTableLoadSnapshot(table: HTMLTableElement): TableLoadSnapshot {
  const rows = getBodyRows(table);
  const loaded = rows.length;
  const expected = getExpectedRowCount(table);

  const rowIndexes = rows
    .map(row => parsePositiveInt(row.getAttribute('aria-rowindex')))
    .filter((value): value is number => value != null);

  const leadingNonDataRows = rowIndexes.length > 0
    ? Math.max(0, Math.min(...rowIndexes) - 1)
    : 0;

  const maxAdjustedRowIndex = rowIndexes.length > 0
    ? Math.max(0, Math.max(...rowIndexes) - leadingNonDataRows)
    : loaded;

  return {
    loaded,
    expected,
    frontier: Math.max(loaded, maxAdjustedRowIndex),
    leadingNonDataRows,
  };
}

function getTrackedFrontier(state: TableState, snapshot?: TableLoadSnapshot): number {
  return Math.max(snapshot?.frontier ?? 0, state.maxSeenFrontier, state.searchIndex.size);
}

function getRowSearchKey(row: HTMLTableRowElement, leadingNonDataRows: number): string | null {
  const rawIndex = parsePositiveInt(row.getAttribute('aria-rowindex'));
  if (rawIndex != null) {
    return `idx:${Math.max(1, rawIndex - leadingNonDataRows)}`;
  }

  const rowKey = row.getAttribute('data-row-key-value')
    ?? row.getAttribute('data-row-key')
    ?? row.id
    ?? '';
  if (rowKey) return `key:${rowKey}`;

  const primaryLink = row.querySelector<HTMLAnchorElement>('a[href]');
  if (primaryLink?.href) return `href:${primaryLink.href}`;

  return null;
}

function syncSearchIndex(table: HTMLTableElement, state: TableState): TableLoadSnapshot {
  const snapshot = getTableLoadSnapshot(table);

  if (snapshot.expected != null) {
    state.cachedExpectedRowCount = snapshot.expected;
  }
  state.maxSeenFrontier = Math.max(state.maxSeenFrontier, snapshot.frontier);

  if (state.hydrationStalledFrontier != null && getTrackedFrontier(state, snapshot) > state.hydrationStalledFrontier) {
    state.hydrationStalledFrontier = null;
  }

  for (const row of getBodyRows(table)) {
    const key = getRowSearchKey(row, snapshot.leadingNonDataRows);
    if (!key) continue;
    state.searchIndex.set(key, getRowText(row));
  }

  return snapshot;
}

function countIndexedMatches(state: TableState, query: string): number {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return getTrackedFrontier(state);

  const terms = trimmed.split(/\s+/).filter(Boolean);
  let matches = 0;

  for (const text of state.searchIndex.values()) {
    if (terms.every(term => text.includes(term))) {
      matches += 1;
    }
  }

  return matches;
}

function getRowText(row: HTMLTableRowElement): string {
  let text = rowTextCache.get(row);
  if (text == null) {
    const clone = row.cloneNode(true) as HTMLTableRowElement;
    stripManagedMarkup(clone);
    text = (clone.textContent ?? '').toLowerCase();
    rowTextCache.set(row, text);
  }
  return text;
}

function shouldHydrateRows(
  table: HTMLTableElement,
  state: TableState,
  options?: { force?: boolean },
): boolean {
  if (tableFilterSettings.autoLoadLazyRows === false) return false;
  if (!state.isLightningGrid) return false;

  const snapshot = getTableLoadSnapshot(table);
  if (snapshot.expected != null) {
    state.cachedExpectedRowCount = snapshot.expected;
  }

  const trackedFrontier = getTrackedFrontier(state, snapshot);
  const expected = snapshot.expected ?? state.cachedExpectedRowCount;
  if (expected != null && trackedFrontier >= expected) {
    state.rowsHydrated = true;
    state.hydrationStalledFrontier = null;
    return false;
  }

  if (!options?.force && state.hydrationStalledFrontier != null && trackedFrontier <= state.hydrationStalledFrontier) {
    return false;
  }

  if (expected != null) return trackedFrontier < expected;

  return !state.rowsHydrated;
}

function clearHighlights(table: HTMLTableElement): void {
  table.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(mark => {
    const parent = mark.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
      parent.normalize();
    }
  });
}

function highlightMatches(table: HTMLTableElement, terms: string[]): void {
  if (terms.length === 0) return;

  const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');

  const rows = getBodyRows(table);
  for (const row of rows) {
    if (row.style.display === 'none') continue;
    const cells = row.querySelectorAll('td, th');
    for (const cell of cells) {
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      const textNodes: Text[] = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

      for (const node of textNodes) {
        const text = node.textContent || '';
        if (!text.trim()) continue;
        const parts = text.split(regex);
        if (parts.length <= 1) continue;

        const frag = document.createDocumentFragment();
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (!part) continue;
          if (i % 2 === 1) {
            const mark = document.createElement('mark');
            mark.className = HIGHLIGHT_CLASS;
            mark.style.cssText = `background:${tokens.color.surfaceHighlight};color:inherit;padding:0 1px;border-radius:${tokens.radius.xs};`;
            mark.textContent = part;
            frag.appendChild(mark);
          } else {
            frag.appendChild(document.createTextNode(part));
          }
        }
        node.parentNode?.replaceChild(frag, node);
      }
    }
  }
}

function showNoMatchMessage(table: HTMLTableElement): void {
  hideNoMatchMessage(table);
  const msg = document.createElement('tr');
  msg.className = NO_MATCH_CLASS;
  const cell = document.createElement('td');
  const colCount = table.querySelector('tr')?.children.length || 1;
  cell.setAttribute('colspan', String(colCount));
  cell.setAttribute('style', `
    text-align: center; padding: 24px ${tokens.space.xl}; color: ${tokens.color.textSalesforceGray};
    font-size: ${tokens.font.size.base}; font-style: italic;
  `);
  cell.textContent = 'No matches found';
  msg.appendChild(cell);
  const tbody = table.querySelector('tbody') || table;
  tbody.appendChild(msg);
}

function hideNoMatchMessage(table: HTMLTableElement): void {
  table.querySelectorAll(`.${NO_MATCH_CLASS}`).forEach(el => el.remove());
}

function resetFilterPresentation(table: HTMLTableElement): void {
  withObserverMuted(() => {
    clearHighlights(table);
    hideNoMatchMessage(table);
    getBodyRows(table).forEach(row => {
      row.style.display = '';
    });
  });
}

function applyFilterToLoadedRows(table: HTMLTableElement, query: string, countEl: HTMLElement): void {
  const trimmed = query.trim().toLowerCase();
  const terms = trimmed.split(/\s+/).filter(Boolean);
  const rows = getBodyRows(table);

  withObserverMuted(() => {
    clearHighlights(table);
    hideNoMatchMessage(table);

    let visible = 0;
    for (const row of rows) {
      if (terms.length === 0) {
        row.style.display = '';
        visible++;
        continue;
      }

      const text = getRowText(row);
      const match = terms.every(term => text.includes(term));
      row.style.display = match ? '' : 'none';
      if (match) visible++;
    }

    if (terms.length > 0 && visible === 0) {
      const state = tableStates.get(table);
      // Only show "no matches" if hydration is done or not needed
      if (!state?.hydration || state.hydration.completed) {
        showNoMatchMessage(table);
      }
    }

    highlightMatches(table, terms);
  });

  updateCount(table, countEl, trimmed);
}

// --- Silent Hydration ---

async function hydrateRowsSilently(
  table: HTMLTableElement,
  allowViewportFallback: boolean,
  expectedAtStart: number | null,
  tokenAtStart: number,
  onProgress?: (frontier: number, expected: number | null) => void,
  cachedScrollContainer?: HTMLElement | null,
  suppressMask?: boolean,
): Promise<boolean> {
  const scrollContainer = resolveScrollContainer(table, cachedScrollContainer ?? null, allowViewportFallback);
  if (!scrollContainer) return false;

  const originalScrollTop = scrollContainer.scrollTop;
  const initialSnapshot = getTableLoadSnapshot(table);
  const needsMask = !suppressMask && initialSnapshot.frontier < (expectedAtStart ?? Infinity);

  // Create visual mask to hide scroll jumps (suppressed during active filtering)
  let mask: HTMLDivElement | null = null;
  let rafId: number | null = null;

  if (needsMask) {
    mask = createHydrationMask(scrollContainer);

    // Keep mask position in sync during hydration
    const updateMask = () => {
      if (mask && mask.isConnected && scrollContainer.isConnected) {
        updateMaskPosition(mask, scrollContainer);
        rafId = requestAnimationFrame(updateMask);
      }
    };
    rafId = requestAnimationFrame(updateMask);
  }

  let lastFrontier = initialSnapshot.frontier;
  let stableBottomPasses = 0;
  let didScroll = false;

  try {
    for (let step = 0; step < HYDRATE_MAX_STEPS; step++) {
      if (tokenAtStart !== lifecycleToken || !table.isConnected) return didScroll;

      const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
      if (maxScrollTop <= 0) break;

      const nextTop = Math.min(
        scrollContainer.scrollTop + Math.max(Math.floor(scrollContainer.clientHeight * 0.9), 240),
        maxScrollTop,
      );

      if (nextTop > scrollContainer.scrollTop + 1) {
        scrollContainer.scrollTop = nextTop;
        didScroll = true;
      }

      await wait(HYDRATE_STEP_DELAY_MS);

      const snapshot = getTableLoadSnapshot(table);
      const currentFrontier = snapshot.frontier;
      const expected = snapshot.expected ?? expectedAtStart;
      if (expected != null && currentFrontier >= expected) {
        if (currentFrontier > lastFrontier) {
          onProgress?.(currentFrontier, expected);
        }
        break;
      }

      const reachedBottom = scrollContainer.scrollTop >= maxScrollTop - 2;
      if (currentFrontier > lastFrontier) {
        lastFrontier = currentFrontier;
        stableBottomPasses = 0;
        onProgress?.(currentFrontier, expected);
        continue;
      }

      stableBottomPasses = reachedBottom ? stableBottomPasses + 1 : 0;
      if (reachedBottom && stableBottomPasses >= HYDRATE_STABLE_BOTTOM_PASSES) break;
    }
  } finally {
    // Always restore scroll position and clean up mask
    if (didScroll && tokenAtStart === lifecycleToken && scrollContainer.isConnected) {
      scrollContainer.scrollTop = originalScrollTop;
      await wait(0);
    }
    if (rafId != null) cancelAnimationFrame(rafId);
    if (mask) mask.remove();
  }

  return didScroll;
}

function startHydration(
  table: HTMLTableElement,
  state: TableState,
  allowViewportFallback: boolean,
  suppressMask?: boolean,
  force?: boolean,
): Promise<void> {
  if (!shouldHydrateRows(table, state, { force })) return Promise.resolve();

  // Reuse existing hydration
  if (state.hydration && !state.hydration.completed) {
    return state.hydration.promise;
  }

  const tokenAtStart = lifecycleToken;
  const initialSnapshot = syncSearchIndex(table, state);
  const expectedAtStart = initialSnapshot.expected ?? state.cachedExpectedRowCount;
  state.hydrationStalledFrontier = null;
  state.cachedScrollContainer = resolveScrollContainer(table, state.cachedScrollContainer, allowViewportFallback);

  const onNewRows = new Set<() => void>();

  const hydrationState: HydrationState = {
    promise: Promise.resolve(), // will be replaced
    onNewRows,
    completed: false,
  };
  state.hydration = hydrationState;

  // Show progress bar
  updateProgressBar(state.progressBar, getTrackedFrontier(state, initialSnapshot), expectedAtStart);
  state.progressBar.style.opacity = '1';

  const onProgress = (frontier: number, expected: number | null) => {
    if (tokenAtStart !== lifecycleToken || !table.isConnected) return;

    const snapshot = syncSearchIndex(table, state);

    // Update progress bar
    updateProgressBar(state.progressBar, Math.max(frontier, getTrackedFrontier(state, snapshot)), expected ?? snapshot.expected);

    // Update count display
    if (state.activeQuery.trim()) {
      updateCount(table, state.countEl, state.activeQuery.trim().toLowerCase());
    } else {
      updateCount(table, state.countEl, '');
    }

    // Notify all listeners (progressive re-filter)
    for (const cb of onNewRows) {
      cb();
    }
  };

  const promise = (async () => {
    const didScroll = await hydrateRowsSilently(
      table,
      allowViewportFallback,
      expectedAtStart,
      tokenAtStart,
      onProgress,
      state.cachedScrollContainer,
      suppressMask,
    );
    if (tokenAtStart !== lifecycleToken || !table.isConnected) return;

    const snapshot = syncSearchIndex(table, state);
    const expected = snapshot.expected ?? state.cachedExpectedRowCount;
    const trackedFrontier = getTrackedFrontier(state, snapshot);
    if (expected != null) {
      state.rowsHydrated = trackedFrontier >= expected;
    } else if (didScroll) {
      state.rowsHydrated = true;
    }

    if (!state.rowsHydrated) {
      state.hydrationStalledFrontier = trackedFrontier;
    }

    hydrationState.completed = true;

    // Final progress update
    updateProgressBar(state.progressBar, trackedFrontier, expected);

    // Fade out progress bar
    setTimeout(() => {
      if (tableStates.get(table) === state) {
        state.progressBar.style.opacity = '0';
      }
    }, 600);

    // Notify listeners one last time
    for (const cb of onNewRows) {
      cb();
    }
    onNewRows.clear();
  })().finally(() => {
    const liveState = tableStates.get(table);
    if (liveState === state && liveState.hydration === hydrationState) {
      hydrationState.completed = true;
    }
  });

  hydrationState.promise = promise;
  return promise;
}

function updateProgressBar(bar: HTMLDivElement, loaded: number, expected: number | null): void {
  if (expected != null && expected > 0) {
    const pct = Math.min(100, Math.round((loaded / expected) * 100));
    bar.style.width = `${pct}%`;
  } else {
    bar.style.width = '50%';
  }
}

// --- Progressive Filtering ---

async function runFilter(table: HTMLTableElement, query: string): Promise<void> {
  const state = tableStates.get(table);
  if (!state) return;

  state.activeQuery = query;
  state.requestSeq += 1;
  const requestSeq = state.requestSeq;
  const trimmed = query.trim();
  const normalizedQuery = trimmed.toLowerCase();
  state.clearBtn.style.display = trimmed ? 'block' : 'none';
  syncSearchIndex(table, state);

  const needsHydration = Boolean(trimmed) && shouldHydrateRows(table, state);
  state.deferLiveFiltering = needsHydration && state.isLightningGrid;

  if (state.deferLiveFiltering) {
    resetFilterPresentation(table);
    updateCount(table, state.countEl, normalizedQuery);
  } else {
    applyFilterToLoadedRows(table, query, state.countEl);
  }

  // 2. If rows need loading, start hydration (no-op if already running) and register progressive callback
  if (needsHydration) {
    const hydrationPromise = startHydration(table, state, true, true);

    // Register progressive re-filter callback
    if (state.hydration && !state.hydration.completed) {
      let lastRefilterTime = Date.now();

      const progressiveRefilter = () => {
        if (state.requestSeq !== requestSeq || !table.isConnected) {
          // This query is stale — unregister
          state.hydration?.onNewRows.delete(progressiveRefilter);
          return;
        }

        // Throttle re-filtering
        const now = Date.now();
        if (now - lastRefilterTime < PROGRESSIVE_REFILTER_INTERVAL_MS) return;
        lastRefilterTime = now;

        syncSearchIndex(table, state);
        if (state.deferLiveFiltering) {
          updateCount(table, state.countEl, normalizedQuery);
        } else {
          applyFilterToLoadedRows(table, query, state.countEl);
        }
      };

      state.hydration.onNewRows.add(progressiveRefilter);
    }

    void hydrationPromise.then(() => {
      const liveState = tableStates.get(table);
      if (liveState !== state || state.requestSeq !== requestSeq || !table.isConnected) return;

      const snapshot = syncSearchIndex(table, state);
      const expected = snapshot.expected ?? state.cachedExpectedRowCount;
      const trackedFrontier = getTrackedFrontier(state, snapshot);
      const fullyLoaded = expected != null ? trackedFrontier >= expected : state.rowsHydrated;

      if (!fullyLoaded) {
        state.deferLiveFiltering = true;
        resetFilterPresentation(table);
        updateCount(table, state.countEl, normalizedQuery);
        return;
      }

      state.deferLiveFiltering = false;
      applyFilterToLoadedRows(table, query, state.countEl);
    });
  }
}

function updateCount(table: HTMLTableElement, countEl: HTMLElement, query: string): void {
  const state = tableStates.get(table);
  const rows = getBodyRows(table);
  const snapshot = getTableLoadSnapshot(table);
  const loaded = snapshot.loaded;
  const expected = snapshot.expected ?? state?.cachedExpectedRowCount ?? null;
  const isHydrating = state?.hydration && !state.hydration.completed;
  const trackedFrontier = state ? getTrackedFrontier(state, snapshot) : snapshot.frontier;
  const displayedFrontier = expected != null ? Math.min(trackedFrontier, expected) : trackedFrontier;
  const partiallyLoaded = expected != null && loaded < expected;

  if (!query) {
    if (isHydrating && expected != null) {
      countEl.textContent = `Loading ${displayedFrontier} / ${expected}...`;
    } else {
      countEl.textContent = partiallyLoaded ? `${loaded} / ${expected} loaded` : `${loaded} rows`;
    }
    return;
  }

  if (state?.deferLiveFiltering) {
    const matches = countIndexedMatches(state, query);
    if (expected != null) {
      countEl.textContent = isHydrating
        ? `${matches} matches (scanning ${displayedFrontier}/${expected}...)`
        : `${matches} matches (${displayedFrontier}/${expected} scanned)`;
    } else {
      countEl.textContent = isHydrating
        ? `${matches} matches (scanning ${displayedFrontier}...)`
        : `${matches} matches`;
    }
    return;
  }

  const visible = rows.filter(row => row.style.display !== 'none').length;
  if (isHydrating && expected != null) {
    countEl.textContent = `${visible} matches (loading ${loaded}/${expected}...)`;
  } else {
    countEl.textContent = partiallyLoaded ? `${visible} / ${loaded} loaded` : `${visible} / ${loaded}`;
  }
}

function isObjectManagerFieldsPage(): boolean {
  return OBJECT_MANAGER_FIELDS_PATTERN.test(window.location.pathname);
}

function refreshManagedTables(): void {
  document.querySelectorAll<HTMLTableElement>(`table[${DATA_ATTR}]`).forEach(table => {
    const state = tableStates.get(table);
    if (!state) return;

    syncSearchIndex(table, state);
    const isHydrating = state.hydration && !state.hydration.completed;

    if (isHydrating) {
      if (state.activeQuery.trim()) {
        if (state.deferLiveFiltering) {
          updateCount(table, state.countEl, state.activeQuery.trim().toLowerCase());
        } else {
          applyFilterToLoadedRows(table, state.activeQuery, state.countEl);
        }
      } else {
        updateCount(table, state.countEl, '');
      }
      return;
    }

    if (state.activeQuery.trim()) {
      if (state.deferLiveFiltering) {
        if (shouldHydrateRows(table, state)) {
          void runFilter(table, state.activeQuery);
        } else {
          updateCount(table, state.countEl, state.activeQuery.trim().toLowerCase());
        }
        return;
      }

      if (shouldHydrateRows(table, state)) {
        void runFilter(table, state.activeQuery);
      } else {
        state.deferLiveFiltering = false;
        applyFilterToLoadedRows(table, state.activeQuery, state.countEl);
      }
      return;
    }

    updateCount(table, state.countEl, '');
  });
}

// --- Classic Pagination Auto-Expand ---

/**
 * Auto-select the maximum "records per page" in Classic Salesforce pagination.
 * After change the page reloads; on reload the select is already at max → no-op.
 */
function autoExpandClassicPagination(): void {
  for (const select of document.querySelectorAll<HTMLSelectElement>('select')) {
    const options = Array.from(select.options);
    const nums = options.filter(o => /^\d+$/.test(o.text.trim()));
    if (nums.length < 3) continue;

    const values = nums.map(o => parseInt(o.text.trim(), 10));
    if (!values.some(v => [25, 50, 100, 200].includes(v))) continue;

    // Walk up ancestors to verify this is a pagination select
    let isPagination = false;
    let el: HTMLElement | null = select.parentElement;
    for (let i = 0; i < 4 && el; i++, el = el.parentElement) {
      const t = (el.textContent ?? '').toLowerCase();
      if (t.includes('per page') || (t.includes('display') && t.includes('records'))) {
        isPagination = true;
        break;
      }
    }
    if (!isPagination) continue;

    const maxVal = Math.max(...values);
    const maxOpt = nums.find(o => parseInt(o.text.trim(), 10) === maxVal);
    if (!maxOpt) continue;

    const maxIdx = options.indexOf(maxOpt);
    if (select.selectedIndex === maxIdx) continue;

    select.selectedIndex = maxIdx;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return; // page will reload with expanded rows
  }
}

function shouldRunOnPage(pageType: ModuleContext['pageContext']['pageType']): boolean {
  if (pageType === 'setup') return tableFilterSettings.showOnSetupPages !== false;
  if (pageType === 'list') return tableFilterSettings.showOnListViews !== false;
  return false;
}

// --- Injection ---

function injectFilter(detected: DetectedTable): void {
  const { table } = detected;
  table.setAttribute(DATA_ATTR, 'true');

  const { container, state } = createFilterUI(table);
  tableStates.set(table, state);

  const parent = table.parentElement;
  if (parent) {
    parent.insertBefore(container, table);
  }
}

function scanAndInject(): void {
  const tables = detectTables();
  tables.forEach(injectFilter);
  refreshManagedTables();
}

// --- MutationObserver ---

function startObserver(): void {
  if (observer) observer.disconnect();
  observer = new MutationObserver((mutations) => {
    if (mutedObserverMutations > 0) return;

    let shouldRescan = false;

    // Targeted cache invalidation — only invalidate rows affected by mutations
    for (const mutation of mutations) {
      if (isFilterUiNode(mutation.target)) continue;

      const target = getNodeElement(mutation.target);
      if (target) {
        const row = target.closest('tr');
        if (row instanceof HTMLTableRowElement) {
          rowTextCache.delete(row);
        }
        shouldRescan = true;
      }

      // Also invalidate for added/removed nodes
      for (const node of [...mutation.addedNodes, ...mutation.removedNodes]) {
        if (isFilterUiNode(node)) continue;

        const element = getNodeElement(node);
        if (element) {
          const row = element.closest('tr');
          if (row instanceof HTMLTableRowElement) {
            rowTextCache.delete(row);
          }
        }
        shouldRescan = true;
      }
    }

    if (shouldRescan && !scanTimer) {
      scanTimer = setTimeout(() => {
        scanTimer = null;
        scanAndInject();
      }, 500);
    }
  });

  const root = document.querySelector('.oneContent, .mainContentMark, #content') ?? document.body;
  observer.observe(root, { childList: true, subtree: true });
}

function stopObserver(): void {
  observer?.disconnect();
  observer = null;
  if (scanTimer) {
    clearTimeout(scanTimer);
    scanTimer = null;
  }
}

// --- Cleanup ---

function removeAllFilters(): void {
  lifecycleToken += 1;

  for (const t of activeDebounces) clearTimeout(t);
  activeDebounces.clear();

  rowTextCache = new WeakMap();
  tableStates = new WeakMap();

  // Remove hydration masks
  document.querySelectorAll(`.${MASK_CLASS}`).forEach(el => el.remove());

  document.querySelectorAll(`.${CONTAINER_CLASS}`).forEach(el => el.remove());
  document.querySelectorAll<HTMLTableElement>(`table[${DATA_ATTR}]`).forEach(table => {
    clearHighlights(table);
    hideNoMatchMessage(table);
    getBodyRows(table).forEach(row => { row.style.display = ''; });
    table.removeAttribute(DATA_ATTR);
  });
}

// --- Module ---

const tableFilter: SFBoostModule = {
  id: 'table-filter',
  name: 'Table Filter',
  description: 'Quick search/filter for Salesforce tables',

  async init(ctx: ModuleContext) {
    tableFilterSettings = await getModuleSettings('table-filter');
    const { pageType } = ctx.pageContext;
    initTimer = setTimeout(() => {
      if (tableFilterSettings.autoExpandClassicPagination !== false) {
        autoExpandClassicPagination();
      }
      if (shouldRunOnPage(pageType)) {
        scanAndInject();
        startObserver();
      }
    }, 1500);
  },

  async onNavigate(ctx: ModuleContext) {
    removeAllFilters();
    stopObserver();
    tableFilterSettings = await getModuleSettings('table-filter');
    if (initTimer) {
      clearTimeout(initTimer);
      initTimer = null;
    }

    const { pageType } = ctx.pageContext;
    initTimer = setTimeout(() => {
      if (tableFilterSettings.autoExpandClassicPagination !== false) {
        autoExpandClassicPagination();
      }
      if (shouldRunOnPage(pageType)) {
        scanAndInject();
        startObserver();
      }
    }, 1500);
  },

  destroy() {
    removeAllFilters();
    stopObserver();
    if (initTimer) {
      clearTimeout(initTimer);
      initTimer = null;
    }
  },
};

registry.register(tableFilter);
