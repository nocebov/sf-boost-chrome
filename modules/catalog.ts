export type ModuleAccessLevel = 'ui-only' | 'read-only' | 'write-capable';

export interface ModuleCatalogEntry {
  id: string;
  name: string;
  description: string;
  info: string;
  defaultEnabled: boolean;
  accessLevel: ModuleAccessLevel;
}

export const MODULE_CATALOG: ModuleCatalogEntry[] = [
  {
    id: 'command-palette',
    name: 'Command Palette',
    description: 'Quick navigation and tools',
    info: 'Gives quick access to Setup pages and records. Flow Search queries Salesforce only when you explicitly switch into that mode.',
    defaultEnabled: true,
    accessLevel: 'read-only',
  },
  {
    id: 'field-inspector',
    name: 'Field Inspector',
    description: 'Show API names on fields',
    info: 'Reveals API names next to fields on record pages. Uses Salesforce describe metadata from the active org only when you toggle it on.',
    defaultEnabled: true,
    accessLevel: 'read-only',
  },
  {
    id: 'quick-copy',
    name: 'Quick Copy',
    description: 'Copy record IDs and values',
    info: 'Adds a fast copy icon next to Record IDs and names. Click the icon to copy the value locally to the clipboard.',
    defaultEnabled: true,
    accessLevel: 'ui-only',
  },
  {
    id: 'table-filter',
    name: 'Table Filter',
    description: 'Quick search for Salesforce tables',
    info: 'Works on Setup list views. Adds a search box above the table to instantly filter rows on the client side.',
    defaultEnabled: true,
    accessLevel: 'ui-only',
  },
  {
    id: 'environment-safeguard',
    name: 'Environment Safeguard',
    description: 'Color-coded environment indicator',
    info: 'Displays a colored indicator on screen. Helps visually distinguish Production from Sandbox to avoid accidental changes.',
    defaultEnabled: true,
    accessLevel: 'ui-only',
  },
  {
    id: 'deep-dependency-inspector',
    name: 'Dependency Inspector',
    description: 'Tooling API scan for fields and Apex classes',
    info: 'Appears on Object Manager field pages and Apex Class pages. Uses Salesforce Tooling API against the active org only after you click Deep Scan.',
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
