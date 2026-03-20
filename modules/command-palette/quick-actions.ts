import { tokens } from '../../lib/design-tokens';
import { createButton, createInput } from '../../lib/ui-helpers';
import {
  getQuickActionConfig,
  setQuickActionConfig,
  resetQuickActionConfig,
  type CustomQuickAction,
  type QuickActionConfig,
} from '../../lib/storage';
import { showToast } from '../../lib/toast';

export interface QuickAction {
  key: string;
  label: string;
  icon: string;
  subMode?: string;
  actionId?: string;
  customUrl?: string;
  customId?: string;
  builtInId?: string;
}

export const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  { key: '1', label: 'Profiles', icon: '\u{1F511}', subMode: 'profile-search', builtInId: 'profile' },
  { key: '2', label: 'Perm Sets', icon: '\u{1F6E1}\u{FE0F}', subMode: 'permset-search', builtInId: 'permset' },
  { key: '3', label: 'Flows', icon: '\u{26A1}', subMode: 'flow-search', builtInId: 'flow' },
  { key: '4', label: 'Classes', icon: '\u{1F4BB}', subMode: 'apex-class-search', builtInId: 'class' },
  { key: '5', label: 'Triggers', icon: '\u{2699}\u{FE0F}', subMode: 'apex-trigger-search', builtInId: 'trigger' },
  { key: '6', label: 'Debug Log', icon: '\u{1F41E}', actionId: 'toggle-debug-log', builtInId: 'debug' },
];

export async function loadQuickActions(): Promise<QuickAction[]> {
  try {
    const config = await getQuickActionConfig();

    const builtIn = DEFAULT_QUICK_ACTIONS.filter(
      (qa) => !config.hiddenBuiltInIds.includes(qa.builtInId!),
    );

    const custom: QuickAction[] = config.customActions.map((ca) => ({
      key: '',
      label: ca.label,
      icon: ca.icon || '\u{1F517}',
      customUrl: ca.url,
      customId: ca.id,
    }));

    const merged = [...builtIn, ...custom];

    merged.forEach((qa, i) => {
      qa.key = i < 9 ? String(i + 1) : '';
    });

    return merged;
  } catch (error) {
    console.error('SF Boost: failed to load quick actions, using defaults', error);
    return DEFAULT_QUICK_ACTIONS.map((qa, index) => ({
      ...qa,
      key: index < 9 ? String(index + 1) : '',
    }));
  }
}

