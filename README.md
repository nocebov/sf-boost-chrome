# SF Boost — Power Tools for Salesforce

**SF Boost** is a Chrome Extension that eliminates repetitive clicks and supercharges everyday Salesforce workflows. Built for Admins, Developers, and Consultants — it injects powerful tools directly into the Salesforce UI without ever leaving the page.

> **Version 0.2.0** · Built with [WXT](https://wxt.dev/) · TypeScript · Bun

---

## Modules

### Command Palette `Alt+Shift+S`

Jump anywhere in Setup without clicking through menus.

Press `Alt+Shift+S`, start typing, hit Enter. Works for:
- **Setup pages** — Users, Profiles, Roles, Permission Sets, Object Manager, Picklist Value Sets, Fields, Apex Classes, Triggers, LWC, Visualforce, Debug Logs, Developer Console, and more
- **Flow Search** — type `Find Flow` to switch to Flow Search mode and search across all flows in the org (up to 2000 loaded, with flow type labels: Screen Flow, Autolaunched, Scheduled, etc.)

Navigate with arrow keys, confirm with Enter, close with Escape.

---

### Field Inspector `Alt+Shift+F`

See field API names directly on any record page — no more digging through Object Manager.

Press `Alt+Shift+F` or click the `{ }` button in the bottom-right corner. Blue API name badges appear next to every field label. **Hover** the badge to see the field type and whether it's required. **Click** the badge to copy the API name to clipboard instantly.

---

### Quick Copy

One-click copy of the 18-character Record ID on any record page.

A small clipboard icon appears next to the record title — click it and the ID is in your clipboard. No more wrestling with URL bars.

---

### Table Filter

Instant search over any Salesforce table — Setup lists, List Views, Classic tables.

A search bar is automatically injected above supported tables. Type to filter rows in real-time (no page reload). Supports multi-term search (space-separated terms, all must match). Shows a live `filtered / total` row count. Clear with the × button or Escape key.

---

### Environment Safeguard

A color-coded badge in the top-left corner that tells you exactly which org you're in — before you accidentally do something in Production.

| Environment | Color |
|---|---|
| Production | Red |
| Sandbox | Green |
| Developer | Blue |
| Scratch | Purple |
| Trailhead | Teal |

Includes a live session status dot (green = active, red = expired). Also updates the browser tab title with an environment prefix (`[PROD]`, `[SBX: name]`, etc.). Supports custom labels and colors per org.

---

### Profile → Permission Set

Extract permissions from any Profile and create a new Permission Set — without writing a single line of code.

Open any Profile page and click **"Extract to Permission Set"**. A wizard walks you through:

1. **Select permission categories** to include — Object Permissions, Field Permissions, User/System Permissions, Tab Settings, Apex Class Access, Visualforce Page Access, Custom Permissions
2. **Pick or deselect individual items** within each category (Select All / Select None per group)
3. **Name your Permission Set** and create it via API with real-time progress

On success, a direct link opens the new Permission Set. Duplicate name detection included.

> Disabled by default — enable in the extension popup.

---

### Deep Dependency Inspector

Find where a field, Apex class, or flow is used across the org without writing SOQL.

On Object Manager field pages or Apex Class pages, a **"Deep Scan"** button appears. Click it to query `MetadataComponentDependency` via the Tooling API. Results are grouped by component type (Flows, Apex Classes, Triggers, LWC, etc.) with icons and counts. Copy individual items or all dependencies at once.

---

### Change Set Buddy

Filter large Change Set component lists without scrolling.

On Outbound/Inbound Change Set pages, a search bar is injected above the component table. Supports multi-term search and shows a summary of matched component types (e.g. `3 FlowDefinition, 2 ApexClass`).

> Disabled by default — enable in the extension popup.

---

### Hide DevOps Bar

Removes the DevOps Center navigation bar from Setup pages if you don't use it.

No configuration needed — just enable and the bar disappears. Works across SPA navigations.

---

## Installation & Development

```bash
# Install dependencies
bun install

# Development server (auto-reloads on changes)
bun run dev

# Build for production
bun run build

# Package for Chrome Web Store
bun run zip
```

Load the unpacked extension from `.output/chrome-mv3/` in `chrome://extensions` with Developer Mode on.

---

## Tech Stack

- **[WXT](https://wxt.dev/)** — Chrome Extension framework with HMR
- **TypeScript** — full type safety across all modules
- **Bun** — fast package manager and runtime
- **Salesforce REST & Tooling APIs** — for Flow Search, Dependency Inspector, and Profile extraction

---

*Built for speed. Designed for Salesforce pros.*
