import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';
import { tokens } from '../../lib/design-tokens';

const DATA_ATTR = 'data-sfboost-table-filter';
const CONTAINER_CLASS = 'sfboost-table-filter';
const HIGHLIGHT_CLASS = 'sfboost-tf-highlight';
const NO_MATCH_CLASS = 'sfboost-tf-no-match';
const AUTO_HYDRATE_MAX_ROWS = 200;
const OBJECT_MANAGER_FIELDS_PATTERN = /\/lightning\/setup\/ObjectManager\/\w+\/FieldsAndRelationships\/view/i;
const HYDRATE_STEP_DELAY_MS = 120;
const HYDRATE_MAX_STEPS = 60;
const SCROLLABLE_OVERFLOWS = new Set(['auto', 'overlay', 'scroll']);

let observer: MutationObserver | null = null;
let scanTimer: ReturnType<typeof setTimeout> | null = null;
let initTimer: ReturnType<typeof setTimeout> | null = null;
let rowTextCache = new WeakMap<HTMLTableRowElement, string>();
let tableStates = new WeakMap<HTMLTableElement, TableState>();
let lifecycleToken = 0;
const activeDebounces = new Set<ReturnType<typeof setTimeout>>();

// --- Table Detection ---

interface DetectedTable {
  table: HTMLTableElement;
}

interface TableState {
  activeQuery: string;
  clearBtn: HTMLButtonElement;
  countEl: HTMLSpanElement;
  inputEl: HTMLInputElement;
  preloadPromise: Promise<void> | null;
  requestSeq: number;
  rowsHydrated: boolean;
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

  const state: TableState = {
    activeQuery: '',
    clearBtn,
    countEl: count,
    inputEl: input,
    preloadPromise: null,
    requestSeq: 0,
    rowsHydrated: false,
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

  // "Load All" button for lazy-loaded tables (e.g., Object Manager fields)
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

        void ensureRowsLoaded(table, state, true).then(() => {
          const liveState = tableStates.get(table);
          if (liveState !== state || !table.isConnected) return;
          loadAllBtn.textContent = 'All loaded';
          loadAllBtn.style.color = tokens.color.success;
          loadAllBtn.style.borderColor = tokens.color.success;
          updateCount(table, count, state.activeQuery);

          if (state.activeQuery.trim()) {
            applyFilterToLoadedRows(table, state.activeQuery, count);
          }
        });
      });
      container.appendChild(loadAllBtn);
    }
  }

  updateCount(table, count, '');

  return { container, state };
}

// --- Filtering ---

function getBodyRows(table: HTMLTableElement): HTMLTableRowElement[] {
  const tbody = table.querySelector('tbody');
  if (tbody) {
    return Array.from(tbody.querySelectorAll<HTMLTableRowElement>(':scope > tr'));
  }

  const allRows = Array.from(table.querySelectorAll<HTMLTableRowElement>(':scope > tr'));
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

function getRowText(row: HTMLTableRowElement): string {
  let text = rowTextCache.get(row);
  if (text == null) {
    const clone = row.cloneNode(true) as HTMLTableRowElement;
    clone.querySelectorAll('[class*="sfboost-"]').forEach(el => el.remove());
    text = (clone.textContent ?? '').toLowerCase();
    rowTextCache.set(row, text);
  }
  return text;
}

function shouldHydrateRows(table: HTMLTableElement, state: TableState): boolean {
  if (!isLightningGridTable(table)) return false;

  const expected = getExpectedRowCount(table);
  const loaded = getBodyRows(table).length;
  if (expected != null) return loaded < expected;

  return !state.rowsHydrated;
}

function updateLoadingCount(table: HTMLTableElement, countEl: HTMLElement): void {
  const loaded = getBodyRows(table).length;
  const expected = getExpectedRowCount(table);
  countEl.textContent = expected != null
    ? `Loading ${loaded} / ${expected}...`
    : `Loading ${loaded} rows...`;
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

function applyFilterToLoadedRows(table: HTMLTableElement, query: string, countEl: HTMLElement): void {
  const trimmed = query.trim().toLowerCase();
  const terms = trimmed.split(/\s+/).filter(Boolean);
  const rows = getBodyRows(table);

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
    showNoMatchMessage(table);
  }

  highlightMatches(table, terms);
  updateCount(table, countEl, trimmed);
}

async function hydrateRows(
  table: HTMLTableElement,
  allowViewportFallback: boolean,
  expectedAtStart: number | null,
  tokenAtStart: number,
): Promise<boolean> {
  const scrollContainer = getScrollableAncestor(table, allowViewportFallback);
  if (!scrollContainer) return false;

  const originalScrollTop = scrollContainer.scrollTop;
  let lastCount = getBodyRows(table).length;
  let stableBottomPasses = 0;
  let didScroll = false;

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

    const currentCount = getBodyRows(table).length;
    const expected = getExpectedRowCount(table) ?? expectedAtStart;
    if (expected != null && currentCount >= expected) break;

    const reachedBottom = scrollContainer.scrollTop >= maxScrollTop - 2;
    if (currentCount > lastCount) {
      lastCount = currentCount;
      stableBottomPasses = 0;
      continue;
    }

    stableBottomPasses = reachedBottom ? stableBottomPasses + 1 : 0;
    if (reachedBottom && stableBottomPasses >= 2) break;
  }

  if (didScroll && tokenAtStart === lifecycleToken && scrollContainer.isConnected) {
    scrollContainer.scrollTop = originalScrollTop;
    await wait(0);
  }

  return didScroll;
}

