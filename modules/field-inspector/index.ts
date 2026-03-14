import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';
import { sendMessage } from '../../lib/messaging';
import { showToast } from '../../lib/toast';
import { tokens } from '../../lib/design-tokens';

const BADGE_CLASS = 'sfboost-field-badge';
const TOGGLE_ID = 'sfboost-inspector-toggle';
let isActive = false;
let currentCtx: ModuleContext | null = null;

function isShortcutEditableTarget(target: EventTarget | null): boolean {
  const el = target instanceof HTMLElement ? target : null;
  if (!el) return false;
  if (el.closest(`#${TOGGLE_ID}`)) return false;
  return el.isContentEditable || !!el.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]');
}

function onToggleInspector() { toggleInspector(); }

function createToggleButton() {
  const existing = document.getElementById(TOGGLE_ID);
  if (existing) return;

  const btn = document.createElement('button');
  btn.id = TOGGLE_ID;
  btn.textContent = '{ }';
  btn.title = 'Toggle Field Inspector (Alt+Shift+F)';
  btn.setAttribute('style', `
    position: fixed; bottom: ${tokens.space['2xl']}; right: ${tokens.space['2xl']};
    width: 44px; height: 44px;
    border-radius: ${tokens.radius.full};
    border: none;
    background: ${isActive ? tokens.color.primary : tokens.color.surfaceDark};
    color: ${tokens.color.textOnPrimary};
    font-size: ${tokens.font.size.lg}; font-weight: ${tokens.font.weight.bold};
    cursor: pointer;
    z-index: ${tokens.zIndex.fab};
    box-shadow: ${tokens.shadow.md};
    transition: background ${tokens.transition.slow}, transform ${tokens.transition.slow};
    font-family: ${tokens.font.family.mono};
  `);

  btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.1)'; });
  btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });
  btn.addEventListener('click', () => toggleInspector());

  document.body.appendChild(btn);
}

async function toggleInspector() {
  if (!isActive && (!currentCtx || currentCtx.pageContext.pageType !== 'record' || !currentCtx.pageContext.objectApiName)) {
    showToast('Field Inspector works only on record pages', 'right');
    return;
  }

  isActive = !isActive;
  const btn = document.getElementById(TOGGLE_ID) as HTMLButtonElement | null;
  if (btn) {
    btn.style.background = isActive ? tokens.color.primary : tokens.color.surfaceDark;
  }

  if (isActive) {
    const applied = await showFieldBadges();
    if (!applied) {
      isActive = false;
      if (btn) btn.style.background = tokens.color.surfaceDark;
    }
  } else {
    removeFieldBadges();
  }
}

async function showFieldBadges(): Promise<boolean> {
  if (!currentCtx) return false;
  const { objectApiName, instanceUrl } = currentCtx.pageContext;
  if (!objectApiName) {
    showToast('No object detected on this page', 'right');
    return false;
  }

  let describeData: any;
  try {
    describeData = await sendMessage('describeObject', { instanceUrl, objectApiName });
  } catch (e: any) {
    showToast(`Error: ${e.message}`, 'right');
    return false;
  }

  if (!describeData?.fields) {
    showToast(`No describe metadata returned for ${objectApiName}`, 'right');
    return false;
  }

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
      margin-left: ${tokens.space.sm};
      padding: 1px ${tokens.space.sm};
      background: ${tokens.color.primaryLight};
      color: ${tokens.color.primary};
      font-size: ${tokens.font.size.xs};
      font-weight: ${tokens.font.weight.semibold};
      border-radius: ${tokens.radius.sm};
      font-family: ${tokens.font.family.mono};
      cursor: pointer;
      vertical-align: middle;
      border: 1px solid ${tokens.color.primaryBorder};
    `);
    badge.textContent = fieldInfo.apiName;
    badge.title = `Type: ${fieldInfo.type}${fieldInfo.required ? ' | Required' : ''}\nClick to copy`;

    badge.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(fieldInfo.apiName);
        badge.textContent = 'Copied!';
        badge.style.background = tokens.color.success;
        badge.style.color = tokens.color.textOnPrimary;
      } catch {
        badge.textContent = 'Failed';
        badge.style.background = tokens.color.error;
        badge.style.color = tokens.color.textOnPrimary;
      }
      setTimeout(() => {
        badge.textContent = fieldInfo.apiName;
        badge.style.background = tokens.color.primaryLight;
        badge.style.color = tokens.color.primary;
      }, 1000);
    });

    el.appendChild(badge);
    matched++;
  });

  showToast(`Matched ${matched} fields on ${objectApiName}`, 'right');
  return true;
}

function removeFieldBadges() {
  document.querySelectorAll(`.${BADGE_CLASS}`).forEach((el) => el.remove());
}

const fieldInspector: SFBoostModule = {
  id: 'field-inspector',
  name: 'Field Inspector',
  description: 'Toggle to show API names next to field labels on record pages',

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
      if (btn) btn.style.background = tokens.color.surfaceDark;
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
  if (isShortcutEditableTarget(e.target)) return;
  if (e.altKey && e.shiftKey && e.key === 'F') {
    e.preventDefault();
    toggleInspector();
  }
}

registry.register(fieldInspector);
