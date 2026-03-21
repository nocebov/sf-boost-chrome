import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';
import { sendMessage } from '../../lib/messaging';
import { tokens } from '../../lib/design-tokens';
import { createModal, createSpinner, createButton, createInput } from '../../lib/ui-helpers';

const MODAL_ID = 'sfboost-org-limits';
const EVENT_NAME = 'sfboost:show-org-limits';

let currentCtx: ModuleContext | null = null;
let modalCleanup: (() => void) | null = null;

interface LimitEntry {
  name: string;
  max: number;
  remaining: number;
  used: number;
  pct: number;
}

const LIMIT_GROUPS: Record<string, string[]> = {
  'API': [
    'DailyApiRequests', 'DailyBulkApiRequests', 'DailyBulkV2QueryFileStorageMB',
    'DailyBulkV2QueryJobs', 'DailyStreamingApiEvents', 'DailyGenericStreamingApiEvents',
    'HourlyAsyncReportRuns', 'HourlySyncReportRuns', 'HourlyDashboardRefreshes',
    'HourlyDashboardResults', 'HourlyDashboardStatuses', 'HourlyODataCallout',
    'HourlyTimeBasedWorkflow', 'DailyAsyncApexExecutions', 'DailyAsyncApexTests',
  ],
  'Storage': ['DataStorageMB', 'FileStorageMB'],
  'Email': ['SingleEmail', 'MassEmail', 'DailyWorkflowEmails'],
  'Other': [],
};

function categorizeLimits(
  raw: Record<string, { Max: number; Remaining: number }>,
): { group: string; entries: LimitEntry[] }[] {
  const knownNames = new Set(Object.values(LIMIT_GROUPS).flat());
  const groups: { group: string; entries: LimitEntry[] }[] = [];

  for (const [groupName, names] of Object.entries(LIMIT_GROUPS)) {
    if (groupName === 'Other') continue;
    const entries: LimitEntry[] = [];
    for (const name of names) {
      const limit = raw[name];
      if (!limit) continue;
      const used = limit.Max - limit.Remaining;
      entries.push({
        name,
        max: limit.Max,
        remaining: limit.Remaining,
        used: limit.Max > 0 ? used : 0,
        pct: limit.Max > 0 ? Math.round((used / limit.Max) * 100) : 0,
      });
    }
    if (entries.length > 0) groups.push({ group: groupName, entries });
  }

  // Collect "Other" — all limits not in named groups, that have Max > 0
  const otherEntries: LimitEntry[] = [];
  for (const [name, limit] of Object.entries(raw)) {
    if (knownNames.has(name)) continue;
    if (limit.Max === 0 && limit.Remaining === 0) continue;
    const used = limit.Max - limit.Remaining;
    otherEntries.push({
      name,
      max: limit.Max,
      remaining: limit.Remaining,
      used: limit.Max > 0 ? used : 0,
      pct: limit.Max > 0 ? Math.round((used / limit.Max) * 100) : 0,
    });
  }
  if (otherEntries.length > 0) {
    otherEntries.sort((a, b) => b.pct - a.pct);
    groups.push({ group: 'Other', entries: otherEntries });
  }

  return groups;
}

function getBarColor(pctUsed: number): string {
  if (pctUsed < 50) return tokens.color.success;
  if (pctUsed < 80) return tokens.color.warning;
  return tokens.color.error;
}

function humanizeName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/MB$/, ' (MB)')
    .replace(/^(Daily|Hourly)/, '$1 ');
}

function renderLimitRow(entry: LimitEntry): HTMLDivElement {
  const row = document.createElement('div');
  row.setAttribute('style', `
    display: flex; flex-direction: column; gap: 2px;
    padding: ${tokens.space.sm} 0;
  `);
  row.dataset.limitName = entry.name.toLowerCase();

  const top = document.createElement('div');
  top.setAttribute('style', `
    display: flex; justify-content: space-between; align-items: center;
    font-size: ${tokens.font.size.sm}; font-family: ${tokens.font.family.sans};
  `);

  const label = document.createElement('span');
  label.textContent = humanizeName(entry.name);
  label.setAttribute('style', `color: ${tokens.color.textPrimary}; font-weight: ${tokens.font.weight.medium};`);

  const value = document.createElement('span');
  if (entry.max === 0) {
    value.textContent = 'Unlimited';
    value.setAttribute('style', `color: ${tokens.color.textMuted}; font-size: ${tokens.font.size.xs};`);
  } else {
    value.textContent = `${entry.used.toLocaleString()} / ${entry.max.toLocaleString()} (${entry.pct}%)`;
    value.setAttribute('style', `color: ${tokens.color.textSecondary}; font-size: ${tokens.font.size.xs};`);
  }

  top.append(label, value);
  row.appendChild(top);

  if (entry.max > 0) {
    const barBg = document.createElement('div');
    barBg.setAttribute('style', `
      width: 100%; height: 4px;
      background: ${tokens.color.surfaceSubtle};
      border-radius: ${tokens.radius.pill};
      overflow: hidden;
    `);

    const barFill = document.createElement('div');
    barFill.setAttribute('style', `
      width: ${entry.pct}%; height: 100%;
      background: ${getBarColor(entry.pct)};
      border-radius: ${tokens.radius.pill};
      transition: width 0.3s ease;
    `);
    barBg.appendChild(barFill);
    row.appendChild(barBg);
  }

  return row;
}