async function ensureRowsLoaded(
  table: HTMLTableElement,
  state: TableState,
  allowViewportFallback: boolean,
): Promise<void> {
  if (!shouldHydrateRows(table, state)) return;

  if (state.preloadPromise) {
    await state.preloadPromise;
    return;
  }

  const tokenAtStart = lifecycleToken;
  const expectedAtStart = getExpectedRowCount(table);
  state.preloadPromise = (async () => {
    const didScroll = await hydrateRows(table, allowViewportFallback, expectedAtStart, tokenAtStart);
    if (tokenAtStart !== lifecycleToken || !table.isConnected) return;

    const expected = getExpectedRowCount(table);
    const loaded = getBodyRows(table).length;
    if (expected != null) {
      state.rowsHydrated = loaded >= expected;
    } else if (didScroll) {
      state.rowsHydrated = true;
    }
  })().finally(() => {
    const liveState = tableStates.get(table);
    if (liveState === state) {
      liveState.preloadPromise = null;
    }
  });

  await state.preloadPromise;
}

async function runFilter(table: HTMLTableElement, query: string): Promise<void> {
  const state = tableStates.get(table);
  if (!state) return;

  state.activeQuery = query;
  state.requestSeq += 1;
  const requestSeq = state.requestSeq;
  const trimmed = query.trim();
  state.clearBtn.style.display = trimmed ? 'block' : 'none';

  if (trimmed && shouldHydrateRows(table, state)) {
    updateLoadingCount(table, state.countEl);
    await ensureRowsLoaded(table, state, true);
  }

  if (!table.isConnected) return;
  const liveState = tableStates.get(table);
  if (liveState !== state || state.requestSeq !== requestSeq) return;

  applyFilterToLoadedRows(table, query, state.countEl);
}

function updateCount(table: HTMLTableElement, countEl: HTMLElement, query: string): void {
  const rows = getBodyRows(table);
  const loaded = rows.length;
  const expected = getExpectedRowCount(table);
  const partiallyLoaded = expected != null && loaded < expected;

  if (!query) {
    countEl.textContent = partiallyLoaded ? `${loaded} / ${expected} loaded` : `${loaded} rows`;
    return;
  }

  const visible = rows.filter(row => row.style.display !== 'none').length;
  countEl.textContent = partiallyLoaded ? `${visible} / ${loaded} loaded` : `${visible} / ${loaded}`;
}

function isObjectManagerFieldsPage(): boolean {
  return OBJECT_MANAGER_FIELDS_PATTERN.test(window.location.pathname);
}

function maybeWarmupTable(table: HTMLTableElement): void {
  const state = tableStates.get(table);
  if (!state || state.preloadPromise || state.activeQuery.trim()) return;
  if (!isLightningGridTable(table)) return;

  const expected = getExpectedRowCount(table);
  // On Object Manager fields pages, auto-hydrate up to 500 rows
  const autoHydrateLimit = isObjectManagerFieldsPage() ? 500 : AUTO_HYDRATE_MAX_ROWS;
  if (expected == null || expected > autoHydrateLimit) return;
  if (getBodyRows(table).length >= expected) {
    state.rowsHydrated = true;
    return;
  }

  if (!getScrollableAncestor(table, false)) return;

  void ensureRowsLoaded(table, state, false).then(() => {
    const liveState = tableStates.get(table);
    if (liveState !== state || !table.isConnected) return;

    if (state.activeQuery.trim()) {
      void runFilter(table, state.activeQuery);
      return;
    }

    updateCount(table, state.countEl, '');
  });
}

function refreshManagedTables(): void {
  document.querySelectorAll<HTMLTableElement>(`table[${DATA_ATTR}]`).forEach(table => {
    const state = tableStates.get(table);
    if (!state) return;

    if (state.preloadPromise) {
      if (state.activeQuery.trim()) {
        updateLoadingCount(table, state.countEl);
      } else {
        updateCount(table, state.countEl, '');
      }
      return;
    }

    if (state.activeQuery.trim()) {
      if (shouldHydrateRows(table, state)) {
        void runFilter(table, state.activeQuery);
      } else {
        applyFilterToLoadedRows(table, state.activeQuery, state.countEl);
      }
      return;
    }

    updateCount(table, state.countEl, '');
    maybeWarmupTable(table);
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

  maybeWarmupTable(table);
}

function scanAndInject(): void {
  const tables = detectTables();
  tables.forEach(injectFilter);
  refreshManagedTables();
}

// --- MutationObserver ---

function startObserver(): void {
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => {
    rowTextCache = new WeakMap();
    if (!scanTimer) {
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
    const { pageType } = ctx.pageContext;
    initTimer = setTimeout(() => {
      autoExpandClassicPagination();
      if (pageType === 'setup' || pageType === 'list') {
        scanAndInject();
        startObserver();
      }
    }, 1500);
  },

  async onNavigate(ctx: ModuleContext) {
    removeAllFilters();
    stopObserver();
    if (initTimer) {
      clearTimeout(initTimer);
      initTimer = null;
    }

    const { pageType } = ctx.pageContext;
    initTimer = setTimeout(() => {
      autoExpandClassicPagination();
      if (pageType === 'setup' || pageType === 'list') {
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
