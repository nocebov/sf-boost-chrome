import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';
import { sendMessage } from '../../lib/messaging';
import { showToast } from '../../lib/toast';

const BADGE_CLASS = 'sfboost-field-badge';
const TOGGLE_ID = 'sfboost-inspector-toggle';
let isActive = false;
let currentCtx: ModuleContext | null = null;

function onToggleInspector() { toggleInspector(); }

function createToggleButton() {
  const existing = document.getElementById(TOGGLE_ID);
  if (existing) return;

  const btn = document.createElement('button');
  btn.id = TOGGLE_ID;
  btn.textContent = '{ }';
  btn.title = 'Toggle Field Inspector (Alt+Shift+F)';
  btn.setAttribute('style', `
    position: fixed; bottom: 20px; right: 20px;
    width: 44px; height: 44px;
    border-radius: 50%;
    border: none;
    background: ${isActive ? '#0176d3' : '#1a1a2e'};
    color: #fff;
    font-size: 16px; font-weight: 700;
    cursor: pointer;
    z-index: 999998;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    transition: background 0.2s, transform 0.2s;
    font-family: monospace;
  `);

  btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.1)'; });
  btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });
  btn.addEventListener('click', () => toggleInspector());

  document.body.appendChild(btn);
}

async function toggleInspector() {
  isActive = !isActive;
  const btn = document.getElementById(TOGGLE_ID) as HTMLButtonElement | null;
  if (btn) {
    btn.style.background = isActive ? '#0176d3' : '#1a1a2e';
  }

  if (isActive) {
    await showFieldBadges();
  } else {
    removeFieldBadges();
  }
}

async function showFieldBadges() {
  if (!currentCtx) return;
  const { objectApiName, instanceUrl } = currentCtx.pageContext;
  if (!objectApiName) {
    showToast('No object detected on this page', 'right');
    return;
  }

  let describeData: any;
  try {
    describeData = await sendMessage('describeObject', { instanceUrl, objectApiName });
  } catch (e: any) {
    showToast(`Error: ${e.message}`, 'right');
    return;
  }

  if (!describeData?.fields) return;

  // Build label -> field info map
  const fieldMap = new Map<string, { apiName: string; type: string; required: boolean }>();
  for (const field of describeData.fields) {
    const label = (field.label as string).toLowerCase().trim();
    fieldMap.set(label, {
      apiName: field.name as string,
      type: field.type as string,
      required: !field.nillable && !field.defaultedOnCreate,
    });
  }

  // Find all field labels in the DOM.
  // Use :has() to avoid selecting outer label elements that already contain
  // a more specific inner span — prevents duplicate badges.
  const labelElements = document.querySelectorAll(
    'span.test-id__field-label, ' +
    '.slds-form-element__label:not(:has(span.test-id__field-label)), ' +
    'records-record-layout-item span[class*="label"]:not(:has(span.test-id__field-label))'
  );

  let matched = 0;
  labelElements.forEach((el) => {
    // Strip trailing *, :, and whitespace that Salesforce adds for required/formatting
    const labelText = (el.textContent ?? '').replace(/[\s*:]+$/, '').toLowerCase().trim();
    const fieldInfo = fieldMap.get(labelText);
    if (!fieldInfo) return;

    // Skip if badge already exists
    if (el.querySelector(`.${BADGE_CLASS}`)) return;

    const badge = document.createElement('span');
    badge.className = BADGE_CLASS;
    badge.setAttribute('style', `
      display: inline-block;
      margin-left: 6px;
      padding: 1px 6px;
      background: #e8f0fe;
      color: #0176d3;
      font-size: 10px;
      font-weight: 600;
      border-radius: 4px;
      font-family: monospace;
      cursor: pointer;
      vertical-align: middle;
      border: 1px solid #b8d4f0;
    `);
    badge.textContent = fieldInfo.apiName;
    badge.title = `Type: ${fieldInfo.type}${fieldInfo.required ? ' | Required' : ''}\nClick to copy`;

    badge.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(fieldInfo.apiName);
        badge.textContent = 'Copied!';
        badge.style.background = '#2ecc71';
        badge.style.color = '#fff';
      } catch {
        badge.textContent = 'Failed';
        badge.style.background = '#ef4444';
        badge.style.color = '#fff';
      }
      setTimeout(() => {
        badge.textContent = fieldInfo.apiName;
        badge.style.background = '#e8f0fe';
        badge.style.color = '#0176d3';
      }, 1000);
    });

    el.appendChild(badge);
    matched++;
  });

  showToast(`Matched ${matched} fields on ${objectApiName}`, 'right');
}

function removeFieldBadges() {
  document.querySelectorAll(`.${BADGE_CLASS}`).forEach((el) => el.remove());
}

const fieldInspector: SFBoostModule = {
  id: 'field-inspector',
  name: 'Field Inspector',
  description: 'Toggle to show API names next to field labels on record pages',
  defaultEnabled: true,

  async init(ctx: ModuleContext) {
    if (window.top !== window.self) return;
    currentCtx = ctx;
    if (ctx.pageContext.pageType === 'record') {
      createToggleButton();
    }
    document.addEventListener('sfboost:toggle-inspector', onToggleInspector);
    document.addEventListener('keydown', handleKeydown);
  },

  async onNavigate(ctx: ModuleContext) {
    if (window.top !== window.self) return;
    currentCtx = ctx;
    removeFieldBadges();
    isActive = false;

    const existingBtn = document.getElementById(TOGGLE_ID);
    if (ctx.pageContext.pageType === 'record') {
      if (!existingBtn) createToggleButton();
      const btn = document.getElementById(TOGGLE_ID) as HTMLButtonElement | null;
      if (btn) btn.style.background = '#1a1a2e';
    } else {
      existingBtn?.remove();
    }
  },

  destroy() {
    if (window.top !== window.self) return;
    removeFieldBadges();
    document.getElementById(TOGGLE_ID)?.remove();
    document.removeEventListener('sfboost:toggle-inspector', onToggleInspector);
    document.removeEventListener('keydown', handleKeydown);
    isActive = false;
  },
};

function handleKeydown(e: KeyboardEvent) {
  if (e.altKey && e.shiftKey && e.key === 'F') {
    e.preventDefault();
    toggleInspector();
  }
}

registry.register(fieldInspector);
