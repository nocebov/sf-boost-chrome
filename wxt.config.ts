import { defineConfig } from 'wxt';

export default defineConfig({
  modules: [],
  manifest: {
    name: 'SF Boost',
    description: 'Power tools for Salesforce developers and admins',
    version: '0.1.0',
    permissions: ['storage', 'cookies', 'activeTab', 'sidePanel'],
    host_permissions: [
      '*://*.salesforce.com/*',
      '*://*.lightning.force.com/*',
      '*://*.my.salesforce.com/*',
      '*://*.force.com/*',
    ],
    commands: {
      'show-command-palette': {
        suggested_key: { default: 'Alt+Shift+S', mac: 'Alt+Shift+S' },
        description: 'Open SF Boost Command Palette',
      },
      'toggle-field-inspector': {
        suggested_key: { default: 'Alt+Shift+F', mac: 'Alt+Shift+F' },
        description: 'Toggle Field Inspector',
      },
    },
  },
});
