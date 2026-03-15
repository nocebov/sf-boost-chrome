import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';
import { SETUP_COMMANDS, type PaletteCommand } from './setup-commands';
import { fuzzySearch } from './search-engine';
import { sendMessage } from '../../lib/messaging';
import { tokens } from '../../lib/design-tokens';
import { showToast } from '../../lib/toast';
import {
  loadQuickActions,
  renderQuickActionBar,
  showAddCustomActionForm,
  type QuickAction,
} from './quick-actions';
import { getQuickActionConfig, setQuickActionConfig } from '../../lib/storage';

const PALETTE_ID = 'sfboost-command-palette';

let currentCtx: ModuleContext | null = null;

function isShortcutEditableTarget(target: EventTarget | null): boolean {
  const el = target instanceof HTMLElement ? target : null;
  if (!el) return false;
  if (el.closest(`#${PALETTE_ID}`)) return false;
  return el.isContentEditable || !!el.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]');
}

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

interface ProfileRecord {
  Id: string;
  Name: string;
  UserType: string;
  Description: string | null;
}

const PROFILE_USER_TYPE_LABELS: Record<string, string> = {
  Standard: 'Standard',
  PowerPartner: 'Partner',
  CSPLitePortal: 'Customer Portal',
  CustomerSuccess: 'Customer Community',
  PowerCustomerSuccess: 'Customer Community Plus',
  CsnOnly: 'Chatter',
  Guest: 'Guest',
};

function profilesToCommands(profiles: ProfileRecord[]): PaletteCommand[] {
  return profiles.map((p) => ({
    id: `profile-${p.Id}`,
    label: p.Name,
    keywords: [p.Name, p.UserType, p.Description ?? ''],
    category: `${PROFILE_USER_TYPE_LABELS[p.UserType] ?? p.UserType} Profile`,
    path: `/lightning/setup/EnhancedProfiles/page?address=%2F${p.Id}`,
    icon: '\u{1F511}',
  }));
}

interface PermSetRecord {
  Id: string;
  Name: string;
  Label: string;
  Description: string | null;
  IsCustom: boolean;
  NamespacePrefix: string | null;
}

function permSetsToCommands(permSets: PermSetRecord[]): PaletteCommand[] {
  return permSets.map((ps) => ({
    id: `permset-${ps.Id}`,
    label: ps.Label,
    keywords: [ps.Name, ps.Label, ps.Description ?? '', ps.NamespacePrefix ?? ''],
    category: `${ps.IsCustom ? 'Custom' : 'Standard'}${ps.NamespacePrefix ? ` \u00b7 ${ps.NamespacePrefix}` : ''} \u00b7 ${ps.Name}`,
    path: `/lightning/setup/PermSets/page?address=%2F${ps.Id}`,
    icon: ps.IsCustom ? '\u{1F6E1}' : '\u{1F4CB}',
  }));
}

interface ApexClassRecord {
  Id: string;
  Name: string;
  ApiVersion: number;
  Status: string;
  NamespacePrefix: string | null;
  LengthWithoutComments: number;
}

function apexClassesToCommands(classes: ApexClassRecord[]): PaletteCommand[] {
  return classes.map((cls) => ({
    id: `apex-class-${cls.Id}`,
    label: cls.Name,
    keywords: [cls.Name, cls.NamespacePrefix ?? '', `v${cls.ApiVersion}`],
    category: `${cls.Status} \u00b7 v${cls.ApiVersion}${cls.NamespacePrefix ? ` \u00b7 ${cls.NamespacePrefix}` : ''} \u00b7 ${cls.LengthWithoutComments} chars`,
    path: `/lightning/setup/ApexClasses/page?address=%2F${cls.Id}`,
    icon: cls.Status === 'Active' ? '\u{1F4BB}' : '\u{1F6AB}',
  }));
}

