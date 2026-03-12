# SF Boost — Salesforce Productivity Toolkit

**SF Boost** is a Chrome Extension focused on one job: making everyday Salesforce admin and developer work faster inside the native UI.

> **Version 0.2.0** · Built with [WXT](https://wxt.dev/) · TypeScript · Bun

---

## Modules

### Command Palette `Alt+Shift+S`

Jump anywhere in Setup without clicking through menus.

Press `Alt+Shift+S`, start typing, hit Enter. Works for:
- **Setup pages** — Users, Profiles, Roles, Permission Sets, Object Manager, Picklist Value Sets, Fields, Apex Classes, Triggers, LWC, Visualforce, Debug Logs, Developer Console, and more
- **Flow Search** — type `Find Flow` to switch to Flow Search mode and search across all flows in the org (up to 2000 loaded, with flow type labels: Screen Flow, Autolaunched, Scheduled, etc.)
- **Quick Actions** — easily copy your current Record ID or current Page URL.

Navigate with arrow keys, confirm with Enter, close with Escape.

---

### Field Inspector `Alt+Shift+F`

See field API names directly on any record page — no more digging through Object Manager.

Press `Alt+Shift+F` or click the `{ }` button in the bottom-right corner. Blue API name badges appear next to every field label. **Hover** the badge to see the field type and whether it's required. **Click** the badge to copy the API name to clipboard instantly.

---

### Quick Copy

One-click copy of the 18-character Record ID on any record page.

A small clipboard icon appears next to the record title or header — click it and the ID is in your clipboard. No more wrestling with URL bars.

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

Updates the browser tab title with an environment prefix (`[PROD]`, `[SBX: name]`, etc.). Supports custom labels and colors per org.

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

Find where an Object Manager field or Apex class is used across the org without writing SOQL.

On Object Manager field pages or Apex Class pages, a **"Deep Scan"** button appears. Click it to query `MetadataComponentDependency` via the Tooling API. Results are grouped by component type (Flows, Apex Classes, Triggers, LWC, etc.) with icons and counts. Copy individual items or all dependencies at once.

> Disabled by default — enable in the extension popup.

---

### Change Set Buddy

Filter large Change Set component lists without scrolling.

On Outbound/Inbound Change Set pages, a search bar is injected above the component table. Supports multi-term search and shows a summary of matched component types (e.g. `3 FlowDefinition, 2 ApexClass`).

> Disabled by default — enable in the extension popup.

---

### Hide DevOps Bar

Removes the DevOps Center navigation bar from Setup pages if you don't use it.

> Disabled by default — enable in the extension popup when you explicitly want it.

Once enabled, the bar disappears on supported Setup pages and stays hidden across SPA navigations.

---

## Installation & Development

```bash
# Install dependencies
bun install

# Type-check
bun run check

# Development server (auto-reloads on changes)
bun run dev

# Build for production
bun run build

# Run popup/content smoke test against the built extension
bun run test:smoke

# Package for Chrome Web Store
bun run zip
```

Load the unpacked extension from `.output/chrome-mv3/` in `chrome://extensions` with Developer Mode on.

---

## Data Handling

- SF Boost reads the current Salesforce session cookie (`sid`) locally so it can make Salesforce REST and Tooling API calls against the active org.
- The `sid` cookie is read only inside Chrome via the `cookies` permission. It is used to authenticate direct requests from the extension to Salesforce, not to any developer-operated backend.
- API-assisted features run only against the org open in the active Salesforce tab.
- SF Boost does not send Salesforce data to third-party servers.
- Settings are stored in `chrome.storage.sync`, and describe-cache data is stored in `chrome.storage.local`.
- The extension is built around a single purpose: improving day-to-day Salesforce admin and developer workflows inside the native Salesforce UI.

Store submission artifacts:
- Privacy policy: [docs/privacy-policy.md](docs/privacy-policy.md)
- Reviewer notes: [docs/reviewer-notes.md](docs/reviewer-notes.md)
- Support: [docs/support.md](docs/support.md)
- Admin packet: [docs/admin-packet.md](docs/admin-packet.md)
- Release checklist: [docs/store-release-checklist.md](docs/store-release-checklist.md)

---

## Tech Stack

- **[WXT](https://wxt.dev/)** — Chrome Extension framework with HMR
- **TypeScript** — full type safety across all modules
- **Bun** — fast package manager and runtime
- **Salesforce REST & Tooling APIs** — for Flow Search, Dependency Inspector, and Profile extraction

---

*Built for speed. Designed for Salesforce pros.*
