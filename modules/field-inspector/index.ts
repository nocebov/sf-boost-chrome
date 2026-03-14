import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';
import { sendMessage } from '../../lib/messaging';
import { showToast } from '../../lib/toast';
import { tokens } from '../../lib/design-tokens';

const BADGE_CLASS = 'sfboost-field-badge';
const LABEL_SELECTOR =
  'span.test-id__field-label, ' +
  '.slds-form-element__label:not(:has(span.test-id__field-label)), ' +
  'records-record-layout-item span[class*="label"]:not(:has(span.test-id__field-label))';

type FieldInfo = { apiName: string; type: string; required: boolean };

let currentCtx: ModuleContext | null = null;
let cachedObjectApiName: string | null = null;
let cachedFieldMap: Map<string, FieldInfo> | null = null;
let observer: MutationObserver | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let navigationGen = 0;

/* ── Fetch or reuse field map ──────────────────────────────── */

async function getFieldMap(
  instanceUrl: string,
  objectApiName: string,
): Promise<Map<string, FieldInfo> | null> {
  if (objectApiName === cachedObjectApiName && cachedFieldMap) {
    return cachedFieldMap;
  }

  let describeData: any;
  try {
    describeData = await sendMessage('describeObject', { instanceUrl, objectApiName });
  } catch (e: any) {
    showToast(`Error: ${e.message}`, 'right');
    return null;
  }

  if (!describeData?.fields) return null;

  const map = new Map<string, FieldInfo>();
  for (const field of describeData.fields) {
    map.set((field.label as string).toLowerCase().trim(), {
      apiName: field.name as string,
      type: field.type as string,
      required: !field.nillable && !field.defaultedOnCreate,
    });
  }

  cachedObjectApiName = objectApiName;
  cachedFieldMap = map;
  return map;
}

/* ── Apply badges to label elements that don't have one yet ── */

function applyBadgesToDOM(fieldMap: Map<string, FieldInfo>) {
  document.querySelectorAll(LABEL_SELECTOR).forEach((el) => {
    if (el.querySelector(`.${BADGE_CLASS}`)) return;

    const labelText = (el.textContent ?? '').replace(/[\s*:]+$/, '').toLowerCase().trim();
    const fieldInfo = fieldMap.get(labelText);
    if (!fieldInfo) return;

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
  });
}

/* ── Main auto-apply flow ──────────────────────────────────── */

async function applyBadges() {
  if (!currentCtx) return;
  const { objectApiName, instanceUrl } = currentCtx.pageContext;
  if (!objectApiName) return;

  const gen = navigationGen;
  const fieldMap = await getFieldMap(instanceUrl, objectApiName);
  if (!fieldMap || gen !== navigationGen) return;

  applyBadgesToDOM(fieldMap);
  startObserver(fieldMap);
}

/* ── MutationObserver for lazily-loaded sections ───────────── */

function startObserver(fieldMap: Map<string, FieldInfo>) {
  stopObserver();
  observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => applyBadgesToDOM(fieldMap), 300);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function stopObserver() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

/* ── Cleanup ───────────────────────────────────────────────── */

function removeFieldBadges() {
  document.querySelectorAll(`.${BADGE_CLASS}`).forEach((el) => el.remove());
}

/* ── Module definition ─────────────────────────────────────── */

const fieldInspector: SFBoostModule = {
  id: 'field-inspector',
  name: 'Field Inspector',
  description: 'Automatically shows API names next to field labels on record pages',

  async init(ctx: ModuleContext) {
    if (window.top !== window.self) return;
    currentCtx = ctx;
    if (ctx.pageContext.pageType === 'record') {
      applyBadges();
    }
  },

  async onNavigate(ctx: ModuleContext) {
    if (window.top !== window.self) return;
    navigationGen++;
    stopObserver();
    removeFieldBadges();
    currentCtx = ctx;
    if (ctx.pageContext.pageType === 'record') {
      applyBadges();
    }
  },

  destroy() {
    if (window.top !== window.self) return;
    navigationGen++;
    stopObserver();
    removeFieldBadges();
    cachedFieldMap = null;
    cachedObjectApiName = null;
    currentCtx = null;
  },
};

registry.register(fieldInspector);