export function renderQuickActionBar(
  container: HTMLDivElement,
  actions: QuickAction[],
  onActivate: (qa: QuickAction) => void,
  onEditToggle: () => void,
  editMode: boolean,
): void {
  container.textContent = '';

  const label = document.createElement('span');
  label.textContent = editMode ? 'Edit:' : 'Search in:';
  label.setAttribute(
    'style',
    `
    font-size: ${tokens.font.size.sm};
    color: ${tokens.color.primary};
    font-weight: ${tokens.font.weight.medium};
    white-space: nowrap;
    padding-right: ${tokens.space.xs};
    align-self: center;
  `,
  );
  container.appendChild(label);

  for (const qa of actions) {
    const isSearchable = Boolean(qa.subMode);
    const pill = document.createElement('button');
    pill.setAttribute(
      'style',
      `
      display: inline-flex; align-items: center; gap: ${tokens.space.xs};
      padding: ${tokens.space.xs} ${tokens.space.lg};
      border: 1px solid ${isSearchable ? tokens.color.primaryBorder : tokens.color.borderDefault};
      border-radius: ${tokens.radius.pill};
      background: ${tokens.color.surfaceBase};
      color: ${tokens.color.textSecondary};
      font-size: ${tokens.font.size.sm};
      font-family: ${tokens.font.family.sans};
      cursor: pointer;
      white-space: nowrap;
      transition: background ${tokens.transition.fast}, border-color ${tokens.transition.fast};
      position: relative;
    `,
    );

    const iconSpan = document.createElement('span');
    iconSpan.textContent = qa.icon;
    iconSpan.setAttribute('style', `font-size: ${tokens.font.size.sm};`);

    const labelSpan = document.createElement('span');
    labelSpan.textContent = qa.label;

    pill.append(iconSpan, labelSpan);

    if (qa.key && !editMode) {
      const kbd = document.createElement('kbd');
      kbd.textContent = qa.key;
      kbd.setAttribute(
        'style',
        `
        font-size: ${tokens.font.size.xs};
        font-family: ${tokens.font.family.sans};
        background: ${tokens.color.surfaceSubtle};
        color: ${tokens.color.textMuted};
        border: 1px solid ${tokens.color.borderDefault};
        border-radius: ${tokens.radius.xs};
        padding: 0 ${tokens.space.xs};
        line-height: 1.4;
        margin-left: 2px;
      `,
      );
      pill.appendChild(kbd);
    }

    if (editMode) {
      const deleteBtn = document.createElement('span');
      deleteBtn.textContent = '\u00D7';
      deleteBtn.setAttribute(
        'style',
        `
        margin-left: 2px;
        font-size: ${tokens.font.size.md};
        color: ${tokens.color.error};
        cursor: pointer;
        font-weight: ${tokens.font.weight.bold};
        line-height: 1;
      `,
      );
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleDeleteAction(qa, container, actions, onActivate, onEditToggle);
      });
      pill.appendChild(deleteBtn);
    } else {
      pill.addEventListener('mouseenter', () => {
        pill.style.background = tokens.color.surfaceSelected;
        pill.style.borderColor = tokens.color.primaryBorder;
      });
      pill.addEventListener('mouseleave', () => {
        pill.style.background = tokens.color.surfaceBase;
        pill.style.borderColor = isSearchable ? tokens.color.primaryBorder : tokens.color.borderDefault;
      });
      pill.addEventListener('click', () => onActivate(qa));
    }

    container.appendChild(pill);
  }

  if (editMode) {
    const addPill = document.createElement('button');
    addPill.textContent = '+';
    addPill.title = 'Add custom action';
    addPill.setAttribute(
      'style',
      `
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px;
      border: 1px dashed ${tokens.color.borderMuted};
      border-radius: ${tokens.radius.pill};
      background: ${tokens.color.surfaceBase};
      color: ${tokens.color.textMuted};
      font-size: ${tokens.font.size.md};
      cursor: pointer;
      transition: background ${tokens.transition.fast}, border-color ${tokens.transition.fast}, color ${tokens.transition.fast};
    `,
    );
    addPill.addEventListener('mouseenter', () => {
      addPill.style.background = tokens.color.surfaceSelected;
      addPill.style.borderColor = tokens.color.primaryBorder;
      addPill.style.color = tokens.color.primary;
    });
    addPill.addEventListener('mouseleave', () => {
      addPill.style.background = tokens.color.surfaceBase;
      addPill.style.borderColor = tokens.color.borderMuted;
      addPill.style.color = tokens.color.textMuted;
    });
    addPill.addEventListener('click', () => {
      const event = new CustomEvent('sfboost:qa-show-add-form');
      container.dispatchEvent(event);
    });
    container.appendChild(addPill);

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.title = 'Reset to defaults';
    resetBtn.setAttribute(
      'style',
      `
      margin-left: auto;
      background: none; border: none;
      font-size: ${tokens.font.size.sm};
      color: ${tokens.color.textMuted};
      cursor: pointer;
      text-decoration: underline;
      font-family: ${tokens.font.family.sans};
      transition: color ${tokens.transition.fast};
    `,
    );
    resetBtn.addEventListener('mouseenter', () => {
      resetBtn.style.color = tokens.color.textPrimary;
    });
    resetBtn.addEventListener('mouseleave', () => {
      resetBtn.style.color = tokens.color.textMuted;
    });
    resetBtn.addEventListener('click', async () => {
      await resetQuickActionConfig();
      showToast('Quick actions reset to defaults');
      const event = new CustomEvent('sfboost:qa-config-changed');
      container.dispatchEvent(event);
    });
    container.appendChild(resetBtn);
  }

  // Edit/Done toggle button (always at the end, after Reset in edit mode)
  const editBtn = document.createElement('button');
  editBtn.title = editMode ? 'Done editing' : 'Customize quick actions';
  editBtn.textContent = editMode ? '\u2713' : '\u270E';
  editBtn.setAttribute(
    'style',
    `
    ${editMode ? '' : 'margin-left: auto;'}
    background: none; border: none;
    font-size: ${tokens.font.size.md};
    cursor: pointer;
    padding: ${tokens.space.xs};
    color: ${editMode ? tokens.color.success : tokens.color.textMuted};
    transition: color ${tokens.transition.fast};
  `,
  );
  editBtn.addEventListener('mouseenter', () => {
    editBtn.style.color = editMode ? tokens.color.successText : tokens.color.textPrimary;
  });
  editBtn.addEventListener('mouseleave', () => {
    editBtn.style.color = editMode ? tokens.color.success : tokens.color.textMuted;
  });
  editBtn.addEventListener('click', onEditToggle);
  container.appendChild(editBtn);
}

