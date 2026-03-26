import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';
import { tokens } from '../../lib/design-tokens';

const DATA_ATTR = 'data-sfboost-bulk-check';
const MASTER_CLASS = 'sfboost-bulk-master';
const COUNTER_CLASS = 'sfboost-bulk-counter';
const WRAP_CLASS = 'sfboost-bulk-check-wrap';

let observer: MutationObserver | null = null;
let observerDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let initTimer: ReturnType<typeof setTimeout> | null = null;
const controlCleanups = new Set<() => void>();
const iframeLoadCleanups = new Set<() => void>();
const pendingScanTimers = new Set<ReturnType<typeof setTimeout>>();

function isSetupPage(ctx: ModuleContext): boolean {
  return ctx.pageContext.pageType === 'setup';
}

function addManagedListener(
  target: EventTarget,
  type: string,
  listener: EventListenerOrEventListenerObject,
): () => void {
  target.addEventListener(type, listener);
  return () => target.removeEventListener(type, listener);
}

function registerControlCleanup(cleanup: () => void): void {
  controlCleanups.add(cleanup);
}

function runControlCleanups(): void {
  for (const cleanup of Array.from(controlCleanups)) {
    controlCleanups.delete(cleanup);
    try {
      cleanup();
    } catch {
      // Best-effort cleanup only.
    }
  }
}

function clearIframeLoadCleanups(): void {
  for (const cleanup of Array.from(iframeLoadCleanups)) {
    iframeLoadCleanups.delete(cleanup);
    try {
      cleanup();
    } catch {
      // Best-effort cleanup only.
    }
  }
}

function scheduleDeferredScan(delayMs = 500): void {
  const timer = setTimeout(() => {
    pendingScanTimers.delete(timer);
    scanAndInject();
  }, delayMs);
  pendingScanTimers.add(timer);
}

function clearPendingScanTimers(): void {
  for (const timer of pendingScanTimers) {
    clearTimeout(timer);
  }
  pendingScanTimers.clear();
}

function getTargetDocuments(): Document[] {
  const docs: Document[] = [document];
  const iframes = document.querySelectorAll<HTMLIFrameElement>(
    'iframe[src*="/setup/"], iframe[src*="/perm"], iframe[src*="/profiles/"], ' +
    'iframe.setupcontent, iframe[name="setupFrame"], iframe[title*="Setup"]',
  );

  for (const iframe of iframes) {
    try {
      const doc = iframe.contentDocument;
      if (doc?.body && !docs.includes(doc)) docs.push(doc);
    } catch {
      // Cross-origin iframe: ignored in the top frame.
    }
  }

  return docs;
}

function getDirectRows(table: HTMLTableElement): HTMLTableRowElement[] {
  const container = table.tBodies[0] ?? table;
  return Array.from(container.children).filter(
    (el): el is HTMLTableRowElement => el.tagName === 'TR',
  );
}

function getDirectCells(row: HTMLTableRowElement): HTMLTableCellElement[] {
  return Array.from(row.children).filter(
    (el): el is HTMLTableCellElement => el.tagName === 'TD' || el.tagName === 'TH',
  );
}

interface CheckboxColumn {
  table: HTMLTableElement;
  headerEl: HTMLElement;
  checkboxes: HTMLInputElement[];
}

function findCheckboxColumns(doc: Document): CheckboxColumn[] {
  const results: CheckboxColumn[] = [];
  const allTables = doc.querySelectorAll<HTMLTableElement>('table');

  for (const table of allTables) {
    if (table.hasAttribute(DATA_ATTR)) continue;
    if (table.parentElement?.closest('table')) continue;

    const directRows = getDirectRows(table);
    if (directRows.length < 3) continue;

    const firstRow = directRows[0];
    if (!firstRow) continue;
    const firstRowCells = getDirectCells(firstRow);

    for (let col = 0; col < firstRowCells.length; col += 1) {
      const cellsAtCol: HTMLTableCellElement[] = [];
      for (const row of directRows) {
        const cells = getDirectCells(row);
        const cell = cells[col];
        if (cell) cellsAtCol.push(cell);
      }

      const nestedPairs: Array<{ cell: HTMLTableCellElement; nested: HTMLTableElement }> = [];
      for (const cell of cellsAtCol) {
        const nested = Array.from(cell.children).find(
          (el): el is HTMLTableElement => el.tagName === 'TABLE',
        );
        if (nested) nestedPairs.push({ cell, nested });
      }

      if (nestedPairs.length >= 2) {
        processNestedColumn(table, nestedPairs, cellsAtCol, results);
      } else {
        processSimpleColumn(table, cellsAtCol, results);
      }
    }
  }

  return results;
}

