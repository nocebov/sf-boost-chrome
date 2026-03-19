import { defineConfig } from 'wxt';

export default defineConfig({
  modules: [],
  manifest: {
    name: 'SF Boost',
    short_name: 'SF Boost',
    description: 'Salesforce productivity toolkit for admins and developers.',
    version: '0.5.0',
    homepage_url: 'https://github.com/nocebov/sf-boost-chrome',
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
    permissions: ['storage', 'cookies', 'scripting'],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
    },
    host_permissions: [
      '*://*.salesforce.com/*',
      '*://*.my.salesforce.com/*',
      '*://*.lightning.force.com/*',
      '*://*.salesforce-setup.com/*',
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
