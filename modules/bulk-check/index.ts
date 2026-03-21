import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';
import { tokens } from '../../lib/design-tokens';

const DATA_ATTR = 'data-sfboost-bulk-check';
const BTN_CLASS = 'sfboost-bulk-check-btn';

let observer: MutationObserver | null = null;
let initTimer: ReturnType<typeof setTimeout> | null = null;
let lifecycleToken = 0;

/**
 * Profile and Permission Set edit pages in Salesforce Setup contain tables
 * with checkbox columns for permissions (Read, Create, Edit, Delete, etc.).
 *
 * In Lightning Setup, these are rendered inside a same-origin Classic iframe.
 * The content script skips iframes (window.top !== window.self), so we access
 * iframe content from the main frame via iframe.contentDocument.
 */

function isSetupPage(ctx: ModuleContext): boolean {
  return ctx.pageContext.pageType === 'setup';
}

function getSetupIframeDocuments(): Document[] {
  const docs: Document[] = [document];

  // Look for Classic Setup iframes
  const iframes = document.querySelectorAll<HTMLIFrameElement>(
    'iframe[src*="/setup/"], iframe[src*="/perm"], iframe[src*="/profiles/"], ' +
    'iframe.setupcontent, iframe[name="setupFrame"], iframe[title*="Setup"]'
  );

  for (const iframe of iframes) {
    try {
      const doc = iframe.contentDocument;
      if (doc && doc.body) {
        docs.push(doc);
      }
    } catch {
      // Cross-origin — skip
    }
  }

  return docs;
}

interface CheckboxColumn {
  table: HTMLTableElement;
  colIndex: number;
  headerCell: HTMLTableCellElement;
  checkboxes: HTMLInputElement[];
}

function findCheckboxColumns(doc: Document): CheckboxColumn[] {
  const results: CheckboxColumn[] = [];
  const tables = doc.querySelectorAll<HTMLTableElement>('table');

  for (const table of tables) {
    if (table.hasAttribute(DATA_ATTR)) continue;

    const headerRow = table.querySelector('tr');
    if (!headerRow) continue;

    const headerCells = Array.from(headerRow.querySelectorAll<HTMLTableCellElement>('th, td'));
    const bodyRows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr, tr')).slice(1);

    if (bodyRows.length < 2) continue;

    for (let colIdx = 0; colIdx < headerCells.length; colIdx++) {
      const checkboxes: HTMLInputElement[] = [];

      for (const row of bodyRows) {
        const cells = row.querySelectorAll('td, th');
        const cell = cells[colIdx];
        if (!cell) continue;

        const cb = cell.querySelector<HTMLInputElement>('input[type="checkbox"]');
        if (cb) checkboxes.push(cb);
      }

      // Need at least 3 checkboxes in a column to add bulk controls
      if (checkboxes.length >= 3) {
        results.push({
          table,
          colIndex: colIdx,
          headerCell: headerCells[colIdx]!,
          checkboxes,
        });
      }
    }
  }

  return results;
}

function createBulkButton(
  label: string,
  title: string,
  onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = BTN_CLASS;
  btn.textContent = label;
  btn.title = title;
  btn.setAttribute('style', `
    display: inline-block;
    padding: 1px ${tokens.space.sm};
    border: 1px solid ${tokens.color.borderInput};
    border-radius: ${tokens.radius.xs};
    background: ${tokens.color.surfaceBase};
    color: ${tokens.color.primary};
    font-size: ${tokens.font.size.xs};
    font-family: ${tokens.font.family.sans};
    cursor: pointer;
    line-height: 1.4;
    white-space: nowrap;
    transition: background ${tokens.transition.fast}, border-color ${tokens.transition.fast};
  `);

  btn.addEventListener('mouseenter', () => {
    btn.style.background = tokens.color.surfaceSelected;
    btn.style.borderColor = tokens.color.primaryBorder;
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = tokens.color.surfaceBase;
    btn.style.borderColor = tokens.color.borderInput;
  });
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });

  return btn;
}

