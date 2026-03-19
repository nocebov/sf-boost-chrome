import { getEnabledModules, setEnabledModules } from '../../lib/storage';
import { MODULE_CATALOG } from '../../modules/catalog';
import type { ModuleAccessLevel } from '../../modules/catalog';

const REPO_URL = 'https://github.com/nocebov/sf-boost-chrome';
const PRIVACY_POLICY_URL = `${REPO_URL}/blob/master/docs/privacy-policy.md`;
const SUPPORT_URL = `${REPO_URL}/blob/master/docs/support.md`;

const modulesList = document.getElementById('modules-list');
const headerCounts = document.getElementById('header-counts');

const ACCESS_LABELS: Record<ModuleAccessLevel, string> = {
  'ui-only': 'UI',
  'read-only': 'Read',
  'write-capable': 'Write',
};

function createModuleItem(
  mod: (typeof MODULE_CATALOG)[number],
  isEnabled: boolean,
): HTMLElement {
  const item = document.createElement('div');
  item.className = 'module-item';

  const info = document.createElement('div');
  info.className = 'module-info';

  const topRow = document.createElement('div');
  topRow.className = 'module-top-row';

  const name = document.createElement('span');
  name.className = 'module-name';
  name.textContent = mod.name;

  const badge = document.createElement('span');
  badge.className = `access-badge ${mod.accessLevel}`;
  badge.textContent = ACCESS_LABELS[mod.accessLevel];

  const chevron = document.createElement('span');
  chevron.className = 'expand-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  topRow.append(name, badge, chevron);

  const desc = document.createElement('span');
  desc.className = 'module-desc';
  desc.textContent = mod.description;

  const details = document.createElement('div');
  details.className = 'module-details';
  details.textContent = mod.info;

  info.setAttribute('role', 'button');
  info.setAttribute('aria-expanded', 'false');
  info.setAttribute('tabindex', '0');
  info.addEventListener('click', () => {
    const isShown = details.classList.toggle('show');
    chevron.classList.toggle('is-expanded', isShown);
    info.setAttribute('aria-expanded', String(isShown));
  });
  info.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      info.click();
    }
  });

  info.append(topRow, desc, details);

  const label = document.createElement('label');
  label.className = 'toggle';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.dataset.module = mod.id;
  checkbox.checked = isEnabled;
  checkbox.setAttribute('aria-label', `Toggle ${mod.name}`);

  const slider = document.createElement('span');
  slider.className = 'toggle-slider';

  label.append(checkbox, slider);
  item.append(info, label);

  return item;
}

function updateCounts(enabledCount: number): void {
  if (headerCounts) {
    headerCounts.textContent = `${enabledCount} / ${MODULE_CATALOG.length}`;
  }
}

async function render(): Promise<void> {
  if (!modulesList) return;

  const enabledIds = await getEnabledModules();
  modulesList.textContent = '';

  for (const mod of MODULE_CATALOG) {
    const isEnabled = enabledIds.includes(mod.id);
    const item = createModuleItem(mod, isEnabled);
    modulesList.appendChild(item);
  }

  updateCounts(enabledIds.length);
}

async function persistEnabledModules(): Promise<void> {
  const allCheckboxes = document.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"][data-module]',
  );
  const updated: string[] = [];
  allCheckboxes.forEach((cb) => {
    if (cb.checked && cb.dataset.module) {
      updated.push(cb.dataset.module);
    }
  });

  await setEnabledModules(updated);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'sfboost:update-modules',
        enabledIds: updated,
      });
    }
  } catch {
    // Active tab may not have the content script injected.
  }
}

document.addEventListener('change', async (e) => {
  const target = e.target as HTMLInputElement;
  if (!target.dataset.module) return;
  await persistEnabledModules();
  updateCounts(
    document.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"][data-module]:checked',
    ).length,
  );
});

document.getElementById('shortcuts-btn')?.addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

document.getElementById('privacy-btn')?.addEventListener('click', () => {
  chrome.tabs.create({ url: PRIVACY_POLICY_URL });
});

document.getElementById('support-btn')?.addEventListener('click', () => {
  chrome.tabs.create({ url: SUPPORT_URL });
});

// Set version from manifest
const versionLabel = document.getElementById('version-label');
if (versionLabel) {
  versionLabel.textContent = `v${chrome.runtime.getManifest().version}`;
}

render();