function renderGroupSection(group: string, entries: LimitEntry[]): HTMLDivElement {
  const section = document.createElement('div');
  section.setAttribute('style', `
    display: flex; flex-direction: column;
    gap: ${tokens.space.xs};
  `);
  section.dataset.groupName = group.toLowerCase();

  const heading = document.createElement('h3');
  heading.textContent = group;
  heading.setAttribute('style', `
    margin: 0; padding: ${tokens.space.sm} 0 0 0;
    font-size: ${tokens.font.size.base};
    font-weight: ${tokens.font.weight.semibold};
    color: ${tokens.color.textPrimary};
    font-family: ${tokens.font.family.sans};
    border-bottom: 1px solid ${tokens.color.borderDefault};
    padding-bottom: ${tokens.space.xs};
  `);
  section.appendChild(heading);

  for (const entry of entries) {
    section.appendChild(renderLimitRow(entry));
  }

  return section;
}

function closeModal(): void {
  if (modalCleanup) {
    modalCleanup();
    modalCleanup = null;
  }
}

async function showOrgLimits(): Promise<void> {
  if (!currentCtx) return;
  closeModal();

  const { instanceUrl } = currentCtx.pageContext;
  const { backdrop, card, close } = createModal(MODAL_ID, { width: '560px' });
  modalCleanup = close;

  // Title bar
  const titleBar = document.createElement('div');
  titleBar.setAttribute('style', `
    display: flex; justify-content: space-between; align-items: center;
    padding: ${tokens.space.xl};
    border-bottom: 1px solid ${tokens.color.borderDefault};
  `);

  const title = document.createElement('h2');
  title.textContent = 'Org Limits';
  title.setAttribute('style', `
    margin: 0;
    font-size: ${tokens.font.size.lg};
    font-weight: ${tokens.font.weight.semibold};
    color: ${tokens.color.textPrimary};
    font-family: ${tokens.font.family.sans};
  `);

  const refreshBtn = createButton('Refresh', { primary: false, small: true });
  titleBar.append(title, refreshBtn);
  card.appendChild(titleBar);

  // Search
  const searchWrap = document.createElement('div');
  searchWrap.setAttribute('style', `padding: ${tokens.space.md} ${tokens.space.xl} 0;`);
  const searchInput = createInput({ placeholder: 'Filter limits...' });
  searchWrap.appendChild(searchInput);
  card.appendChild(searchWrap);

  // Content area
  const content = document.createElement('div');
  content.setAttribute('style', `
    padding: ${tokens.space.md} ${tokens.space.xl} ${tokens.space.xl};
    overflow-y: auto;
    max-height: 60vh;
    display: flex; flex-direction: column;
    gap: ${tokens.space.md};
  `);
  card.appendChild(content);

  // Loading
  const spinnerWrap = document.createElement('div');
  spinnerWrap.setAttribute('style', `display: flex; justify-content: center; padding: ${tokens.space['2xl']};`);
  spinnerWrap.appendChild(createSpinner());
  content.appendChild(spinnerWrap);

  document.body.appendChild(backdrop);

  const loadLimits = async () => {
    content.textContent = '';
    const loading = document.createElement('div');
    loading.setAttribute('style', `display: flex; justify-content: center; padding: ${tokens.space['2xl']};`);
    loading.appendChild(createSpinner());
    content.appendChild(loading);

    try {
      const raw = await sendMessage('getOrgLimits', { instanceUrl });
      content.textContent = '';

      const groups = categorizeLimits(raw);
      if (groups.length === 0) {
        const empty = document.createElement('div');
        empty.textContent = 'No limits data available';
        empty.setAttribute('style', `
          color: ${tokens.color.textMuted};
          font-size: ${tokens.font.size.base};
          text-align: center;
          padding: ${tokens.space['2xl']};
        `);
        content.appendChild(empty);
        return;
      }

      for (const { group, entries } of groups) {
        content.appendChild(renderGroupSection(group, entries));
      }
    } catch (error) {
      content.textContent = '';
      const errEl = document.createElement('div');
      errEl.textContent = `Failed to load limits: ${error instanceof Error ? error.message : 'Unknown error'}`;
      errEl.setAttribute('style', `
        color: ${tokens.color.error};
        font-size: ${tokens.font.size.base};
        text-align: center;
        padding: ${tokens.space['2xl']};
      `);
      content.appendChild(errEl);
    }
  };

  // Filter handler
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.toLowerCase().trim();
    const rows = content.querySelectorAll<HTMLDivElement>('[data-limit-name]');
    const sections = content.querySelectorAll<HTMLDivElement>('[data-group-name]');

    for (const row of rows) {
      const name = row.dataset.limitName ?? '';
      row.style.display = query && !name.includes(query) ? 'none' : '';
    }

    for (const section of sections) {
      const visibleRows = section.querySelectorAll<HTMLDivElement>('[data-limit-name]:not([style*="display: none"])');
      section.style.display = query && visibleRows.length === 0 ? 'none' : '';
    }
  });

  refreshBtn.addEventListener('click', () => void loadLimits());

  void loadLimits();
}

function handleShowLimits(): void {
  void showOrgLimits();
}

const orgLimitsModule: SFBoostModule = {
  id: 'org-limits',
  name: 'Org Limits',
  description: 'View API limits, storage, and usage for the current org',

  async init(ctx: ModuleContext) {
    currentCtx = ctx;
    document.addEventListener(EVENT_NAME, handleShowLimits);
  },

  async onNavigate(ctx: ModuleContext) {
    currentCtx = ctx;
  },

  destroy() {
    document.removeEventListener(EVENT_NAME, handleShowLimits);
    closeModal();
    currentCtx = null;
  },
};

registry.register(orgLimitsModule);
