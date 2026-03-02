import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';
import { sendMessage } from '../../lib/messaging';
import { showToast } from '../../lib/toast';
import { analyzeFlowDefinition, type FlowIssue, type IssueSeverity } from './flow-analyzer';

const PANEL_ID = 'sfboost-flow-guardian-panel';
const COLLAPSED_KEY = 'sfboost-flow-guardian-collapsed';

let currentCtx: ModuleContext | null = null;
let refreshInterval: ReturnType<typeof setInterval> | null = null;
let initTimer: ReturnType<typeof setTimeout> | null = null;

// --- Page Detection ---

function isFlowBuilderPage(): boolean {
  return window.location.pathname.includes('/builder_platform_interaction/flowBuilder.app');
}

function getFlowIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('flowId');
}

// --- Flow Analysis ---

async function analyzeCurrentFlow(): Promise<FlowIssue[]> {
  if (!currentCtx) return [];

  const flowId = getFlowIdFromUrl();
  if (!flowId) {
    showToast('Could not determine Flow ID');
    return [];
  }

  try {
    const result = await sendMessage('executeToolingQuery', {
      instanceUrl: currentCtx.pageContext.instanceUrl,
      query: `SELECT Id, Definition, MasterLabel, Status FROM Flow WHERE Id = '${flowId}' LIMIT 1`,
    });

    if (!result.records?.length) {
      showToast('Flow not found');
      return [];
    }

    const flowRecord = result.records[0];
    let definition: any;

    try {
      definition = JSON.parse(flowRecord.Definition);
    } catch {
      // Definition might be XML for older flows
      showToast('Flow uses legacy format (not analyzable)');
      return [];
    }

    return analyzeFlowDefinition(definition);
  } catch (err: any) {
    showToast(`Analysis error: ${err.message}`);
    return [];
  }
}

// --- Panel UI ---

const SEVERITY_CONFIG: Record<IssueSeverity, { icon: string; color: string; bg: string }> = {
  error:   { icon: '\u{1F534}', color: '#dc2626', bg: '#fef2f2' },
  warning: { icon: '\u{1F7E1}', color: '#d97706', bg: '#fffbeb' },
  info:    { icon: '\u{1F535}', color: '#2563eb', bg: '#eff6ff' },
};