function processNestedColumn(
  outerTable: HTMLTableElement,
  nestedPairs: Array<{ cell: HTMLTableCellElement; nested: HTMLTableElement }>,
  cellsAtCol: HTMLTableCellElement[],
  results: CheckboxColumn[],
): void {
  const firstPair = nestedPairs[0];
  if (!firstPair) return;

  const firstNestedRow = firstPair.nested.querySelector('tr');
  if (!(firstNestedRow instanceof HTMLTableRowElement)) return;

  const innerHeaderCells = getDirectCells(firstNestedRow);

  for (let innerCol = 0; innerCol < innerHeaderCells.length; innerCol += 1) {
    const innerCell = innerHeaderCells[innerCol];
    if (!innerCell) continue;

    const isHeaderTh = innerCell.tagName === 'TH';
    const startIdx = isHeaderTh ? 1 : 0;
    const checkboxes: HTMLInputElement[] = [];

    for (let index = startIdx; index < nestedPairs.length; index += 1) {
      const pair = nestedPairs[index];
      if (!pair) continue;

      const row = pair.nested.querySelector('tr');
      if (!(row instanceof HTMLTableRowElement)) continue;

      const cells = getDirectCells(row);
      const targetCell = cells[innerCol];
      if (!targetCell) continue;

      const checkbox = targetCell.querySelector<HTMLInputElement>(
        `input[type="checkbox"]:not(.${MASTER_CLASS})`,
      );
      if (checkbox) checkboxes.push(checkbox);
    }

    if (checkboxes.length < 2) continue;

    const firstOuterCell = cellsAtCol[0];
    if (!firstOuterCell && !isHeaderTh) continue;

    results.push({
      table: outerTable,
      headerEl: isHeaderTh ? innerCell : firstOuterCell!,
      checkboxes,
    });
  }
}

function processSimpleColumn(
  table: HTMLTableElement,
  cellsAtCol: HTMLTableCellElement[],
  results: CheckboxColumn[],
): void {
  if (cellsAtCol.length < 3) return;

  const headerCell = cellsAtCol[0];
  if (!headerCell) return;

  const checkboxes: HTMLInputElement[] = [];
  for (let index = 1; index < cellsAtCol.length; index += 1) {
    const cell = cellsAtCol[index];
    if (!cell) continue;

    const checkbox = cell.querySelector<HTMLInputElement>(
      `input[type="checkbox"]:not(.${MASTER_CLASS})`,
    );
    if (checkbox) checkboxes.push(checkbox);
  }

  if (checkboxes.length < 2) return;

  results.push({ table, headerEl: headerCell, checkboxes });
}

function countState(checkboxes: HTMLInputElement[]): { checked: number; total: number } {
  let checked = 0;
  let total = 0;

  for (const checkbox of checkboxes) {
    if (checkbox.disabled) continue;
    total += 1;
    if (checkbox.checked) checked += 1;
  }

  return { checked, total };
}

function syncMaster(
  master: HTMLInputElement,
  counter: HTMLSpanElement,
  checkboxes: HTMLInputElement[],
): void {
  const { checked, total } = countState(checkboxes);

  if (total === 0) {
    master.checked = false;
    master.indeterminate = false;
    master.disabled = true;
    counter.textContent = '';
    return;
  }

  master.disabled = false;
  if (checked === 0) {
    master.checked = false;
    master.indeterminate = false;
  } else if (checked === total) {
    master.checked = true;
    master.indeterminate = false;
  } else {
    master.checked = false;
    master.indeterminate = true;
  }

  counter.textContent = `${checked}/${total}`;

  if (checked === total) {
    counter.style.color = tokens.color.success;
  } else if (checked === 0) {
    counter.style.color = tokens.color.textMuted;
  } else {
    counter.style.color = tokens.color.primary;
  }
}

function setCheckboxes(checkboxes: HTMLInputElement[], checked: boolean): void {
  for (const checkbox of checkboxes) {
    if (checkbox.disabled || checkbox.checked === checked) continue;
    checkbox.checked = checked;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    checkbox.dispatchEvent(new Event('click', { bubbles: true }));
  }
}

