import { defineConfig } from 'wxt';

export default defineConfig({
  modules: [],
  manifest: {
    name: 'SF Boost',
    short_name: 'SF Boost',
    description: 'Power tools for Salesforce developers and admins: field inspector, SOQL runner, metadata explorer and more.',
    version: '0.2.0',
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
    action: {
      default_title: 'SF Boost',
      default_icon: {
        16: 'icon-16.png',
        32: 'icon-32.png',
        48: 'icon-48.png',
        128: 'icon-128.png',
      },
    },
    permissions: ['storage', 'cookies', 'activeTab', 'sidePanel'],
    host_permissions: [
      '*://*.salesforce.com/*',
      '*://*.lightning.force.com/*',
      '*://*.my.salesforce.com/*',
      '*://*.force.com/*',
      '*://*.salesforce-setup.com/*',
    ],
    commands: {
      'show-command-palette': {
        suggested_key: { default: 'Alt+Shift+S', mac: 'Alt+Shift+S' },
        description: 'Open SF Boost Command Palette',
      },
    },
  },
});