function createPanel(issues: FlowIssue[]): void {
  // Remove existing panel
  document.getElementById(PANEL_ID)?.remove();

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.setAttribute('style', `
    position: fixed;
    top: 60px;
    right: 20px;
    width: 360px;
    max-height: 440px;
    background: #fff;
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    z-index: 99999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    overflow: hidden;
    transition: max-height 0.2s ease;
  `);

  // Header
  const header = document.createElement('div');
  header.setAttribute('style', `
    padding: 12px 16px;
    background: ${issues.length === 0 ? '#f0fdf4' : issues.some(i => i.severity === 'error') ? '#fef2f2' : '#fffbeb'};
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    user-select: none;
  `);

  const headerTitle = document.createElement('span');
  headerTitle.setAttribute('style', 'font-size: 13px; font-weight: 700; color: #181818;');
  if (issues.length === 0) {
    headerTitle.textContent = '\u2705 Flow Guardian: No issues';
  } else {
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warnCount = issues.filter(i => i.severity === 'warning').length;
    const infoCount = issues.filter(i => i.severity === 'info').length;
    const parts = [];
    if (errorCount) parts.push(`${errorCount} error${errorCount > 1 ? 's' : ''}`);
    if (warnCount) parts.push(`${warnCount} warning${warnCount > 1 ? 's' : ''}`);
    if (infoCount) parts.push(`${infoCount} info`);
    headerTitle.textContent = `\u{1F6E1} Flow Guardian: ${parts.join(', ')}`;
  }

  const headerActions = document.createElement('div');
  headerActions.setAttribute('style', 'display: flex; align-items: center; gap: 8px;');

  // Refresh button
  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = '\u{1F504}';
  refreshBtn.title = 'Re-analyze flow';
  refreshBtn.setAttribute('style', `
    border: none; background: none; font-size: 14px; cursor: pointer;
    padding: 2px; line-height: 1; opacity: 0.7;
  `);
  refreshBtn.addEventListener('mouseenter', () => { refreshBtn.style.opacity = '1'; });
  refreshBtn.addEventListener('mouseleave', () => { refreshBtn.style.opacity = '0.7'; });
  refreshBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    refreshBtn.style.animation = 'sfboost-spin 0.6s linear';
    const newIssues = await analyzeCurrentFlow();
    createPanel(newIssues);
  });

  // Collapse/minimize toggle
  const collapseBtn = document.createElement('button');
  collapseBtn.textContent = '\u25BC';
  collapseBtn.title = 'Collapse';
  collapseBtn.setAttribute('style', `
    border: none; background: none; font-size: 10px; cursor: pointer;
    padding: 2px 4px; line-height: 1; color: #706e6b;
  `);

  headerActions.append(refreshBtn, collapseBtn);
  header.append(headerTitle, headerActions);
  panel.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.setAttribute('style', 'overflow-y: auto; max-height: 340px;');

  if (issues.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.setAttribute('style', 'padding: 20px; text-align: center; color: #16a34a; font-size: 13px;');
    emptyMsg.textContent = 'This flow looks clean! No common anti-patterns detected.';
    body.appendChild(emptyMsg);
  } else {
    for (const issue of issues) {
      const config = SEVERITY_CONFIG[issue.severity];
      const item = document.createElement('div');
      item.setAttribute('style', `
        padding: 10px 16px;
        border-bottom: 1px solid #f3f4f6;
        cursor: pointer;
        transition: background 0.1s;
      `);
      item.addEventListener('mouseenter', () => { item.style.background = config.bg; });
      item.addEventListener('mouseleave', () => { item.style.background = ''; });

      const itemHeader = document.createElement('div');
      itemHeader.setAttribute('style', 'display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600;');
      itemHeader.textContent = `${config.icon} ${issue.message}`;

      const itemDetail = document.createElement('div');
      itemDetail.setAttribute('style', `
        font-size: 12px; color: #6b7280; margin-top: 4px;
        line-height: 1.4; display: none;
      `);
      itemDetail.textContent = issue.detail;

      // Toggle detail on click
      item.addEventListener('click', () => {
        itemDetail.style.display = itemDetail.style.display === 'none' ? 'block' : 'none';
      });

      item.append(itemHeader, itemDetail);
      body.appendChild(item);
    }
  }

  panel.appendChild(body);

  // Collapse toggle logic
  let collapsed = false;
  const toggleCollapse = () => {
    collapsed = !collapsed;
    body.style.display = collapsed ? 'none' : 'block';
    collapseBtn.textContent = collapsed ? '\u25B6' : '\u25BC';
    collapseBtn.title = collapsed ? 'Expand' : 'Collapse';
  };

  header.addEventListener('click', toggleCollapse);
  collapseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCollapse();
  });

  document.body.appendChild(panel);

  // Inject spin keyframes if not present
  if (!document.getElementById('sfboost-spinner-keyframes')) {
    const style = document.createElement('style');
    style.id = 'sfboost-spinner-keyframes';
    style.textContent = '@keyframes sfboost-spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }
}

// --- Panel Removal ---

function removePanel(): void {
  document.getElementById(PANEL_ID)?.remove();
}

// --- Auto-refresh ---

function startAutoRefresh(): void {
  stopAutoRefresh();
  // Re-analyze every 30 seconds
  refreshInterval = setInterval(async () => {
    if (!isFlowBuilderPage()) return;
    const issues = await analyzeCurrentFlow();
    createPanel(issues);
  }, 30_000);
}

function stopAutoRefresh(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

// --- Module ---

const flowGuardian: SFBoostModule = {
  id: 'flow-guardian',
  name: 'Flow Guardian',
  description: 'Detect SOQL-in-loop, missing null checks, and other Flow anti-patterns',
  defaultEnabled: false,

  async init(ctx: ModuleContext) {
    currentCtx = ctx;
    if (isFlowBuilderPage()) {
      // Delay to let Flow Builder load
      initTimer = setTimeout(async () => {
        const issues = await analyzeCurrentFlow();
        createPanel(issues);
        startAutoRefresh();
      }, 3000);
    }
  },

  async onNavigate(ctx: ModuleContext) {
    currentCtx = ctx;
    removePanel();
    stopAutoRefresh();
    if (initTimer) { clearTimeout(initTimer); initTimer = null; }

    if (isFlowBuilderPage()) {
      initTimer = setTimeout(async () => {
        const issues = await analyzeCurrentFlow();
        createPanel(issues);
        startAutoRefresh();
      }, 3000);
    }
  },

  destroy() {
    removePanel();
    stopAutoRefresh();
    if (initTimer) { clearTimeout(initTimer); initTimer = null; }
    currentCtx = null;
  },
};

registry.register(flowGuardian);
