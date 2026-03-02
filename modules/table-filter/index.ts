import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';

const DATA_ATTR = 'data-sfboost-table-filter';
const CONTAINER_CLASS = 'sfboost-table-filter';

let observer: MutationObserver | null = null;
let scanTimer: ReturnType<typeof setTimeout> | null = null;
let initTimer: ReturnType<typeof setTimeout> | null = null;
const rowTextCache = new WeakMap<HTMLTableRowElement, string>();

// --- Table Detection ---

interface DetectedTable {
  table: HTMLTableElement;
}

function detectTables(): DetectedTable[] {
  const seen = new Set<HTMLTableElement>();
  const results: DetectedTable[] = [];

  const add = (table: HTMLTableElement) => {
    if (seen.has(table) || table.hasAttribute(DATA_ATTR)) return;
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
  container.className = CONTAINER_CLASS;
  container.setAttribute('style', `
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    margin-bottom: 4px;
    background: #fff;
    border: 1px solid #d8dde6;
    border-radius: 4px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  `);

  // Search icon
  container.appendChild(createSearchIcon());

  // Input
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Filter table...';
  input.setAttribute('style', `
    flex: 1;
    padding: 5px 8px;
    border: 1px solid #d8dde6;
    border-radius: 4px;
    font-size: 13px;
    outline: none;
    color: #181818;
    background: #fff;
    min-width: 180px;
    max-width: 320px;
    transition: border-color 0.15s;
  `);
  input.addEventListener('focus', () => { input.style.borderColor = '#0176d3'; });
  input.addEventListener('blur', () => { input.style.borderColor = '#d8dde6'; });

  // Count badge
  const count = document.createElement('span');
  count.setAttribute('style', `
    font-size: 12px;
    color: #706e6b;
    white-space: nowrap;
    user-select: none;
  `);
  updateCount(table, count, '');

  // Clear button
  const clearBtn = document.createElement('button');
  clearBtn.textContent = '\u00d7';
  clearBtn.title = 'Clear filter';
  clearBtn.setAttribute('style', `
    display: none;
    border: none;
    background: none;
    color: #706e6b;
    font-size: 18px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
    flex-shrink: 0;
  `);
  clearBtn.addEventListener('mouseenter', () => { clearBtn.style.color = '#181818'; });
  clearBtn.addEventListener('mouseleave', () => { clearBtn.style.color = '#706e6b'; });

  // Debounced filter
  let debounce: ReturnType<typeof setTimeout> | null = null;
  const onInput = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      const query = input.value;
      filterTable(table, query, count);
      clearBtn.style.display = query.trim() ? 'block' : 'none';
    }, 150);
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

  container.appendChild(input);
  container.appendChild(count);
  container.appendChild(clearBtn);
  return container;
}

// --- Filtering ---

function getBodyRows(table: HTMLTableElement): HTMLTableRowElement[] {
  // Prefer tbody rows; if no tbody, take all rows except first (header)
  const tbody = table.querySelector('tbody');
  if (tbody) {
    return Array.from(tbody.querySelectorAll<HTMLTableRowElement>(':scope > tr'));
  }
  const allRows = Array.from(table.querySelectorAll<HTMLTableRowElement>(':scope > tr'));
  return allRows.slice(1); // skip header row
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
    countEl.textContent = `${total} rows`;
  } else {
    const visible = rows.filter(r => r.style.display !== 'none').length;
    countEl.textContent = `${visible} / ${total}`;
  }
}

// --- Injection ---

function injectFilter(detected: DetectedTable): void {
  const { table } = detected;
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

// --- MutationObserver ---

function startObserver(): void {
  if (observer) return;
  observer = new MutationObserver(() => {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(scanAndInject, 500);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function stopObserver(): void {
  observer?.disconnect();
  observer = null;
  if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
}

// --- Cleanup ---

function removeAllFilters(): void {
  // Remove filter UI containers
  document.querySelectorAll(`.${CONTAINER_CLASS}`).forEach(el => el.remove());
  // Reset hidden rows
  document.querySelectorAll<HTMLTableElement>(`table[${DATA_ATTR}]`).forEach(table => {
    getBodyRows(table).forEach(row => { row.style.display = ''; });
    table.removeAttribute(DATA_ATTR);
  });
}

// --- Module ---

const tableFilter: SFBoostModule = {
  id: 'table-filter',
  name: 'Table Filter',
  description: 'Quick search/filter for Salesforce tables',
  defaultEnabled: true,

  async init(ctx: ModuleContext) {
    const { pageType } = ctx.pageContext;
    if (pageType === 'setup' || pageType === 'list') {
      initTimer = setTimeout(() => {
        scanAndInject();
        startObserver();
      }, 1500);
    }
  },

  async onNavigate(ctx: ModuleContext) {
    removeAllFilters();
    stopObserver();
    if (initTimer) { clearTimeout(initTimer); initTimer = null; }

    const { pageType } = ctx.pageContext;
    if (pageType === 'setup' || pageType === 'list') {
      initTimer = setTimeout(() => {
        scanAndInject();
        startObserver();
      }, 1500);
    }
  },

  destroy() {
    removeAllFilters();
    stopObserver();
    if (initTimer) { clearTimeout(initTimer); initTimer = null; }
  },
};

registry.register(tableFilter);
