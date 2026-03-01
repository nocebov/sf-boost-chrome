export interface PaletteCommand {
  id: string;
  label: string;
  keywords: string[];
  category: string;
  path?: string;
  action?: () => void;
  icon?: string;
}

export const SETUP_COMMANDS: PaletteCommand[] = [
  // Users & Access
  { id: 'users', label: 'Users', keywords: ['manage users', 'user list'], category: 'setup', path: '/lightning/setup/ManageUsers/home', icon: '\u{1F465}' },
  { id: 'profiles', label: 'Profiles', keywords: ['profile', 'permissions'], category: 'setup', path: '/lightning/setup/EnhancedProfiles/home', icon: '\u{1F511}' },
  { id: 'perm-sets', label: 'Permission Sets', keywords: ['permission set', 'access'], category: 'setup', path: '/lightning/setup/PermSets/home', icon: '\u{1F6E1}' },
  { id: 'perm-set-groups', label: 'Permission Set Groups', keywords: ['permission group'], category: 'setup', path: '/lightning/setup/PermSetGroups/home', icon: '\u{1F6E1}' },
  { id: 'roles', label: 'Roles', keywords: ['role hierarchy'], category: 'setup', path: '/lightning/setup/Roles/home', icon: '\u{1F3E2}' },
  { id: 'public-groups', label: 'Public Groups', keywords: ['group'], category: 'setup', path: '/lightning/setup/PublicGroups/home', icon: '\u{1F465}' },
  { id: 'queues', label: 'Queues', keywords: ['queue'], category: 'setup', path: '/lightning/setup/Queues/home', icon: '\u{1F4CB}' },
  { id: 'login-history', label: 'Login History', keywords: ['login', 'audit'], category: 'setup', path: '/lightning/setup/OrgLoginHistory/home', icon: '\u{1F4C5}' },

  // Objects & Fields
  { id: 'obj-manager', label: 'Object Manager', keywords: ['objects', 'fields', 'custom object'], category: 'setup', path: '/lightning/setup/ObjectManager/home', icon: '\u{1F4E6}' },
  { id: 'schema-builder', label: 'Schema Builder', keywords: ['schema', 'ERD', 'relationships'], category: 'setup', path: '/lightning/setup/SchemaBuilder/home', icon: '\u{1F5FA}' },
  { id: 'picklist-values', label: 'Picklist Value Sets', keywords: ['picklist', 'global value set'], category: 'setup', path: '/lightning/setup/Picklists/home', icon: '\u{1F4DD}' },

  // Automation
  { id: 'flows', label: 'Flows', keywords: ['flow builder', 'automation', 'process'], category: 'setup', path: '/lightning/setup/Flows/home', icon: '\u{26A1}' },
  { id: 'process-auto', label: 'Process Automation Settings', keywords: ['process builder', 'workflow'], category: 'setup', path: '/lightning/setup/WorkflowSettings/home', icon: '\u{2699}' },
  { id: 'approval-processes', label: 'Approval Processes', keywords: ['approval'], category: 'setup', path: '/lightning/setup/ApprovalProcesses/home', icon: '\u{2705}' },
  { id: 'scheduled-jobs', label: 'Scheduled Jobs', keywords: ['schedule', 'cron', 'job'], category: 'setup', path: '/lightning/setup/ScheduledJobs/home', icon: '\u{23F0}' },

  // Code
  { id: 'apex-classes', label: 'Apex Classes', keywords: ['apex', 'code', 'class'], category: 'setup', path: '/lightning/setup/ApexClasses/home', icon: '\u{1F4BB}' },
  { id: 'apex-triggers', label: 'Apex Triggers', keywords: ['trigger'], category: 'setup', path: '/lightning/setup/ApexTriggers/home', icon: '\u{2699}' },
  { id: 'vf-pages', label: 'Visualforce Pages', keywords: ['visualforce', 'VF'], category: 'setup', path: '/lightning/setup/ApexPages/home', icon: '\u{1F4C4}' },
  { id: 'vf-components', label: 'Visualforce Components', keywords: ['visualforce component'], category: 'setup', path: '/lightning/setup/ApexComponents/home', icon: '\u{1F9E9}' },
  { id: 'static-resources', label: 'Static Resources', keywords: ['static resource', 'assets'], category: 'setup', path: '/lightning/setup/StaticResources/home', icon: '\u{1F4C1}' },
  { id: 'lwc', label: 'Lightning Components', keywords: ['lightning', 'LWC', 'aura'], category: 'setup', path: '/lightning/setup/LightningComponentBundles/home', icon: '\u{26A1}' },
  { id: 'custom-metadata', label: 'Custom Metadata Types', keywords: ['custom metadata', 'MDT'], category: 'setup', path: '/lightning/setup/CustomMetadata/home', icon: '\u{1F4CB}' },
  { id: 'custom-settings', label: 'Custom Settings', keywords: ['custom setting'], category: 'setup', path: '/lightning/setup/CustomSettings/home', icon: '\u{2699}' },
  { id: 'custom-labels', label: 'Custom Labels', keywords: ['label', 'translation'], category: 'setup', path: '/lightning/setup/ExternalStrings/home', icon: '\u{1F3F7}' },
  { id: 'platform-events', label: 'Platform Events', keywords: ['event', 'CDC'], category: 'setup', path: '/lightning/setup/EventObjects/home', icon: '\u{1F4E1}' },

  // Debug & Logs
  { id: 'debug-logs', label: 'Debug Logs', keywords: ['debug', 'log', 'trace'], category: 'setup', path: '/lightning/setup/ApexDebugLogs/home', icon: '\u{1F50D}' },
  { id: 'dev-console', label: 'Developer Console', keywords: ['developer console', 'query editor'], category: 'action', action: () => window.open('/_ui/common/apex/debug/ApexCSIPage', '_blank'), icon: '\u{1F4BB}' },
  { id: 'apex-test', label: 'Apex Test Execution', keywords: ['test', 'run tests'], category: 'setup', path: '/lightning/setup/ApexTestQueue/home', icon: '\u{1F9EA}' },

  // Deploy & Packages
  { id: 'deploy-status', label: 'Deployment Status', keywords: ['deploy', 'deployment', 'change set'], category: 'setup', path: '/lightning/setup/DeployStatus/home', icon: '\u{1F680}' },
  { id: 'outbound-cs', label: 'Outbound Change Sets', keywords: ['outbound', 'change set', 'deploy'], category: 'setup', path: '/lightning/setup/OutboundChangeSet/home', icon: '\u{1F4E4}' },
  { id: 'inbound-cs', label: 'Inbound Change Sets', keywords: ['inbound', 'receive', 'change set'], category: 'setup', path: '/lightning/setup/InboundChangeSet/home', icon: '\u{1F4E5}' },
  { id: 'installed-packages', label: 'Installed Packages', keywords: ['package', 'managed'], category: 'setup', path: '/lightning/setup/ImportedPackage/home', icon: '\u{1F4E6}' },

  // Security
  { id: 'sharing-settings', label: 'Sharing Settings', keywords: ['OWD', 'sharing rules', 'org-wide defaults'], category: 'setup', path: '/lightning/setup/SecuritySharing/home', icon: '\u{1F512}' },
  { id: 'field-access', label: 'Field Accessibility', keywords: ['field level security', 'FLS'], category: 'setup', path: '/lightning/setup/FieldAccessibility/home', icon: '\u{1F512}' },
  { id: 'session-settings', label: 'Session Settings', keywords: ['session', 'timeout', 'security'], category: 'setup', path: '/lightning/setup/SecuritySession/home', icon: '\u{1F510}' },
  { id: 'named-credentials', label: 'Named Credentials', keywords: ['named credential', 'callout'], category: 'setup', path: '/lightning/setup/NamedCredential/home', icon: '\u{1F511}' },
  { id: 'remote-site', label: 'Remote Site Settings', keywords: ['remote site', 'callout', 'whitelist'], category: 'setup', path: '/lightning/setup/SecurityRemoteProxy/home', icon: '\u{1F310}' },
  { id: 'cors', label: 'CORS', keywords: ['cross-origin', 'CORS'], category: 'setup', path: '/lightning/setup/CorsWhitelistEntries/home', icon: '\u{1F310}' },
  { id: 'connected-apps', label: 'Connected Apps', keywords: ['connected app', 'OAuth'], category: 'setup', path: '/lightning/setup/ConnectedApplication/home', icon: '\u{1F517}' },

  // Email
  { id: 'email-deliverability', label: 'Email Deliverability', keywords: ['email', 'deliverability', 'send'], category: 'setup', path: '/lightning/setup/OrgEmailSettings/home', icon: '\u{1F4E7}' },
  { id: 'email-templates', label: 'Email Templates', keywords: ['email template'], category: 'setup', path: '/lightning/setup/CommunicationTemplatesEmail/home', icon: '\u{1F4E8}' },

  // Data
  { id: 'data-import', label: 'Data Import Wizard', keywords: ['import', 'data loader'], category: 'setup', path: '/lightning/setup/DataManagementDataImporter/home', icon: '\u{1F4E5}' },
  { id: 'mass-delete', label: 'Mass Delete Records', keywords: ['mass delete', 'bulk delete'], category: 'setup', path: '/lightning/setup/DataManagementMassDelete/home', icon: '\u{1F5D1}' },
  { id: 'storage-usage', label: 'Storage Usage', keywords: ['storage', 'space', 'disk'], category: 'setup', path: '/lightning/setup/CompanyResourceDisk/home', icon: '\u{1F4CA}' },

  // UI & Apps
  { id: 'app-manager', label: 'App Manager', keywords: ['app', 'lightning app'], category: 'setup', path: '/lightning/setup/NavigationMenus/home', icon: '\u{1F4F1}' },
  { id: 'lightning-pages', label: 'Lightning App Builder', keywords: ['flexipage', 'app builder', 'page layout'], category: 'setup', path: '/lightning/setup/FlexiPageList/home', icon: '\u{1F3A8}' },
  { id: 'page-layouts', label: 'Page Layouts', keywords: ['layout', 'record page'], category: 'setup', path: '/lightning/setup/ObjectManager/home', icon: '\u{1F4D0}' },
  { id: 'tabs', label: 'Tabs', keywords: ['custom tab'], category: 'setup', path: '/lightning/setup/CustomTabs/home', icon: '\u{1F4D1}' },
  { id: 'record-types', label: 'Record Types', keywords: ['record type'], category: 'setup', path: '/lightning/setup/ObjectManager/home', icon: '\u{1F4D1}' },
  { id: 'global-actions', label: 'Global Actions', keywords: ['global action', 'quick action'], category: 'setup', path: '/lightning/setup/GlobalActions/home', icon: '\u{26A1}' },

  // Company Info
  { id: 'company-info', label: 'Company Information', keywords: ['company', 'org ID', 'licenses'], category: 'setup', path: '/lightning/setup/CompanyProfileInfo/home', icon: '\u{1F3E2}' },
  { id: 'sandbox', label: 'Sandboxes', keywords: ['sandbox', 'environment'], category: 'setup', path: '/lightning/setup/DataManagementCreateTestInstance/home', icon: '\u{1F4E6}' },

  // Reports & Dashboards
  { id: 'report-types', label: 'Report Types', keywords: ['report type', 'custom report'], category: 'setup', path: '/lightning/setup/CustomReportTypes/home', icon: '\u{1F4CA}' },

  // Integration
  { id: 'api', label: 'API', keywords: ['API usage', 'REST', 'SOAP'], category: 'setup', path: '/lightning/setup/ApiUsage/home', icon: '\u{1F310}' },
  { id: 'external-services', label: 'External Services', keywords: ['external service', 'integration'], category: 'setup', path: '/lightning/setup/ExternalServices/home', icon: '\u{1F517}' },

  // Quick actions
  { id: 'action-copy-id', label: 'Copy Current Record ID', keywords: ['copy', 'record ID', 'clipboard'], category: 'action', action: () => {
    const match = window.location.pathname.match(/\/lightning\/r\/\w+\/(\w{15,18})\/view/);
    if (match?.[1]) {
      navigator.clipboard.writeText(match[1]);
      showToast(`Copied: ${match[1]}`);
    } else {
      showToast('No record ID on this page');
    }
  }, icon: '\u{1F4CB}' },
  { id: 'action-copy-url', label: 'Copy Current Page URL', keywords: ['copy', 'URL', 'link'], category: 'action', action: () => {
    navigator.clipboard.writeText(window.location.href);
    showToast('URL copied!');
  }, icon: '\u{1F517}' },
];

function showToast(message: string) {
  const toast = document.createElement('div');
  toast.setAttribute('style', `
    position: fixed; bottom: 20px; left: 50%;
    transform: translateX(-50%);
    background: #1a1a2e; color: #fff;
    padding: 10px 20px; border-radius: 8px;
    font-size: 13px; font-family: -apple-system, sans-serif;
    z-index: 99999999;
    animation: sfboost-toast-in 0.2s ease-out;
  `);
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}