interface ApexTriggerRecord {
  Id: string;
  Name: string;
  ApiVersion: number;
  Status: string;
  NamespacePrefix: string | null;
  TableEnumOrId: string;
}

function apexTriggersToCommands(triggers: ApexTriggerRecord[]): PaletteCommand[] {
  return triggers.map((trg) => ({
    id: `apex-trigger-${trg.Id}`,
    label: trg.Name,
    keywords: [trg.Name, trg.TableEnumOrId, trg.NamespacePrefix ?? '', `v${trg.ApiVersion}`],
    category: `${trg.TableEnumOrId} \u00b7 ${trg.Status} \u00b7 v${trg.ApiVersion}${trg.NamespacePrefix ? ` \u00b7 ${trg.NamespacePrefix}` : ''}`,
    path: `/lightning/setup/ApexTriggers/page?address=%2F${trg.Id}`,
    icon: trg.Status === 'Active' ? '\u{2699}' : '\u{1F6AB}',
  }));
}

function soqlRecordsToCommands(records: any[]): PaletteCommand[] {
  return records.slice(0, 50).map((rec, i) => {
    const name = rec.Name ?? rec.DeveloperName ?? rec.Label ?? rec.Id ?? `Row ${i + 1}`;
    const id = rec.Id ?? `row-${i}`;
    const fields = Object.entries(rec)
      .filter(([k, v]) => k !== 'attributes' && v != null)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' \u00b7 ');

    return {
      id: `soql-${id}-${i}`,
      label: String(name),
      keywords: [String(name), id],
      category: fields.length > 80 ? fields.slice(0, 80) + '...' : fields,
      action: () => {
        const copyValue = rec.Id ?? fields;
        navigator.clipboard.writeText(copyValue);
        showToast(`Copied: ${copyValue.length > 40 ? copyValue.slice(0, 40) + '...' : copyValue}`);
      },
      icon: '\u{1F4C4}',
    };
  });
}

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
    background: rgba(0,0,0,0.2);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: ${tokens.zIndex.overlay};
    display: flex; align-items: flex-start; justify-content: center;
    padding-top: 15vh;
    font-family: ${tokens.font.family.sans};
    opacity: 0;
    transition: opacity ${tokens.transition.normal} ease-out;
  `);

  // Trigger animation after creation
  requestAnimationFrame(() => {
    backdrop.style.opacity = '1';
  });

  const card = document.createElement('div');
  card.setAttribute('style', `
    background: ${tokens.color.surfaceBase}; border-radius: ${tokens.radius.xl};
    width: 560px; max-height: 520px;
    box-shadow: ${tokens.shadow.lg};
    display: flex; flex-direction: column;
    overflow: hidden;
    transform: scale(0.98) translateY(-10px);
    transition: transform ${tokens.transition.modalEase};
  `);

  requestAnimationFrame(() => {
    card.style.transform = 'scale(1) translateY(0)';
  });

  // Sub-mode header (hidden by default)
  const subModeHeader = document.createElement('div');
  subModeHeader.setAttribute('style', `
    display: none;
    padding: ${tokens.space.md} ${tokens.space.xl};
    background: ${tokens.color.surfaceSelected};
    align-items: center; gap: ${tokens.space.md};
    font-size: ${tokens.font.size.sm}; color: ${tokens.color.textTertiary};
    border-bottom: 1px solid ${tokens.color.borderDefault};
    cursor: pointer;
    user-select: none;
  `);

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Search Setup pages, actions...';
  input.setAttribute('style', `
    width: 100%; padding: ${tokens.space.xl} ${tokens.space['2xl']};
    border: none; outline: none;
    font-size: ${tokens.font.size.lg}; color: ${tokens.color.textPrimary};
    border-bottom: 1px solid ${tokens.color.borderDefault};
    background: transparent;
  `);

  const results = document.createElement('div');
  results.setAttribute('style', `
    overflow-y: auto; flex: 1;
    max-height: 440px;
    scrollbar-width: thin;
    scrollbar-color: ${tokens.color.borderMuted} transparent;
  `);

  // Quick action buttons bar
  const quickActionBar = document.createElement('div');
  quickActionBar.setAttribute('style', `
    display: flex;
    align-items: center;
    gap: ${tokens.space.sm};
    padding: ${tokens.space.md} ${tokens.space.xl};
    border-bottom: 1px solid ${tokens.color.borderDefault};
    flex-wrap: wrap;
  `);

  let activeQuickActions: QuickAction[] = [];
  let editMode = false;

  function activateQuickAction(qa: QuickAction, newTab = false) {
    if (qa.subMode) {
      enterSubModeByName(qa.subMode);
    } else if (qa.actionId === 'toggle-debug-log') {
      handleToggleDebugLog();
    } else if (qa.customUrl) {
      closePalette();
      if (newTab) {
        window.open(qa.customUrl, '_blank');
      } else {
        window.location.href = qa.customUrl;
      }
    }
  }

  async function refreshQuickActions() {
    activeQuickActions = await loadQuickActions();
    renderQuickActionBar(
      quickActionBar,
      activeQuickActions,
      activateQuickAction,
      () => {
        editMode = !editMode;
        if (editMode) {
          renderMessage('Edit quick actions: delete, add, or reset to defaults');
        } else {
          renderResults(SETUP_COMMANDS.slice(0, 10));
        }
        refreshQuickActions();
      },
      editMode,
    );
  }

  quickActionBar.addEventListener('sfboost:qa-config-changed', () => {
    refreshQuickActions();
  });

  quickActionBar.addEventListener('sfboost:qa-show-add-form', () => {
    showAddCustomActionForm(
      results,
      async (newAction) => {
        const config = await getQuickActionConfig();
        config.customActions.push(newAction);
        await setQuickActionConfig(config);
        showToast('Custom action added');
        await refreshQuickActions();
        renderResults(SETUP_COMMANDS.slice(0, 10));
      },
      () => {
        renderResults(SETUP_COMMANDS.slice(0, 10));
      },
    );
  });

  // Load quick actions async (resolves near-instantly)
  refreshQuickActions();

  card.appendChild(subModeHeader);
  card.appendChild(quickActionBar);
  card.appendChild(input);
  card.appendChild(results);
  backdrop.appendChild(card);

  let selectedIndex = 0;
  let currentCommands: PaletteCommand[] = SETUP_COMMANDS.slice(0, 10);
  let mode: 'commands' | 'flow-search' | 'profile-search' | 'permset-search' | 'apex-class-search' | 'apex-trigger-search' | 'soql-query' = 'commands';
  let flowCommands: PaletteCommand[] = [];
  let profileCommands: PaletteCommand[] = [];
  let permSetCommands: PaletteCommand[] = [];
  let apexClassCommands: PaletteCommand[] = [];
  let apexTriggerCommands: PaletteCommand[] = [];
  let soqlResultCommands: PaletteCommand[] = [];
  let soqlExecuted = false;

  function renderMessage(text: string, color: string = tokens.color.textMuted) {
    results.textContent = '';
    const div = document.createElement('div');
    div.setAttribute('style', `padding: ${tokens.space['2xl']}; text-align: center; color: ${color};`);
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
        padding: ${tokens.space.lg} ${tokens.space['2xl']}; cursor: pointer;
        display: flex; align-items: center; gap: ${tokens.space.lg};
        background: ${i === selectedIndex ? tokens.color.surfaceSelected : 'transparent'};
        transition: background ${tokens.transition.fast};
      `);

      const icon = document.createElement('span');
      icon.setAttribute('style', `font-size: ${tokens.font.size.lg}; width: 24px; text-align: center;`);
      icon.textContent = cmd.icon ?? '>';

      const info = document.createElement('div');
      info.setAttribute('style', 'flex: 1; min-width: 0;');

      const label = document.createElement('div');
      label.setAttribute('style', `font-size: ${tokens.font.size.md}; font-weight: ${tokens.font.weight.medium}; color: ${tokens.color.textPrimary};`);
      label.textContent = cmd.label;

      const cat = document.createElement('div');
      cat.setAttribute('style', `font-size: ${tokens.font.size.sm}; color: ${tokens.color.textMuted}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`);
      cat.textContent = cmd.category;

      info.append(label, cat);
      row.append(icon, info);
      results.appendChild(row);

      // Auto-scroll logic exactly for the active item
      if (i === selectedIndex) {
        // use setTimeout or microtask to ensure DOM is updated first
        queueMicrotask(() => {
          row.scrollIntoView({ behavior: 'auto', block: 'nearest' });
        });
      }
    }
  }

  async function enterFlowSearch() {
    mode = 'flow-search';
    input.value = '';
    input.placeholder = 'Type flow name...';
    selectedIndex = 0;
    quickActionBar.style.display = 'none';

    subModeHeader.style.display = 'flex';
    subModeHeader.textContent = '';
    const back = document.createElement('span');
    back.textContent = '\u2190';
    const title = document.createElement('span');
    title.textContent = '\u{26A1} Find Flow';
    const hint = document.createElement('span');
    hint.setAttribute('style', `margin-left: auto; font-size: ${tokens.font.size.sm}; color: ${tokens.color.textMuted};`);
    hint.textContent = 'Esc to go back';
    subModeHeader.append(back, title, hint);

    renderMessage('Loading flows...');

    if (!currentCtx) {
      renderMessage('No Salesforce context available', tokens.color.error);
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
      renderMessage(`Failed to load flows: ${e?.message ?? 'Unknown error'}`, tokens.color.error);
    }
  }

  async function enterProfileSearch() {
    mode = 'profile-search';
    input.value = '';
    input.placeholder = 'Type profile name...';
    selectedIndex = 0;
    quickActionBar.style.display = 'none';

    subModeHeader.style.display = 'flex';
    subModeHeader.textContent = '';
    const back = document.createElement('span');
    back.textContent = '\u2190';
    const title = document.createElement('span');
    title.textContent = '\u{1F511} Find Profile';
    const hint = document.createElement('span');
    hint.setAttribute('style', `margin-left: auto; font-size: ${tokens.font.size.sm}; color: ${tokens.color.textMuted};`);
    hint.textContent = 'Esc to go back';
    subModeHeader.append(back, title, hint);

    renderMessage('Loading profiles...');

    if (!currentCtx) {
      renderMessage('No Salesforce context available', tokens.color.error);
      return;
    }

    try {
      const response = await sendMessage('executeSOQLAll', {
        instanceUrl: currentCtx.pageContext.instanceUrl,
        query: `SELECT Id, Name, UserType, Description FROM Profile ORDER BY Name`,
      });

      const records = (response?.records ?? []) as ProfileRecord[];
      profileCommands = profilesToCommands(records);
      renderResults(profileCommands.slice(0, 15));
    } catch (e: any) {
      renderMessage(`Failed to load profiles: ${e?.message ?? 'Unknown error'}`, tokens.color.error);
    }
  }

  async function enterPermSetSearch() {
    mode = 'permset-search';
    input.value = '';
    input.placeholder = 'Type permission set name...';
    selectedIndex = 0;
    quickActionBar.style.display = 'none';

    subModeHeader.style.display = 'flex';
    subModeHeader.textContent = '';
    const back = document.createElement('span');
    back.textContent = '\u2190';
    const title = document.createElement('span');
    title.textContent = '\u{1F6E1} Find Permission Set';
    const hint = document.createElement('span');
    hint.setAttribute('style', `margin-left: auto; font-size: ${tokens.font.size.sm}; color: ${tokens.color.textMuted};`);
    hint.textContent = 'Esc to go back';
    subModeHeader.append(back, title, hint);

    renderMessage('Loading permission sets...');

    if (!currentCtx) {
      renderMessage('No Salesforce context available', tokens.color.error);
      return;
    }

    try {
      const response = await sendMessage('executeSOQLAll', {
        instanceUrl: currentCtx.pageContext.instanceUrl,
        query: `SELECT Id, Name, Label, Description, IsCustom, NamespacePrefix FROM PermissionSet WHERE IsOwnedByProfile = false ORDER BY Label`,
      });

      const records = (response?.records ?? []) as PermSetRecord[];
      permSetCommands = permSetsToCommands(records);
      renderResults(permSetCommands.slice(0, 15));
    } catch (e: any) {
      renderMessage(`Failed to load permission sets: ${e?.message ?? 'Unknown error'}`, tokens.color.error);
    }
  }

  async function enterApexClassSearch() {
    mode = 'apex-class-search';
    input.value = '';
    input.placeholder = 'Type class name...';
    selectedIndex = 0;
    quickActionBar.style.display = 'none';

    subModeHeader.style.display = 'flex';
    subModeHeader.textContent = '';
    const back = document.createElement('span');
    back.textContent = '\u2190';
    const title = document.createElement('span');
    title.textContent = '\u{1F4BB} Find Apex Class';
    const hint = document.createElement('span');
    hint.setAttribute('style', `margin-left: auto; font-size: ${tokens.font.size.sm}; color: ${tokens.color.textMuted};`);
    hint.textContent = 'Esc to go back';
    subModeHeader.append(back, title, hint);

    renderMessage('Loading Apex classes...');

    if (!currentCtx) {
      renderMessage('No Salesforce context available', tokens.color.error);
      return;
    }

    try {
      const response = await sendMessage('executeToolingQuery', {
        instanceUrl: currentCtx.pageContext.instanceUrl,
        query: `SELECT Id, Name, ApiVersion, Status, NamespacePrefix, LengthWithoutComments FROM ApexClass ORDER BY Name`,
      });
      const records = (response?.records ?? []) as ApexClassRecord[];
      apexClassCommands = apexClassesToCommands(records);
      renderResults(apexClassCommands.slice(0, 15));
    } catch (e: any) {
      renderMessage(`Failed to load Apex classes: ${e?.message ?? 'Unknown error'}`, tokens.color.error);
    }
  }

  async function enterApexTriggerSearch() {
    mode = 'apex-trigger-search';
    input.value = '';
    input.placeholder = 'Type trigger name...';
    selectedIndex = 0;
    quickActionBar.style.display = 'none';

    subModeHeader.style.display = 'flex';
    subModeHeader.textContent = '';
    const back = document.createElement('span');
    back.textContent = '\u2190';
    const title = document.createElement('span');
    title.textContent = '\u{2699} Find Apex Trigger';
    const hint = document.createElement('span');
    hint.setAttribute('style', `margin-left: auto; font-size: ${tokens.font.size.sm}; color: ${tokens.color.textMuted};`);
    hint.textContent = 'Esc to go back';
    subModeHeader.append(back, title, hint);

    renderMessage('Loading Apex triggers...');

    if (!currentCtx) {
      renderMessage('No Salesforce context available', tokens.color.error);
      return;
    }

    try {
      const response = await sendMessage('executeToolingQuery', {
        instanceUrl: currentCtx.pageContext.instanceUrl,
        query: `SELECT Id, Name, ApiVersion, Status, NamespacePrefix, TableEnumOrId FROM ApexTrigger ORDER BY Name`,
      });
      const records = (response?.records ?? []) as ApexTriggerRecord[];
      apexTriggerCommands = apexTriggersToCommands(records);
      renderResults(apexTriggerCommands.slice(0, 15));
    } catch (e: any) {
      renderMessage(`Failed to load Apex triggers: ${e?.message ?? 'Unknown error'}`, tokens.color.error);
    }
  }

  function enterSoqlQuery() {
    mode = 'soql-query';
    input.value = '';
    input.placeholder = 'Type a SOQL query and press Enter...';
    selectedIndex = 0;
    soqlResultCommands = [];
    soqlExecuted = false;
    quickActionBar.style.display = 'none';

    subModeHeader.style.display = 'flex';
    subModeHeader.textContent = '';
    const back = document.createElement('span');
    back.textContent = '\u2190';
    const title = document.createElement('span');
    title.textContent = '\u{1F4C4} Quick SOQL';
    const hint = document.createElement('span');
    hint.setAttribute('style', `margin-left: auto; font-size: ${tokens.font.size.sm}; color: ${tokens.color.textMuted};`);
    hint.textContent = 'Enter to execute \u00b7 Esc to go back';
    subModeHeader.append(back, title, hint);

    renderMessage('Type a SOQL query and press Enter to execute');
  }

  async function executeSoqlQuery() {
    const query = input.value.trim();
    if (!query) return;

    if (!currentCtx) {
      renderMessage('No Salesforce context available', tokens.color.error);
      return;
    }

    renderMessage('Executing query...');

    try {
      const response = await sendMessage('executeSOQL', {
        instanceUrl: currentCtx.pageContext.instanceUrl,
        query,
      });
      const records = response?.records ?? [];
      const totalSize = response?.totalSize ?? records.length;
      soqlResultCommands = soqlRecordsToCommands(records);
      soqlExecuted = true;

      if (records.length === 0) {
        renderMessage('Query returned 0 records');
      } else {
        const hintEl = subModeHeader.querySelector('span:last-child') as HTMLElement | null;
        if (hintEl) hintEl.textContent = `${totalSize} record${totalSize !== 1 ? 's' : ''} \u00b7 Click to copy ID`;
        renderResults(soqlResultCommands);
      }
    } catch (e: any) {
      soqlExecuted = false;
      renderMessage(`Query failed: ${e?.message ?? 'Unknown error'}`, tokens.color.error);
    }
  }

  async function handleToggleDebugLog() {
    if (!currentCtx) {
      showToast('No Salesforce context available');
      return;
    }

    const paletteOpen = !!document.getElementById(PALETTE_ID);
    if (paletteOpen) renderMessage('Toggling debug log...');

    try {
      const result = await sendMessage('toggleDebugLog', {
        instanceUrl: currentCtx.pageContext.instanceUrl,
      });

      if (paletteOpen) closePalette();

      if (result.active) {
        const expiresIn = result.expirationDate
          ? ` (expires ${new Date(result.expirationDate).toLocaleTimeString()})`
          : '';
        showToast(`Debug logging enabled${expiresIn}`);
      } else {
        showToast('Debug logging disabled');
      }
    } catch (e: any) {
      if (paletteOpen) closePalette();
      showToast(`Debug log toggle failed: ${e?.message ?? 'Unknown error'}`);
    }
  }

  function enterSubModeByName(subModeName: string) {
    switch (subModeName) {
      case 'flow-search': enterFlowSearch(); break;
      case 'profile-search': enterProfileSearch(); break;
      case 'permset-search': enterPermSetSearch(); break;
      case 'apex-class-search': enterApexClassSearch(); break;
      case 'apex-trigger-search': enterApexTriggerSearch(); break;
      case 'soql-query': enterSoqlQuery(); break;
      default: return;
    }
    input.focus();
  }

  function exitSubMode() {
    mode = 'commands';
    flowCommands = [];
    profileCommands = [];
    permSetCommands = [];
    apexClassCommands = [];
    apexTriggerCommands = [];
    soqlResultCommands = [];
    soqlExecuted = false;
    quickActionBar.style.display = 'flex';
    input.value = '';
    input.placeholder = 'Search Setup pages, actions...';
    selectedIndex = 0;
    subModeHeader.style.display = 'none';
    renderResults(SETUP_COMMANDS.slice(0, 10));
    input.focus();
  }

  function executeCommand(cmd: PaletteCommand, newTab = false) {
    if (cmd.id === 'toggle-debug-log') {
      handleToggleDebugLog();
      return;
    }
    if (cmd.subMode) {
      enterSubModeByName(cmd.subMode);
      return;
    }

    closePalette();
    if (cmd.action) {
      cmd.action();
    } else if (cmd.path) {
      if (newTab) {
        window.open(cmd.path, '_blank');
      } else {
        window.location.href = cmd.path;
      }
    }
  }

  function closePalette() {
    const el = document.getElementById(PALETTE_ID);
    if (el) {
      el.style.opacity = '0';
      const cardEl = el.querySelector('div');
      if (cardEl) {
        cardEl.style.transform = 'scale(0.98) translateY(-10px)';
      }
      setTimeout(() => el.remove(), 150);
    }
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

    if (mode === 'profile-search') {
      if (!query) {
        renderResults(profileCommands.slice(0, 15));
      } else {
        renderResults(fuzzySearch(query, profileCommands, 15));
      }
      return;
    }

    if (mode === 'permset-search') {
      if (!query) {
        renderResults(permSetCommands.slice(0, 15));
      } else {
        renderResults(fuzzySearch(query, permSetCommands, 15));
      }
      return;
    }

    if (mode === 'apex-class-search') {
      if (!query) {
        renderResults(apexClassCommands.slice(0, 15));
      } else {
        renderResults(fuzzySearch(query, apexClassCommands, 15));
      }
      return;
    }

    if (mode === 'apex-trigger-search') {
      if (!query) {
        renderResults(apexTriggerCommands.slice(0, 15));
      } else {
        renderResults(fuzzySearch(query, apexTriggerCommands, 15));
      }
      return;
    }

    if (mode === 'soql-query') {
      if (soqlExecuted) {
        soqlExecuted = false;
        soqlResultCommands = [];
        renderMessage('Edit query and press Enter to execute again');
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
      const newTab = e.ctrlKey || e.metaKey;
      if (mode === 'soql-query' && !soqlExecuted) {
        executeSoqlQuery();
      } else {
        const cmd = currentCommands[selectedIndex];
        if (cmd) executeCommand(cmd, newTab);
      }
    } else if (mode === 'commands' && input.value === '' && /^[1-9]$/.test(e.key)) {
      const matched = activeQuickActions.find((qa) => qa.key === e.key);
      if (matched) {
        e.preventDefault();
        activateQuickAction(matched, e.ctrlKey || e.metaKey);
      }
    }
  });

  results.addEventListener('click', (e) => {
    const item = (e.target as HTMLElement).closest('[data-index]') as HTMLElement | null;
    if (item) {
      const idx = parseInt(item.dataset.index ?? '0', 10);
      const cmd = currentCommands[idx];
      if (cmd) executeCommand(cmd, e.ctrlKey || e.metaKey);
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

  async init(ctx: ModuleContext) {
    if (window.top !== window.self) return;
    currentCtx = ctx;
    document.addEventListener('sfboost:toggle-palette', togglePalette);
    // Also allow Ctrl+Shift+S directly from page
    document.addEventListener('keydown', handleKeydown);
  },

  async onNavigate(ctx: ModuleContext) {
    if (window.top !== window.self) return;
    currentCtx = ctx;
  },

  destroy() {
    if (window.top !== window.self) return;
    document.removeEventListener('sfboost:toggle-palette', togglePalette);
    document.removeEventListener('keydown', handleKeydown);
    const existing = document.getElementById(PALETTE_ID);
    if (existing) existing.remove();
  },
};

function handleKeydown(e: KeyboardEvent) {
  if (isShortcutEditableTarget(e.target)) return;
  if (e.altKey && e.shiftKey && e.key === 'S') {
    e.preventDefault();
    togglePalette();
  }
}

registry.register(commandPalette);
