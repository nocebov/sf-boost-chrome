export type ModuleAccessLevel = 'ui-only' | 'read-only' | 'write-capable';

export interface ModuleSettingDef {
  key: string;
  label: string;
  type: 'boolean';
  default: boolean;
}

export interface ModuleCatalogEntry {
  id: string;
  name: string;
  description: string;
  info: string;
  defaultEnabled: boolean;
  accessLevel: ModuleAccessLevel;
  settings?: ModuleSettingDef[];
}

export const MODULE_CATALOG: ModuleCatalogEntry[] = [
  {
    id: 'command-palette',
    name: 'Command Palette',
    description: 'Quick navigation and tools',
    info: 'Quick access to Setup pages, Apex classes, triggers, flows, profiles, permission sets. Toggle Debug Log creates/deletes TraceFlags. Quick SOQL executes queries.',
    defaultEnabled: true,
    accessLevel: 'write-capable',
  },
  {
    id: 'field-inspector',
    name: 'Field Inspector',
    description: 'Show API names and metadata on fields',
    info: 'Reveals API names next to record fields and list-view columns. Click a badge for field metadata, copy helpers, and a shortcut to the field in Object Manager. Uses Salesforce describe metadata from the active org only when the module is enabled.',
    defaultEnabled: true,
    accessLevel: 'read-only',
    settings: [
      { key: 'showOnRecords', label: 'Show on record pages', type: 'boolean', default: true },
      { key: 'showOnListViews', label: 'Show on list views', type: 'boolean', default: true },
      { key: 'showFieldUsage', label: 'Show field usage % in popover', type: 'boolean', default: true },
    ],
  },
  {
    id: 'quick-copy',
    name: 'Quick Copy',
    description: 'Copy record IDs and values',
    info: 'Adds a fast copy icon next to Record IDs and names. Click the icon to copy the value locally to the clipboard.',
    defaultEnabled: true,
    accessLevel: 'ui-only',
    settings: [
      { key: 'copyId', label: 'Copy button on record pages', type: 'boolean', default: true },
      { key: 'copyName', label: 'Copy buttons on list views', type: 'boolean', default: true },
    ],
  },
  {
    id: 'table-filter',
    name: 'Table Filter',
    description: 'Quick search for Salesforce tables',
    info: 'Works on Setup list views. Adds a search box above the table to instantly filter rows on the client side. Includes a "Load All" button for lazy-loaded tables like Object Manager fields.',
    defaultEnabled: true,
    accessLevel: 'ui-only',
  },
  {
    id: 'environment-safeguard',
    name: 'Environment Safeguard',
    description: 'Color-coded environment indicator, favicon, and org clock',
    info: 'Displays a colored indicator on screen, recolors the Salesforce tab favicon by environment, and shows a live clock for the org\'s default timezone. Helps visually distinguish Production from Sandbox to avoid accidental changes.',
    defaultEnabled: true,
    accessLevel: 'read-only',
    settings: [
      { key: 'showClock', label: 'Show org clock', type: 'boolean', default: true },
      { key: 'showFavicon', label: 'Show colored favicon', type: 'boolean', default: true },
      { key: 'showTitlePrefix', label: 'Show environment prefix in tab title', type: 'boolean', default: true },
    ],
  },
  {
    id: 'deep-dependency-inspector',
    name: 'Dependency Inspector',
    description: 'Tooling API dependency scan for Salesforce components',
    info: 'Appears on Object Manager fields, Validation Rules, Apex Classes, Apex Triggers, Flows, LWC, and Aura pages. Shows what uses this component and what it depends on. Uses Salesforce Tooling API against the active org only after you click Deep Scan.',
    defaultEnabled: false,
    accessLevel: 'read-only',
  },
  {
    id: 'change-set-buddy',
    name: 'Change Set Buddy',
    description: 'Enhanced Change Set experience',
    info: 'Enhances native Change Sets UI in Setup. Gives sorting, search, and bulk selection capabilities when adding components.',
    defaultEnabled: false,
    accessLevel: 'ui-only',
  },
  {
    id: 'profile-to-permset',
    name: 'Profile to Permission Set',
    description: 'Extract Profile permissions to a Permission Set',
    info: 'Works on Profile pages in Setup. Reads permissions and creates the new Permission Set in the same Salesforce org using your current session only after you start the wizard.',
    defaultEnabled: false,
    accessLevel: 'write-capable',
  },
  {
    id: 'bulk-check',
    name: 'Bulk Check',
    description: 'Check All / Uncheck All for Setup tables',
    info: 'Adds "Check All" and "Uncheck All" buttons above checkbox columns on Profile, Permission Set, and other Setup edit pages. Pure client-side DOM manipulation — no API calls.',
    defaultEnabled: false,
    accessLevel: 'ui-only',
  },
  {
    id: 'org-limits',
    name: 'Org Limits',
    description: 'View API limits, storage, and usage for the current org',
    info: 'Opens a dashboard showing your Salesforce org limits including API call usage, data storage, and other quotas. Accessible via Command Palette quick action.',
    defaultEnabled: false,
    accessLevel: 'read-only',
  },
  {
    id: 'hide-devops-bar',
    name: 'Hide DevOps Center Bar',
    description: 'Hide the DevOps Center bottom bar',
    info: 'Hides the persistent DevOps Center bar on all Salesforce pages. Disabled by default to avoid surprising changes to the native Salesforce UI.',
    defaultEnabled: false,
    accessLevel: 'ui-only',
  },
];

export const DEFAULT_ENABLED_MODULE_IDS = MODULE_CATALOG
  .filter((module) => module.defaultEnabled)
  .map((module) => module.id);

export const DISABLED_BY_DEFAULT_MODULE_IDS = MODULE_CATALOG
  .filter((module) => !module.defaultEnabled)
  .map((module) => module.id);
