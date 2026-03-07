import { getEnabledModules, setEnabledModules } from '../../lib/storage';

const REPO_URL = 'https://github.com/nocebov/sf-boost-chrome';
const PRIVACY_POLICY_URL = `${REPO_URL}/blob/master/docs/privacy-policy.md`;
const SUPPORT_URL = `${REPO_URL}/issues`;

interface ModuleInfo {
  id: string;
  name: string;
  description: string;
  info: string;
}

const ALL_MODULES: ModuleInfo[] = [
  { id: 'command-palette', name: 'Command Palette', description: 'Quick navigation & tools', info: 'Gives quick access to Setup pages and records. Flow Search queries Salesforce only when you explicitly switch into that mode.' },
  { id: 'field-inspector', name: 'Field Inspector', description: 'Show API names on fields', info: 'Reveals API names next to fields on record pages. Uses Salesforce describe metadata from the active org only when you toggle it on.' },
  { id: 'quick-copy', name: 'Quick Copy', description: 'Copy record IDs & values', info: 'Adds a fast copy icon next to Record IDs and names. Click the icon to copy the ID directly to clipboard.' },
  { id: 'table-filter', name: 'Table Filter', description: 'Quick search for tables', info: 'Works on Setup list views. Adds a search box above the table to instantly filter rows on the client-side.' },
  { id: 'environment-safeguard', name: 'Environment Safeguard', description: 'Color-coded environment indicator', info: 'Displays a colored indicator on screen. Helps visually distinguish Production from Sandbox to avoid accidental changes.' },
  { id: 'deep-dependency-inspector', name: 'Dependency Inspector', description: 'Tooling API scan for fields and Apex classes', info: 'Appears on Object Manager field pages and Apex Class pages. Uses Salesforce Tooling API against the active org only after you click Deep Scan.' },
  { id: 'change-set-buddy', name: 'Change Set Buddy', description: 'Enhanced Change Set experience', info: 'Enhances native Change Sets UI in Setup. Gives sorting, search, and bulk selection capabilities when adding components.' },
  { id: 'profile-to-permset', name: 'Profile to PermSet', description: 'Extract Profile permissions to Permission Set', info: 'Works on Profile pages in Setup. Reads permissions and creates the new Permission Set in the same Salesforce org using your current session only after you start the wizard.' },
  { id: 'hide-devops-bar', name: 'Hide DevOps Center Bar', description: 'Hides the DevOps Center bottom bar', info: 'Automatically hides the persistent bottom DevOps Center bar on all pages, freeing up screen real estate.' },
];

const container = document.getElementById('modules');

async function render() {
  if (!container) return;

  const enabledIds = await getEnabledModules();
  container.textContent = '';

  for (const mod of ALL_MODULES) {
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
