import { MODULE_CATALOG } from '../../modules/catalog';
import { getAllModuleSettings, setModuleSettings } from '../../lib/storage';

const container = document.getElementById('modules-settings');

async function render(): Promise<void> {
  if (!container) return;

  const modulesWithSettings = MODULE_CATALOG.filter((m) => m.settings?.length);
  if (modulesWithSettings.length === 0) {
    container.innerHTML = '<div class="empty-state">No configurable modules.</div>';
    return;
  }

  const allSettings = await getAllModuleSettings();

  for (const mod of modulesWithSettings) {
    const card = document.createElement('div');
    card.className = 'module-card';

    const header = document.createElement('div');
    header.className = 'module-card-header';

    const name = document.createElement('span');
    name.className = 'module-card-name';
    name.textContent = mod.name;

    const desc = document.createElement('span');
    desc.className = 'module-card-desc';
    desc.textContent = mod.description;

    header.append(name, desc);
    card.appendChild(header);

    const body = document.createElement('div');
    body.className = 'module-card-body';

    const settings = allSettings[mod.id] ?? {};

    for (const def of mod.settings!) {
      const row = document.createElement('div');
      row.className = 'setting-row';

      const labelEl = document.createElement('label');
      labelEl.className = 'setting-label';
      labelEl.textContent = def.label;
      labelEl.htmlFor = `setting-${mod.id}-${def.key}`;

      const toggle = document.createElement('label');
      toggle.className = 'toggle';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `setting-${mod.id}-${def.key}`;
      checkbox.checked = settings[def.key] ?? def.default;
      checkbox.dataset.moduleId = mod.id;
      checkbox.dataset.settingKey = def.key;

      const slider = document.createElement('span');
      slider.className = 'toggle-slider';

      toggle.append(checkbox, slider);
      row.append(labelEl, toggle);
      body.appendChild(row);
    }

    card.appendChild(body);
    container.appendChild(card);
  }
}

container?.addEventListener('change', async (e) => {
  const target = e.target as HTMLInputElement;
  const { moduleId, settingKey } = target.dataset;
  if (!moduleId || !settingKey) return;

  await setModuleSettings(moduleId, { [settingKey]: target.checked });
});

// Set version from manifest
const versionLabel = document.getElementById('version-label');
if (versionLabel) {
  versionLabel.textContent = `v${chrome.runtime.getManifest().version}`;
}

render();