function setCheckboxes(checkboxes: HTMLInputElement[], checked: boolean): void {
  for (const cb of checkboxes) {
    if (cb.disabled) continue;
    if (cb.checked === checked) continue;
    cb.checked = checked;
    // Dispatch events so Salesforce's JS picks up the change
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    cb.dispatchEvent(new Event('click', { bubbles: true }));
  }
}

function injectBulkControls(column: CheckboxColumn): void {
  const { headerCell, checkboxes } = column;

  // Check if already has controls
  if (headerCell.querySelector(`.${BTN_CLASS}`)) return;

  const wrap = document.createElement('div');
  wrap.className = 'sfboost-bulk-check-wrap';
  wrap.setAttribute('style', `
    display: flex;
    gap: 2px;
    margin-top: 2px;
    justify-content: center;
  `);

  const checkAllBtn = createBulkButton(
    '✓ All',
    'Check all checkboxes in this column',
    () => setCheckboxes(checkboxes, true),
  );

  const uncheckAllBtn = createBulkButton(
    '✗ All',
    'Uncheck all checkboxes in this column',
    () => setCheckboxes(checkboxes, false),
  );

  wrap.append(checkAllBtn, uncheckAllBtn);
  headerCell.appendChild(wrap);
}

function scanAndInject(): void {
  const docs = getSetupIframeDocuments();

  for (const doc of docs) {
    const columns = findCheckboxColumns(doc);

    // Mark tables as processed
    const processedTables = new Set<HTMLTableElement>();
    for (const col of columns) {
      if (!processedTables.has(col.table)) {
        col.table.setAttribute(DATA_ATTR, 'true');
        processedTables.add(col.table);
      }
      injectBulkControls(col);
    }
  }
}

function removeAllControls(): void {
  lifecycleToken += 1;

  // Clean from main document
  document.querySelectorAll('.sfboost-bulk-check-wrap').forEach(el => el.remove());
  document.querySelectorAll<HTMLTableElement>(`table[${DATA_ATTR}]`).forEach(table => {
    table.removeAttribute(DATA_ATTR);
  });

  // Clean from iframes
  const docs = getSetupIframeDocuments();
  for (const doc of docs) {
    doc.querySelectorAll('.sfboost-bulk-check-wrap').forEach(el => el.remove());
    doc.querySelectorAll<HTMLTableElement>(`table[${DATA_ATTR}]`).forEach(table => {
      table.removeAttribute(DATA_ATTR);
    });
  }
}

function startObserver(): void {
  if (observer) observer.disconnect();

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      scanAndInject();
    }, 800);
  });

  // Observe main document
  const root = document.querySelector('.oneContent, .mainContentMark, #content') ?? document.body;
  observer.observe(root, { childList: true, subtree: true });

  // Also observe iframe load events
  document.querySelectorAll<HTMLIFrameElement>('iframe').forEach(iframe => {
    iframe.addEventListener('load', () => {
      setTimeout(scanAndInject, 500);
    });
  });
}

function stopObserver(): void {
  observer?.disconnect();
  observer = null;
}

const bulkCheck: SFBoostModule = {
  id: 'bulk-check',
  name: 'Bulk Check',
  description: 'Check All / Uncheck All for Setup tables',

  async init(ctx: ModuleContext) {
    if (!isSetupPage(ctx)) return;

    initTimer = setTimeout(() => {
      scanAndInject();
      startObserver();
    }, 2000);
  },

  async onNavigate(ctx: ModuleContext) {
    removeAllControls();
    stopObserver();
    if (initTimer) {
      clearTimeout(initTimer);
      initTimer = null;
    }

    if (!isSetupPage(ctx)) return;

    initTimer = setTimeout(() => {
      scanAndInject();
      startObserver();
    }, 2000);
  },

  destroy() {
    removeAllControls();
    stopObserver();
    if (initTimer) {
      clearTimeout(initTimer);
      initTimer = null;
    }
  },
};

registry.register(bulkCheck);
