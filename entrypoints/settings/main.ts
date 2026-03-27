import { MODULE_CATALOG } from '../../modules/catalog';
import {
  getAllModuleSettings,
  setModuleSettings,
} from '../../lib/storage';

const modulesContainer = document.getElementById('modules-settings');

function createCardShell(nameText: string, descText: string): {
  card: HTMLDivElement;
  body: HTMLDivElement;
} {
  const card = document.createElement('div');
  card.className = 'module-card';

  const header = document.createElement('div');
  header.className = 'module-card-header';

  const name = document.createElement('span');
  name.className = 'module-card-name';
  name.textContent = nameText;

  const desc = document.createElement('span');
  desc.className = 'module-card-desc';
  desc.textContent = descText;

  header.append(name, desc);
  card.appendChild(header);

  const body = document.createElement('div');
  body.className = 'module-card-body';
  card.appendChild(body);

  return { card, body };
}

function createModuleSettingsRow(
  moduleId: string,
  labelText: string,
  settingKey: string,
  checked: boolean,
): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'setting-row';

  const labelEl = document.createElement('label');
  labelEl.className = 'setting-label';
  labelEl.textContent = labelText;
  labelEl.htmlFor = `setting-${moduleId}-${settingKey}`;

  const toggle = document.createElement('label');
  toggle.className = 'toggle';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = `setting-${moduleId}-${settingKey}`;
  checkbox.checked = checked;
  checkbox.dataset.moduleId = moduleId;
  checkbox.dataset.settingKey = settingKey;

  const slider = document.createElement('span');
  slider.className = 'toggle-slider';

  toggle.append(checkbox, slider);
  row.append(labelEl, toggle);

  return row;
}

async function renderModuleSettings(): Promise<void> {
  if (!modulesContainer) return;

  modulesContainer.textContent = '';

  const modulesWithSettings = MODULE_CATALOG.filter((module) => module.settings?.length);
  if (modulesWithSettings.length === 0) {
    modulesContainer.innerHTML = '<div class="empty-state">No configurable modules.</div>';
    return;
  }

  const allSettings = await getAllModuleSettings();

  for (const module of modulesWithSettings) {
    const { card, body } = createCardShell(module.name, module.description);
    const settings = allSettings[module.id] ?? {};

    for (const def of module.settings ?? []) {
      body.appendChild(createModuleSettingsRow(
        module.id,
        def.label,
        def.key,
        settings[def.key] ?? def.default,
      ));
    }

    modulesContainer.appendChild(card);
  }
}

modulesContainer?.addEventListener('change', async (event) => {
  const target = event.target as HTMLInputElement | null;
  const moduleId = target?.dataset.moduleId;
  const settingKey = target?.dataset.settingKey;

  if (!target || !moduleId || !settingKey) return;
  await setModuleSettings(moduleId, { [settingKey]: target.checked });
});

const versionLabel = document.getElementById('version-label');
if (versionLabel) {
  versionLabel.textContent = `v${chrome.runtime.getManifest().version}`;
}

document.getElementById('shortcuts-btn')?.addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

void renderModuleSettings();
