import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';

const DATA_ATTR = 'data-sfboost-cs-managed';
const FILTER_CLASS = 'sfboost-cs-filter';
const COUNTER_CLASS = 'sfboost-cs-counter';

let observer: MutationObserver | null = null;
let scanTimer: ReturnType<typeof setTimeout> | null = null;
let initTimer: ReturnType<typeof setTimeout> | null = null;
let rowTextCache = new WeakMap<HTMLTableRowElement, string>();
const activeDebounces = new Set<ReturnType<typeof setTimeout>>();

// --- Page Detection ---

function isChangeSetPage(): boolean {
  const url = window.location.href;
  return (
    url.includes('changemgmt/outboundChangeSet') ||
    url.includes('changemgmt/listOutboundChangeSet') ||
    url.includes('changemgmt/addToChangeSet') ||
    url.includes('changemgmt/pickEntityType')
  );
}

function isAddComponentPage(): boolean {
  const url = window.location.href;
  return (
    url.includes('changemgmt/addToChangeSet') ||
    url.includes('changemgmt/pickEntityType')
  );
}

// --- Search UI ---

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
  circle.setAttribute('stroke', '#706e6b');
  circle.setAttribute('stroke-width', '1.5');

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', '10.5');
  line.setAttribute('y1', '10.5');
  line.setAttribute('x2', '15');
  line.setAttribute('y2', '15');
  line.setAttribute('stroke', '#706e6b');
  line.setAttribute('stroke-width', '1.5');
  line.setAttribute('stroke-linecap', 'round');

  svg.appendChild(circle);
  svg.appendChild(line);
  return svg;
}

function createFilterUI(table: HTMLTableElement): HTMLDivElement {
  const container = document.createElement('div');
  container.className = FILTER_CLASS;
  container.setAttribute('style', `
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    margin-bottom: 6px;
    background: #fff;
    border: 1px solid #d8dde6;
    border-radius: 6px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  `);

  container.appendChild(createSearchIcon());

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = isAddComponentPage() ? 'Search components...' : 'Filter Change Set components...';
  input.setAttribute('style', `
    flex: 1;
    padding: 6px 10px;
    border: 1px solid #d8dde6;
    border-radius: 4px;
    font-size: 13px;
    outline: none;
    color: #181818;
    background: #fff;
    min-width: 200px;
    transition: border-color 0.15s;
  `);
  input.addEventListener('focus', () => { input.style.borderColor = '#0176d3'; });
  input.addEventListener('blur', () => { input.style.borderColor = '#d8dde6'; });

  // Count badge
  const count = document.createElement('span');
  count.className = COUNTER_CLASS;
  count.setAttribute('style', `
    font-size: 12px;
    color: #706e6b;
    white-space: nowrap;
    user-select: none;
  `);
  updateCount(table, count, '');

  // Component type counter
  const typeCounter = document.createElement('span');
  typeCounter.setAttribute('style', `
    font-size: 11px;
    color: #9ca3af;
    white-space: nowrap;
    user-select: none;
    margin-left: 4px;
  `);
  updateTypeCounter(table, typeCounter);

  // Clear button
  const clearBtn = document.createElement('button');
  clearBtn.textContent = '\u00d7';
  clearBtn.title = 'Clear filter';
  clearBtn.setAttribute('style', `
    display: none; border: none; background: none;
    color: #706e6b; font-size: 18px; cursor: pointer;
    padding: 0 4px; line-height: 1; flex-shrink: 0;
  `);
  clearBtn.addEventListener('mouseenter', () => { clearBtn.style.color = '#181818'; });
  clearBtn.addEventListener('mouseleave', () => { clearBtn.style.color = '#706e6b'; });

  // Debounced filter
  let debounce: ReturnType<typeof setTimeout> | null = null;
  const onInput = () => {
    if (debounce) { clearTimeout(debounce); activeDebounces.delete(debounce); }
    debounce = setTimeout(() => {
      activeDebounces.delete(debounce!);
      const query = input.value;
      filterTable(table, query, count);
      clearBtn.style.display = query.trim() ? 'block' : 'none';
    }, 150);
    activeDebounces.add(debounce);
  };

  input.addEventListener('input', onInput);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      filterTable(table, '', count);
      clearBtn.style.display = 'none';
      input.blur();
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    filterTable(table, '', count);
    clearBtn.style.display = 'none';
    input.focus();
  });

  container.append(input, count, typeCounter, clearBtn);
  return container;
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

function getRowText(row: HTMLTableRowElement): string {
  let text = rowTextCache.get(row);
  if (text == null) {
    text = (row.textContent ?? '').toLowerCase();
    rowTextCache.set(row, text);
  }
  return text;
}