async function handleDeleteAction(
  qa: QuickAction,
  container: HTMLDivElement,
  actions: QuickAction[],
  onActivate: (qa: QuickAction) => void,
  onEditToggle: () => void,
): Promise<void> {
  const config = await getQuickActionConfig();

  if (qa.builtInId) {
    config.hiddenBuiltInIds.push(qa.builtInId);
  } else if (qa.customId) {
    config.customActions = config.customActions.filter((ca) => ca.id !== qa.customId);
  }

  await setQuickActionConfig(config);

  const event = new CustomEvent('sfboost:qa-config-changed');
  container.dispatchEvent(event);
}

export function showAddCustomActionForm(
  resultsContainer: HTMLDivElement,
  onSave: (action: CustomQuickAction) => void,
  onCancel: () => void,
): void {
  resultsContainer.textContent = '';

  const form = document.createElement('div');
  form.setAttribute(
    'style',
    `
    padding: ${tokens.space['2xl']};
    display: flex; flex-direction: column; gap: ${tokens.space.lg};
  `,
  );

  const title = document.createElement('div');
  title.textContent = 'Add custom quick action';
  title.setAttribute(
    'style',
    `
    font-size: ${tokens.font.size.md};
    font-weight: ${tokens.font.weight.semibold};
    color: ${tokens.color.textPrimary};
  `,
  );

  const labelRow = createFormRow('Label', 'e.g. Reports');
  const urlRow = createFormRow('URL', 'e.g. /lightning/o/Report/home');
  const iconRow = createFormRow('Icon (optional)', 'emoji, e.g. \u{1F4CA}');

  const btnRow = document.createElement('div');
  btnRow.setAttribute(
    'style',
    `display: flex; gap: ${tokens.space.md}; justify-content: flex-end;`,
  );

  const cancelBtn = createButton('Cancel', { primary: false, small: true });
  const addBtn = createButton('Add', { primary: true, small: true });

  cancelBtn.addEventListener('click', onCancel);
  addBtn.addEventListener('click', () => {
    const labelVal = labelRow.input.value.trim();
    const urlVal = urlRow.input.value.trim();
    const iconVal = iconRow.input.value.trim();

    if (!labelVal || !urlVal) {
      showToast('Label and URL are required');
      return;
    }

    if (labelVal.length > 40) {
      showToast('Label must be 40 characters or less');
      return;
    }

    if (urlVal.length > 500) {
      showToast('URL must be 500 characters or less');
      return;
    }

    if (!urlVal.startsWith('/') && !urlVal.startsWith('https://') && !urlVal.startsWith('http://')) {
      showToast('URL must start with / or https://');
      return;
    }

    onSave({
      id: `custom-${Date.now()}`,
      label: labelVal,
      url: urlVal,
      icon: iconVal || undefined,
    });
  });

  btnRow.append(cancelBtn, addBtn);
  form.append(title, labelRow.container, urlRow.container, iconRow.container, btnRow);
  resultsContainer.appendChild(form);

  labelRow.input.focus();
}

function createFormRow(
  labelText: string,
  placeholder: string,
): { container: HTMLDivElement; input: HTMLInputElement } {
  const container = document.createElement('div');
  container.setAttribute(
    'style',
    `display: flex; flex-direction: column; gap: ${tokens.space.xs};`,
  );

  const label = document.createElement('label');
  label.textContent = labelText;
  label.setAttribute(
    'style',
    `
    font-size: ${tokens.font.size.sm};
    color: ${tokens.color.textSecondary};
    font-weight: ${tokens.font.weight.medium};
  `,
  );

  const input = createInput({ placeholder });

  container.append(label, input);
  return { container, input };
}
