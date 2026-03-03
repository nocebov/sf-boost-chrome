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
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', '#888');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('style', 'flex-shrink: 0; margin-right: 2px;');

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '11');
  circle.setAttribute('cy', '11');
  circle.setAttribute('r', '8');

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', '21');
  line.setAttribute('y1', '21');
  line.setAttribute('x2', '16.65');
  line.setAttribute('y2', '16.65');

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
    gap: 10px;
    padding: 8px 16px;
    margin: 12px 0;
    background: #ffffff;
    border: 1px solid #e2e2e2;
    border-radius: 24px;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    transition: all 0.2s ease;
  `);
  container.addEventListener('mouseenter', () => { container.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; container.style.borderColor = '#d0d0d0'; });
  container.addEventListener('mouseleave', () => { container.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'; container.style.borderColor = '#e2e2e2'; });

  container.appendChild(createSearchIcon());

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = isAddComponentPage() ? 'Search components...' : 'Filter Change Set components...';
  input.setAttribute('style', `
    flex: 1;
    border: none;
    font-size: 14px;
    outline: none;
    background: transparent;
    color: #333;
    padding: 6px 0;
    min-width: 200px;
  `);

  // Component type counter (placed before count for visual hierarchy)
  const typeCounter = document.createElement('span');
  typeCounter.setAttribute('style', `
    font-size: 12px;
    font-weight: 500;
    color: #4f46e5;
    white-space: nowrap;
    user-select: none;
    background: #eef2ff;
    padding: 4px 10px;
    border-radius: 12px;
    border: 1px solid #e0e7ff;
  `);
  updateTypeCounter(table, typeCounter);

  // Count badge
  const count = document.createElement('span');
  count.className = COUNTER_CLASS;
  count.setAttribute('style', `
    font-size: 12px;
    font-weight: 600;
    color: #555;
    white-space: nowrap;
    user-select: none;
    background: #f3f4f6;
    padding: 4px 10px;
    border-radius: 12px;
  `);
  updateCount(table, count, '');

  // Clear button
  const clearBtn = document.createElement('button');
  clearBtn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style="display:block">
      <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
  `;
  clearBtn.title = 'Clear filter';
  clearBtn.setAttribute('style', `
    display: none; border: none; background: #f3f4f6;
    color: #9ca3af; cursor: pointer;
    padding: 6px; flex-shrink: 0;
    border-radius: 50%;
    align-items: center; justify-content: center;
    transition: all 0.15s ease;
    height: 24px; width: 24px;
  `);
  clearBtn.addEventListener('mouseenter', () => { clearBtn.style.background = '#e5e7eb'; clearBtn.style.color = '#4b5563'; });
  clearBtn.addEventListener('mouseleave', () => { clearBtn.style.background = '#f3f4f6'; clearBtn.style.color = '#9ca3af'; });

  // Debounced filter
  let debounce: ReturnType<typeof setTimeout> | null = null;
  const onInput = () => {
    if (debounce) { clearTimeout(debounce); activeDebounces.delete(debounce); }
    debounce = setTimeout(() => {
      activeDebounces.delete(debounce!);
      const query = input.value;
      filterTable(table, query, count);
      clearBtn.style.display = query.trim() ? 'flex' : 'none';
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

  container.append(input, typeCounter, count, clearBtn);
  return container;
}

// --- Filtering ---

function getBodyRows(table: HTMLTableElement): HTMLTableRowElement[] {
  const dataRows = Array.from(table.querySelectorAll<HTMLTableRowElement>(':scope > tbody > tr.dataRow, :scope > tr.dataRow'));
  if (dataRows.length > 0) return dataRows;

  const allRows = Array.from(table.querySelectorAll<HTMLTableRowElement>(':scope > tbody > tr, :scope > tr'));
  return allRows.filter(r => !r.classList.contains('headerRow') && !r.querySelector('th'));
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

  if (types.size > 1 && types.size <= Math.max(3, rows.length / 2)) {
    const parts = Array.from(types.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, count]) => `${count} ${type}`);
    el.textContent = parts.join(', ');
    el.style.display = '';
  } else {
    el.textContent = '';
    el.style.display = 'none';
  }
}

// --- Table Detection ---

function detectTables(): HTMLTableElement[] {
  const results: HTMLTableElement[] = [];
  const selectors = [
    'table.list',
    '.pbBody > table',
    '.bRelatedList table',
    'table.x-grid-with-paginator',
    'table[role="grid"]',
  ];

  const seen = new Set<HTMLTableElement>();
  for (const sel of selectors) {
    document.querySelectorAll<HTMLTableElement>(sel).forEach(table => {
      if (seen.has(table) || table.hasAttribute(DATA_ATTR)) return;
      const rows = getBodyRows(table);
      if (rows.length < 2) return;
      seen.add(table);
      results.push(table);
    });
  }

  // Fallback: any table with enough rows, ignoring layout tables
  document.querySelectorAll<HTMLTableElement>('table').forEach(table => {
    if (seen.has(table) || table.hasAttribute(DATA_ATTR)) return;
    const rows = getBodyRows(table);
    if (rows.length < 3) return;
    const hasHeaders = !!table.querySelector('tr.headerRow, th');
    if (!hasHeaders) return;
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