function filterTable(table: HTMLTableElement, query: string, countEl: HTMLElement): void {
  const trimmed = query.trim().toLowerCase();
  const terms = trimmed.split(/\s+/).filter(Boolean);
  const rows = getBodyRows(table);
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

  updateCount(table, countEl, trimmed);
}

function updateCount(table: HTMLTableElement, countEl: HTMLElement, query: string): void {
  const rows = getBodyRows(table);
  const total = rows.length;
  if (!query) {
    countEl.textContent = `${total} items`;
  } else {
    const visible = rows.filter(r => r.style.display !== 'none').length;
    countEl.textContent = `${visible} / ${total}`;
  }
}

function updateTypeCounter(table: HTMLTableElement, el: HTMLElement): void {
  const rows = getBodyRows(table);
  const types = new Map<string, number>();

  for (const row of rows) {
    // In Change Set tables, the "Type" column is typically the second cell
    const cells = row.querySelectorAll('td, th');
    if (cells.length >= 2) {
      const type = cells[1]?.textContent?.trim() || 'Unknown';
      types.set(type, (types.get(type) || 0) + 1);
    }
  }

  if (types.size > 1) {
    const parts = Array.from(types.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([type, count]) => `${count} ${type}`);
    el.textContent = parts.join(', ');
  }
}

// --- Table Detection ---

function detectTables(): HTMLTableElement[] {
  const results: HTMLTableElement[] = [];
  const selectors = [
    'table.list',
    '.pbBody table',
    '.bRelatedList table',
    'table.x-grid-with-paginator',
    'table[role="grid"]',
  ];

  const seen = new Set<HTMLTableElement>();
  for (const sel of selectors) {
    document.querySelectorAll<HTMLTableElement>(sel).forEach(table => {
      if (seen.has(table) || table.hasAttribute(DATA_ATTR)) return;
      const rows = table.querySelectorAll('tbody tr, tr');
      if (rows.length < 2) return;
      seen.add(table);
      results.push(table);
    });
  }

  // Fallback: any table with enough rows
  document.querySelectorAll<HTMLTableElement>('table').forEach(table => {
    if (seen.has(table) || table.hasAttribute(DATA_ATTR)) return;
    const rows = table.querySelectorAll('tbody tr, tr');
    if (rows.length < 3) return;
    seen.add(table);
    results.push(table);
  });

  return results;
}

function injectFilter(table: HTMLTableElement): void {
  table.setAttribute(DATA_ATTR, 'true');
  const container = createFilterUI(table);
  const parent = table.parentElement;
  if (parent) {
    parent.insertBefore(container, table);
  }
}

function scanAndInject(): void {
  const tables = detectTables();
  tables.forEach(injectFilter);
}

// --- Observer ---

function startObserver(): void {
  if (observer) return;
  observer = new MutationObserver(() => {
    rowTextCache = new WeakMap();
    if (!scanTimer) {
      scanTimer = setTimeout(() => {
        scanTimer = null;
        scanAndInject();
      }, 500);
    }
  });

  const root = document.querySelector('.oneContent, .mainContentMark, #content, .bodyDiv') ?? document.body;
  observer.observe(root, { childList: true, subtree: true });
}

function stopObserver(): void {
  observer?.disconnect();
  observer = null;
  if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
}

// --- Cleanup ---

function removeAllFilters(): void {
  for (const t of activeDebounces) clearTimeout(t);
  activeDebounces.clear();
  rowTextCache = new WeakMap();
  document.querySelectorAll(`.${FILTER_CLASS}`).forEach(el => el.remove());
  document.querySelectorAll<HTMLTableElement>(`table[${DATA_ATTR}]`).forEach(table => {
    getBodyRows(table).forEach(row => { row.style.display = ''; });
    table.removeAttribute(DATA_ATTR);
  });
}

// --- Module ---

const changeSetBuddy: SFBoostModule = {
  id: 'change-set-buddy',
  name: 'Change Set Buddy',
  description: 'Enhanced Change Set experience with search and filter',
  defaultEnabled: false,

  async init(_ctx: ModuleContext) {
    if (isChangeSetPage()) {
      initTimer = setTimeout(() => {
        scanAndInject();
        startObserver();
      }, 1000);
    }
  },

  async onNavigate(_ctx: ModuleContext) {
    removeAllFilters();
    stopObserver();
    if (initTimer) { clearTimeout(initTimer); initTimer = null; }

    if (isChangeSetPage()) {
      initTimer = setTimeout(() => {
        scanAndInject();
        startObserver();
      }, 1000);
    }
  },

  destroy() {
    removeAllFilters();
    stopObserver();
    if (initTimer) { clearTimeout(initTimer); initTimer = null; }
  },
};

registry.register(changeSetBuddy);
