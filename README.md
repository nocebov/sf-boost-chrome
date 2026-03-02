# Salesforce Boost (SF Boost)

Salesforce Boost is a powerful Chrome Extension built to enhance productivity for Salesforce Developers, Administrators, and Consultants. It injects a set of handy "power tools" directly into the Salesforce UI, eliminating repetitive clicks and drastically speeding up daily tasks.

## Features & Functionality

### 1. Command Palette (Alt+Shift+S)
A lightning-fast, keyboard-driven navigation menu that lets you jump anywhere in setup or perform quick actions without touching your mouse.

**How it works**: Press `Alt+Shift+S` anywhere in Salesforce, type your search query, and hit Enter.

**All Available Commands & Setup Quick Links**:
- **Users & Access**: Users, Profiles, Permission Sets, Permission Set Groups, Roles, Public Groups, Queues, Login History
- **Objects & Fields**: Object Manager, Schema Builder, Picklist Value Sets
- **Automation**: Find Flow, Flows, Process Automation Settings, Approval Processes, Scheduled Jobs
- **Code**: Apex Classes, Apex Triggers, Visualforce Pages, Visualforce Components, Static Resources, Lightning Components, Custom Metadata Types, Custom Settings, Custom Labels, Platform Events
- **Debug & Logs**: Debug Logs, Developer Console, Apex Test Execution
- **Deploy & Packages**: Deployment Status, Outbound Change Sets, Inbound Change Sets, Installed Packages
- **Security**: Sharing Settings, Field Accessibility, Session Settings, Named Credentials, Remote Site Settings, CORS, Connected Apps
- **Email**: Email Deliverability, Email Templates
- **Data**: Data Import Wizard, Mass Delete Records, Storage Usage
- **UI & Apps**: App Manager, Lightning App Builder, Page Layouts, Tabs, Record Types, Global Actions
- **Company Info**: Company Information, Sandboxes
- **Reports & Dashboards**: Report Types
- **Integration**: API, External Services

**Special Capabilities**:
- **Flow Search (⚡ Find Flow)**: Type "Find Flow", hit enter, and instantly search through all your org's flows (Screen Flows, Autolaunched, Record-Triggered) by name. Select one to jump directly into the Flow Builder.
- **Developer Console**: Instantly open the Dev Console via a quick action search.
- **Copy Current Record ID**: Grabs the 18-character ID from the current page's URL to your clipboard.
- **Copy Current Page URL**: Copies the full link of the current page.

### 2. Field Inspector (Alt+Shift+F)
Instantly view and copy the underlying API names of fields directly on standard record page layouts.

**How it works**: Click the floating `{ }` button in the bottom right corner of a record page to toggle the inspector, or use the `Alt+Shift+F` keyboard shortcut.

**Key Capabilities**:
- **Inline API Names**: Adds a small blue badge containing the Field API Name next to the standard UI label for every recognized field on the page.
- **One-Click Copy**: Click the badge to immediately copy the API name to your clipboard (the badge turns green to confirm!).
- **Hover Info**: Hover over any badge to see the field type and whether it is a required field.

### 3. Quick Copy
Stop struggling to highlight the 18-character Record ID in the URL bar.

**How it works**: A minimal copy icon is automatically injected directly next to the record title/header on any standard record page.

**Key Capabilities**:
- **Record ID Copy**: Click the icon to instantly grab the 18-character Record ID to your clipboard. A small toast notification confirms the copy.

## Best Use Cases

- **Salesforce Administrators**: Constantly modifying and troubleshooting Flows? Use the Command Palette to search for "Flows" or "Find Flow" to jump directly to the Flow Builder in seconds. Navigating between Profiles and Permission Sets is now instant.
- **Salesforce Developers**: Writing SOQL queries or Apex triggers? Toggle the Field Inspector (`Alt+Shift+F`) to grab the exact API names from the page layout without having to dig through the Object Manager for every single field. Instantly open the Dev Console via the Command Palette.
- **Consultants & QA**: Working with multiple records and needing to document IDs or share links in tickets? Use the Quick Copy button next to the record name to grab Record IDs instantly without manual highlighting.

## Development & Installation

This project is built using the [WXT](https://wxt.dev/) framework, TypeScript, and Bun/npm.

### Commands

```bash
# Install dependencies
npm install

# Run the dev server (opens a fresh Chrome instance)
npm run dev

# Build the extension for production
npm run build

# Package the extension into a zip file for the Chrome Web Store
npm run zip
```
