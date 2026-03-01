import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';
import { SETUP_COMMANDS, type PaletteCommand } from './setup-commands';
import { fuzzySearch } from './search-engine';

const PALETTE_ID = 'sfboost-command-palette';

let currentCtx: ModuleContext | null = null;

function createPaletteUI() {
  // Remove existing
  const existing = document.getElementById(PALETTE_ID);
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.id = PALETTE_ID;
  backdrop.setAttribute('style', `
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.4);
    z-index: 9999999;
    display: flex; align-items: flex-start; justify-content: center;
    padding-top: 15vh;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `);

  const card = document.createElement('div');
  card.setAttribute('style', `
    background: #fff; border-radius: 12px;
    width: 560px; max-height: 420px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    display: flex; flex-direction: column;
    overflow: hidden;
  `);

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Search Setup pages, actions...';
  input.setAttribute('style', `
    width: 100%; padding: 16px 20px;
    border: none; outline: none;
    font-size: 16px; color: #1a1a2e;
    border-bottom: 1px solid #e5e7eb;
    background: transparent;
  `);

  const results = document.createElement('div');
  results.setAttribute('style', `
    overflow-y: auto; flex: 1;
    max-height: 340px;
  `);

  card.appendChild(input);
  card.appendChild(results);
  backdrop.appendChild(card);

  let selectedIndex = 0;
  let currentCommands: PaletteCommand[] = SETUP_COMMANDS.slice(0, 10);

  function renderResults(commands: PaletteCommand[]) {
    currentCommands = commands;
    selectedIndex = Math.min(selectedIndex, Math.max(0, commands.length - 1));
    results.innerHTML = commands.length === 0
      ? '<div style="padding: 20px; text-align: center; color: #9ca3af;">No results found</div>'
      : commands.map((cmd, i) => `
        <div class="sfboost-palette-item" data-index="${i}" style="
          padding: 10px 20px;
          cursor: pointer;
          display: flex; align-items: center; gap: 10px;
          background: ${i === selectedIndex ? '#f0f4ff' : 'transparent'};
          transition: background 0.1s;
        ">
          <span style="font-size: 16px; width: 24px; text-align: center;">${cmd.icon ?? '>'}</span>
          <div style="flex: 1;">
            <div style="font-size: 14px; font-weight: 500; color: #1a1a2e;">${cmd.label}</div>
            <div style="font-size: 11px; color: #9ca3af;">${cmd.category}</div>
          </div>
        </div>
      `).join('');
  }

  function executeCommand(cmd: PaletteCommand) {
    closePalette();
    if (cmd.action) {
      cmd.action();
    } else if (cmd.path) {
      window.location.href = cmd.path;
    }
  }

  function closePalette() {
    const el = document.getElementById(PALETTE_ID);
    if (el) el.remove();
  }

  // Event handlers
  input.addEventListener('input', () => {
    const query = input.value.trim();
    selectedIndex = 0;
    if (!query) {
      renderResults(SETUP_COMMANDS.slice(0, 10));
    } else {
      renderResults(fuzzySearch(query, SETUP_COMMANDS));
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePalette();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, currentCommands.length - 1);
      renderResults(currentCommands);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      renderResults(currentCommands);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = currentCommands[selectedIndex];
      if (cmd) executeCommand(cmd);
    }
  });

  results.addEventListener('click', (e) => {
    const item = (e.target as HTMLElement).closest('[data-index]') as HTMLElement | null;
    if (item) {
      const idx = parseInt(item.dataset.index ?? '0', 10);
      const cmd = currentCommands[idx];
      if (cmd) executeCommand(cmd);
    }
  });

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closePalette();
  });

  document.body.appendChild(backdrop);
  renderResults(currentCommands);
  input.focus();
}

function togglePalette() {
  const existing = document.getElementById(PALETTE_ID);
  if (existing) {
    existing.remove();
  } else {
    createPaletteUI();
  }
}

const commandPalette: SFBoostModule = {
  id: 'command-palette',
  name: 'Command Palette',
  description: 'Quick navigation to Setup pages via Alt+Shift+S',
  defaultEnabled: true,

  async init(ctx: ModuleContext) {
    currentCtx = ctx;
    document.addEventListener('sfboost:toggle-palette', togglePalette);
    // Also allow Ctrl+Shift+S directly from page
    document.addEventListener('keydown', handleKeydown);
  },

  async onNavigate(ctx: ModuleContext) {
    currentCtx = ctx;
  },

  destroy() {
    document.removeEventListener('sfboost:toggle-palette', togglePalette);
    document.removeEventListener('keydown', handleKeydown);
    const existing = document.getElementById(PALETTE_ID);
    if (existing) existing.remove();
  },
};

function handleKeydown(e: KeyboardEvent) {
  if (e.altKey && e.shiftKey && e.key === 'S') {
    e.preventDefault();
    togglePalette();
  }
}

registry.register(commandPalette);
