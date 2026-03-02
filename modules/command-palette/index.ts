import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';
import { SETUP_COMMANDS, type PaletteCommand } from './setup-commands';
import { fuzzySearch } from './search-engine';
import { sendMessage } from '../../lib/messaging';

const PALETTE_ID = 'sfboost-command-palette';

let currentCtx: ModuleContext | null = null;

interface FlowRecord {
  DurableId: string;
  Label: string;
  ApiName: string;
  ProcessType: string;
  ActiveVersionId: string | null;
  LatestVersionId: string;
  Description: string | null;
}

const FLOW_TYPE_LABELS: Record<string, string> = {
  Flow: 'Screen Flow',
  AutoLaunchedFlow: 'Autolaunched Flow',
  Workflow: 'Record-Triggered Flow',
  CustomEvent: 'Platform Event Flow',
  InvocableProcess: 'Invocable Process',
  Schedule: 'Scheduled Flow',
  RecordBeforeSave: 'Before Save Flow',
  RecordAfterSave: 'After Save Flow',
};

function flowsToCommands(flows: FlowRecord[]): PaletteCommand[] {
  return flows.map((flow) => ({
    id: `flow-${flow.DurableId}`,
    label: flow.Label,
    keywords: [flow.ApiName, flow.ProcessType, flow.Description ?? ''],
    category: `${FLOW_TYPE_LABELS[flow.ProcessType] ?? flow.ProcessType}${flow.ActiveVersionId ? ' \u00b7 Active' : ' \u00b7 Draft'} \u00b7 ${flow.ApiName}`,
    path: `/builder_platform_interaction/flowBuilder.app?flowId=${flow.LatestVersionId}`,
    icon: flow.ActiveVersionId ? '\u{26A1}' : '\u{1F4DD}',
  }));
}

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

  // Sub-mode header (hidden by default)
  const subModeHeader = document.createElement('div');
  subModeHeader.setAttribute('style', `
    display: none;
    padding: 8px 16px;
    background: #f0f4ff;
    align-items: center; gap: 8px;
    font-size: 12px; color: #6b7280;
    border-bottom: 1px solid #e5e7eb;
    cursor: pointer;
    user-select: none;
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

  card.appendChild(subModeHeader);
  card.appendChild(input);
  card.appendChild(results);
  backdrop.appendChild(card);

  let selectedIndex = 0;
  let currentCommands: PaletteCommand[] = SETUP_COMMANDS.slice(0, 10);
  let mode: 'commands' | 'flow-search' = 'commands';
  let flowCommands: PaletteCommand[] = [];

  function renderMessage(text: string, color = '#9ca3af') {
    results.textContent = '';
    const div = document.createElement('div');
    div.setAttribute('style', `padding: 20px; text-align: center; color: ${color};`);
    div.textContent = text;
    results.appendChild(div);
  }

  function renderResults(commands: PaletteCommand[]) {
    currentCommands = commands;
    selectedIndex = Math.min(selectedIndex, Math.max(0, commands.length - 1));
    results.textContent = '';

    if (commands.length === 0) {
      renderMessage('No results found');
      return;
    }

    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i]!;
      const row = document.createElement('div');
      row.className = 'sfboost-palette-item';
      row.dataset.index = String(i);
      row.setAttribute('style', `
        padding: 10px 20px; cursor: pointer;
        display: flex; align-items: center; gap: 10px;
        background: ${i === selectedIndex ? '#f0f4ff' : 'transparent'};
        transition: background 0.1s;
      `);

      const icon = document.createElement('span');
      icon.setAttribute('style', 'font-size: 16px; width: 24px; text-align: center;');
      icon.textContent = cmd.icon ?? '>';

      const info = document.createElement('div');
      info.setAttribute('style', 'flex: 1; min-width: 0;');

      const label = document.createElement('div');
      label.setAttribute('style', 'font-size: 14px; font-weight: 500; color: #1a1a2e;');
      label.textContent = cmd.label;

      const cat = document.createElement('div');
      cat.setAttribute('style', 'font-size: 11px; color: #9ca3af; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;');
      cat.textContent = cmd.category;

      info.append(label, cat);
      row.append(icon, info);
      results.appendChild(row);
    }
  }

  async function enterFlowSearch() {
    mode = 'flow-search';
    input.value = '';
    input.placeholder = 'Type flow name...';
    selectedIndex = 0;

    subModeHeader.style.display = 'flex';
    subModeHeader.textContent = '';
    const back = document.createElement('span');
    back.textContent = '\u2190';
    const title = document.createElement('span');
    title.textContent = '\u{26A1} Find Flow';
    const hint = document.createElement('span');
    hint.setAttribute('style', 'margin-left: auto; font-size: 11px; color: #9ca3af;');
    hint.textContent = 'Esc to go back';
    subModeHeader.append(back, title, hint);

    renderMessage('Loading flows...');

    if (!currentCtx) {
      renderMessage('No Salesforce context available', '#ef4444');
      return;
    }

    try {
      const response = await sendMessage('executeSOQL', {
        instanceUrl: currentCtx.pageContext.instanceUrl,
        query: `SELECT DurableId, Label, ApiName, ProcessType, ActiveVersionId, LatestVersionId, Description FROM FlowDefinitionView ORDER BY Label LIMIT 2000`,
      });

      const records = (response?.records ?? []) as FlowRecord[];
      flowCommands = flowsToCommands(records);
      renderResults(flowCommands.slice(0, 15));
    } catch (e: any) {
      renderMessage(`Failed to load flows: ${e?.message ?? 'Unknown error'}`, '#ef4444');
    }
  }

  function exitSubMode() {
    mode = 'commands';
    flowCommands = [];
    input.value = '';
    input.placeholder = 'Search Setup pages, actions...';
    selectedIndex = 0;
    subModeHeader.style.display = 'none';
    renderResults(SETUP_COMMANDS.slice(0, 10));
    input.focus();
  }

  function executeCommand(cmd: PaletteCommand) {
    if (cmd.subMode === 'flow-search') {
      enterFlowSearch();
      input.focus();
      return;
    }

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
  subModeHeader.addEventListener('click', () => {
    exitSubMode();
  });

  input.addEventListener('input', () => {
    const query = input.value.trim();
    selectedIndex = 0;

    if (mode === 'flow-search') {
      if (!query) {
        renderResults(flowCommands.slice(0, 15));
      } else {
        renderResults(fuzzySearch(query, flowCommands, 15));
      }
      return;
    }

    if (!query) {
      renderResults(SETUP_COMMANDS.slice(0, 10));
    } else {
      renderResults(fuzzySearch(query, SETUP_COMMANDS));
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (mode !== 'commands') {
        e.preventDefault();
        exitSubMode();
      } else {
        closePalette();
      }
    } else if (e.key === 'Backspace' && input.value === '' && mode !== 'commands') {
      e.preventDefault();
      exitSubMode();
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
