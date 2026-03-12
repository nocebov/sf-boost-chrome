import { getEnabledModules, setEnabledModules } from '../../lib/storage';
import { MODULE_CATALOG } from '../../modules/catalog';

const REPO_URL = 'https://github.com/nocebov/sf-boost-chrome';
const PRIVACY_POLICY_URL = `${REPO_URL}/blob/master/docs/privacy-policy.md`;
const SUPPORT_URL = `${REPO_URL}/blob/master/docs/support.md`;

const container = document.getElementById('modules');

async function render() {
  if (!container) return;

  const enabledIds = await getEnabledModules();
  container.textContent = '';

  for (const mod of MODULE_CATALOG) {
    const item = document.createElement('div');
    item.className = 'module-item';

    const info = document.createElement('div');
    info.className = 'module-info';

    const nameBox = document.createElement('div');
    nameBox.className = 'module-name-box';

    const name = document.createElement('span');
    name.className = 'module-name';
    name.textContent = mod.name;

    const infoIcon = document.createElement('span');
    infoIcon.className = 'info-icon';
    infoIcon.title = 'More info';
    infoIcon.textContent = 'i';
    infoIcon.setAttribute('role', 'button');
    infoIcon.setAttribute('tabindex', '0');
    infoIcon.setAttribute('aria-label', `More info about ${mod.name}`);

    nameBox.append(name, infoIcon);

    const desc = document.createElement('span');
    desc.className = 'module-desc';
    desc.textContent = mod.description;

    const details = document.createElement('div');
    details.className = 'module-details';
    details.textContent = mod.info;

    const toggleDetails = (e: Event) => {
      e.preventDefault();
      details.classList.toggle('show');
      infoIcon.setAttribute('aria-expanded', details.classList.contains('show') ? 'true' : 'false');
    };
    infoIcon.addEventListener('click', toggleDetails);
    infoIcon.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') toggleDetails(e);
    });

    info.append(nameBox, desc, details);

    const label = document.createElement('label');
    label.className = 'toggle';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.module = mod.id;
    checkbox.checked = enabledIds.includes(mod.id);
    checkbox.setAttribute('aria-label', `Toggle ${mod.name}`);

    const slider = document.createElement('span');
    slider.className = 'toggle-slider';

    label.append(checkbox, slider);
    item.append(info, label);
    container.appendChild(item);
  }
}

async function persistEnabledModules(): Promise<void> {
  if (!container) return;

  const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-module]');
  const updated: string[] = [];
  checkboxes.forEach((cb) => {
    if (cb.checked && cb.dataset.module) {
      updated.push(cb.dataset.module);
    }
  });

  await setEnabledModules(updated);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, { type: 'sfboost:update-modules', enabledIds: updated });
    }
  } catch {
    // Active tab may not have the content script injected.
  }
}

container?.addEventListener('change', async (e) => {
  const target = e.target as HTMLInputElement;
  const moduleId = target.dataset.module;
  if (!moduleId) return;
  await persistEnabledModules();
});

const shortcutsBtn = document.getElementById('shortcuts-btn');
if (shortcutsBtn) {
  shortcutsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
}

const privacyBtn = document.getElementById('privacy-btn');
if (privacyBtn) {
  privacyBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: PRIVACY_POLICY_URL });
  });
}

const supportBtn = document.getElementById('support-btn');
if (supportBtn) {
  supportBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: SUPPORT_URL });
  });
}

// Set version from manifest
const versionLabel = document.getElementById('version-label');
if (versionLabel) {
  versionLabel.textContent = `v${chrome.runtime.getManifest().version}`;
}

render();
