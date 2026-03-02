import { getEnabledModules, setEnabledModules } from '../../lib/storage';

interface ModuleInfo {
  id: string;
  name: string;
  description: string;
}

const ALL_MODULES: ModuleInfo[] = [
  { id: 'command-palette', name: 'Command Palette', description: 'Quick navigation (Alt+Shift+S)' },
  { id: 'field-inspector', name: 'Field Inspector', description: 'Show API names on fields (Alt+Shift+F)' },
  { id: 'quick-copy', name: 'Quick Copy', description: 'Copy record IDs & values' },
  { id: 'table-filter', name: 'Table Filter', description: 'Quick search for tables' },
  { id: 'environment-safeguard', name: 'Environment Safeguard', description: 'Color-coded environment indicator' },
  { id: 'deep-dependency-inspector', name: 'Dependency Inspector', description: 'Deep scan where components are used' },
  { id: 'change-set-buddy', name: 'Change Set Buddy', description: 'Enhanced Change Set experience' },
  { id: 'profile-to-permset', name: 'Profile to PermSet', description: 'Extract Profile permissions to Permission Set' },
  { id: 'hide-devops-bar', name: 'Hide DevOps Center Bar', description: 'Removes the DevOps Center navigation bar' },
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

    const name = document.createElement('span');
    name.className = 'module-name';
    name.textContent = mod.name;

    const desc = document.createElement('span');
    desc.className = 'module-desc';
    desc.textContent = mod.description;

    info.append(name, desc);

    const label = document.createElement('label');
    label.className = 'toggle';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.module = mod.id;
    checkbox.checked = enabledIds.includes(mod.id);

    const slider = document.createElement('span');
    slider.className = 'toggle-slider';

    label.append(checkbox, slider);
    item.append(info, label);
    container.appendChild(item);
  }
}

container?.addEventListener('change', async (e) => {
  const target = e.target as HTMLInputElement;
  const moduleId = target.dataset.module;
  if (!moduleId) return;

  const current = await getEnabledModules();
  const updated = target.checked
    ? [...current, moduleId]
    : current.filter((id) => id !== moduleId);

  await setEnabledModules(updated);
});

render();
