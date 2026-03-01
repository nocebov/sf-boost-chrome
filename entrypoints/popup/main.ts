import { getEnabledModules, setEnabledModules } from '../../lib/storage';

interface ModuleInfo {
  id: string;
  name: string;
  description: string;
}

const ALL_MODULES: ModuleInfo[] = [
  { id: 'command-palette', name: 'Command Palette', description: 'Quick navigation (Alt+Shift+S)' },
  { id: 'field-inspector', name: 'Field Inspector', description: 'Show API names on fields' },
  { id: 'quick-copy', name: 'Quick Copy', description: 'Copy record IDs & values' },
];

async function render() {
  const container = document.getElementById('modules');
  if (!container) return;

  const enabledIds = await getEnabledModules();

  container.innerHTML = ALL_MODULES.map(
    (mod) => `
    <div class="module-item">
      <div class="module-info">
        <span class="module-name">${mod.name}</span>
        <span class="module-desc">${mod.description}</span>
      </div>
      <label class="toggle">
        <input type="checkbox" data-module="${mod.id}" ${enabledIds.includes(mod.id) ? 'checked' : ''}>
        <span class="toggle-slider"></span>
      </label>
    </div>
  `
  ).join('');

  container.addEventListener('change', async (e) => {
    const target = e.target as HTMLInputElement;
    const moduleId = target.dataset.module;
    if (!moduleId) return;

    const current = await getEnabledModules();
    const updated = target.checked
      ? [...current, moduleId]
      : current.filter((id) => id !== moduleId);

    await setEnabledModules(updated);
  });
}

render();
