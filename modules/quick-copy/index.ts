import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';
import { showToast } from '../../lib/toast';

const COPY_BTN_CLASS = 'sfboost-copy-btn';
let currentCtx: ModuleContext | null = null;
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
    border: 1px solid #d1d5db;
    border-radius: 4px;
    cursor: pointer;
    color: #6b7280;
    margin-left: 6px;
    vertical-align: middle;
    transition: all 0.15s;
    padding: 0;
  `);

  btn.addEventListener('mouseenter', () => {
    btn.style.background = '#e8f0fe';
    btn.style.borderColor = '#0176d3';
    btn.style.color = '#0176d3';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'transparent';
    btn.style.borderColor = '#d1d5db';
    btn.style.color = '#6b7280';
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

/** Try to inject the copy button. Returns true if the header was found. */
function injectRecordIdCopyButton(): boolean {
  if (!currentCtx) return false;
  const { recordId } = currentCtx.pageContext;
  if (!recordId) return false;

  // Already injected?
  if (document.querySelector(`.${COPY_BTN_CLASS}[data-sfboost-record-id]`)) return true;

  // Find the record header
  const header = document.querySelector(
    'records-lwc-highlights-panel .slds-page-header__title, ' +
    'records-highlights-details .slds-page-header__title, ' +
    '.entityNameTitle, ' +
    'h1.slds-page-header__title, ' +
    'lightning-formatted-name, ' +
    'records-entity-label'
  );

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
function scheduleInject(attempts = 8, delay = 400) {
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

const quickCopy: SFBoostModule = {
  id: 'quick-copy',
  name: 'Quick Copy',
  description: 'Copy record IDs and field values with one click',

  async init(ctx: ModuleContext) {
    if (window.top !== window.self) return;
    currentCtx = ctx;
    if (ctx.pageContext.pageType === 'record') {
      scheduleInject();
    }
  },

  async onNavigate(ctx: ModuleContext) {
    if (window.top !== window.self) return;
    currentCtx = ctx;
    cancelRetry();
    removeCopyButtons();
    if (ctx.pageContext.pageType === 'record') {
      scheduleInject();
    }
  },

  destroy() {
    if (window.top !== window.self) return;
    cancelRetry();
    removeCopyButtons();
  },
};

registry.register(quickCopy);
