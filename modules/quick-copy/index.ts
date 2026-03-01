import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';

const COPY_BTN_CLASS = 'sfboost-copy-btn';
let currentCtx: ModuleContext | null = null;

function showToast(message: string) {
  const toast = document.createElement('div');
  toast.setAttribute('style', `
    position: fixed; bottom: 20px; left: 50%;
    transform: translateX(-50%);
    background: #1a1a2e; color: #fff;
    padding: 10px 20px; border-radius: 8px;
    font-size: 13px; font-family: -apple-system, sans-serif;
    z-index: 99999999;
  `);
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

function createCopyButton(text: string, tooltip: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = COPY_BTN_CLASS;
  btn.title = tooltip;
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
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

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    navigator.clipboard.writeText(text);
    showToast(`Copied: ${text.length > 40 ? text.slice(0, 40) + '...' : text}`);
  });

  return btn;
}

function injectRecordIdCopyButton() {
  if (!currentCtx) return;
  const { recordId } = currentCtx.pageContext;
  if (!recordId) return;

  // Already injected?
  if (document.querySelector(`.${COPY_BTN_CLASS}[data-sfboost-record-id]`)) return;

  // Find the record header
  const header = document.querySelector(
    'records-lwc-highlights-panel .slds-page-header__title, ' +
    'records-highlights-details .slds-page-header__title, ' +
    '.entityNameTitle, ' +
    'h1.slds-page-header__title, ' +
    'lightning-formatted-name, ' +
    'records-entity-label'
  );

  if (header) {
    const btn = createCopyButton(recordId, `Copy Record ID: ${recordId}`);
    btn.setAttribute('data-sfboost-record-id', 'true');
    header.parentElement?.insertBefore(btn, header.nextSibling);
  }
}

function removeCopyButtons() {
  document.querySelectorAll(`.${COPY_BTN_CLASS}`).forEach((el) => el.remove());
}

const quickCopy: SFBoostModule = {
  id: 'quick-copy',
  name: 'Quick Copy',
  description: 'Copy record IDs and field values with one click',
  defaultEnabled: true,

  async init(ctx: ModuleContext) {
    currentCtx = ctx;
    if (ctx.pageContext.pageType === 'record') {
      // Wait a bit for DOM to settle in Lightning
      setTimeout(() => injectRecordIdCopyButton(), 1000);
    }
  },

  async onNavigate(ctx: ModuleContext) {
    currentCtx = ctx;
    removeCopyButtons();
    if (ctx.pageContext.pageType === 'record') {
      setTimeout(() => injectRecordIdCopyButton(), 1000);
    }
  },

  destroy() {
    removeCopyButtons();
  },
};

registry.register(quickCopy);