function injectMasterCheckbox(column: CheckboxColumn): void {
  const { headerEl, checkboxes } = column;
  if (headerEl.querySelector(`.${MASTER_CLASS}`)) return;

  const ownerDocument = headerEl.ownerDocument ?? document;
  const view = ownerDocument.defaultView;
  const wrap = ownerDocument.createElement('div');
  wrap.className = WRAP_CLASS;
  Object.assign(wrap.style, {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '1px 6px 1px 4px',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, #e8f4fd 0%, #dbeafe 100%)',
    border: `1px solid ${tokens.color.primaryBorder}`,
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    boxShadow: '0 1px 2px rgba(1,118,211,0.10)',
    transition: `all ${tokens.transition.fast}`,
    lineHeight: '1',
    verticalAlign: 'middle',
    marginLeft: '4px',
  });

  const master = ownerDocument.createElement('input');
  master.type = 'checkbox';
  master.className = MASTER_CLASS;
  master.title = 'Toggle all checkboxes in this column';
  Object.assign(master.style, {
    cursor: 'pointer',
    width: '12px',
    height: '12px',
    margin: '0',
    accentColor: tokens.color.primary,
    flexShrink: '0',
  });

  const counter = ownerDocument.createElement('span');
  counter.className = COUNTER_CLASS;
  Object.assign(counter.style, {
    fontSize: '10px',
    fontFamily: tokens.font.family.mono,
    fontWeight: String(tokens.font.weight.semibold),
    lineHeight: '1',
    minWidth: '16px',
    letterSpacing: '-0.3px',
  });

  syncMaster(master, counter, checkboxes);

  const cleanupFns: Array<() => void> = [];
  cleanupFns.push(
    addManagedListener(master, 'change', (event) => {
      event.stopPropagation();
      setCheckboxes(checkboxes, master.checked);
      syncMaster(master, counter, checkboxes);
    }),
  );
  cleanupFns.push(
    addManagedListener(wrap, 'click', (event) => {
      if (event.target === master) return;
      event.preventDefault();
      event.stopPropagation();

      const { checked, total } = countState(checkboxes);
      const shouldCheck = checked < total;
      master.checked = shouldCheck;
      setCheckboxes(checkboxes, shouldCheck);
      syncMaster(master, counter, checkboxes);
    }),
  );
  cleanupFns.push(
    addManagedListener(wrap, 'mouseenter', () => {
      wrap.style.borderColor = tokens.color.primary;
      wrap.style.boxShadow = '0 1px 4px rgba(1,118,211,0.22)';
      wrap.style.background = 'linear-gradient(135deg, #dbeafe 0%, #c7d8f7 100%)';
    }),
  );
  cleanupFns.push(
    addManagedListener(wrap, 'mouseleave', () => {
      wrap.style.borderColor = tokens.color.primaryBorder;
      wrap.style.boxShadow = '0 1px 2px rgba(1,118,211,0.10)';
      wrap.style.background = 'linear-gradient(135deg, #e8f4fd 0%, #dbeafe 100%)';
    }),
  );

  for (const checkbox of checkboxes) {
    cleanupFns.push(
      addManagedListener(checkbox, 'change', () => {
        syncMaster(master, counter, checkboxes);
      }),
    );
    cleanupFns.push(
      addManagedListener(checkbox, 'click', () => {
        if (view?.requestAnimationFrame) {
          view.requestAnimationFrame(() => syncMaster(master, counter, checkboxes));
        } else {
          syncMaster(master, counter, checkboxes);
        }
      }),
    );
  }

  wrap.append(master, counter);

  const existingCheckbox = headerEl.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (existingCheckbox && existingCheckbox !== master) {
    existingCheckbox.insertAdjacentElement('afterend', wrap);
  } else {
    headerEl.appendChild(wrap);
  }

  registerControlCleanup(() => {
    for (const cleanup of cleanupFns.splice(0).reverse()) {
      cleanup();
    }
    wrap.remove();
  });
}

function scanAndInject(): void {
  const docs = getTargetDocuments();

  for (const doc of docs) {
    const columns = findCheckboxColumns(doc);
    const processedTables = new Set<HTMLTableElement>();

    for (const column of columns) {
      if (!processedTables.has(column.table)) {
        column.table.setAttribute(DATA_ATTR, 'true');
        processedTables.add(column.table);
      }
      injectMasterCheckbox(column);
    }
  }
}

function removeAllControls(): void {
  runControlCleanups();

  for (const doc of getTargetDocuments()) {
    doc.querySelectorAll(`.${WRAP_CLASS}`).forEach((el) => el.remove());
    doc.querySelectorAll<HTMLTableElement>(`table[${DATA_ATTR}]`).forEach((table) => {
      table.removeAttribute(DATA_ATTR);
    });
  }
}

function startObserver(): void {
  stopObserver();

  observer = new MutationObserver(() => {
    if (observerDebounceTimer) clearTimeout(observerDebounceTimer);
    observerDebounceTimer = setTimeout(() => {
      observerDebounceTimer = null;
      scanAndInject();
    }, 800);
  });

  const root = document.querySelector('.oneContent, .mainContentMark, #content') ?? document.body;
  observer.observe(root, { childList: true, subtree: true });

  document.querySelectorAll<HTMLIFrameElement>('iframe').forEach((iframe) => {
    const onLoad = () => scheduleDeferredScan(500);
    iframe.addEventListener('load', onLoad);
    iframeLoadCleanups.add(() => iframe.removeEventListener('load', onLoad));
  });
}

function stopObserver(): void {
  observer?.disconnect();
  observer = null;

  if (observerDebounceTimer) {
    clearTimeout(observerDebounceTimer);
    observerDebounceTimer = null;
  }

  clearIframeLoadCleanups();
  clearPendingScanTimers();
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
