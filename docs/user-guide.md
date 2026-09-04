# SF Boost — User Guide

SF Boost is a Chrome Extension that makes everyday Salesforce admin and developer work faster — right inside the native UI.

**Install:** [Chrome Web Store](https://chromewebstore.google.com/detail/sf-boost/eiboagfkpffiagbjljpkkpehidoihegh)

This guide covers SF Boost `0.7.0`.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Settings Page](#settings-page)
- [Modules](#modules)
  - [Command Palette](#command-palette)
  - [Field Inspector](#field-inspector)
  - [Quick Copy](#quick-copy)
  - [Table Filter](#table-filter)
  - [Environment Safeguard](#environment-safeguard)
  - [Profile → Permission Set](#profile--permission-set)
  - [Deep Dependency Inspector](#deep-dependency-inspector)
  - [Change Set Buddy](#change-set-buddy)
  - [Bulk Check](#bulk-check)
  - [Hide DevOps Center Bar](#hide-devops-center-bar)
  - [Console Formatter](#console-formatter)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [FAQ](#faq)
- [Troubleshooting](#troubleshooting)

---

## Getting Started

1. Install SF Boost from the [Chrome Web Store](https://chromewebstore.google.com/detail/sf-boost/eiboagfkpffiagbjljpkkpehidoihegh)
2. Navigate to any Salesforce org — the extension activates automatically
3. Click the SF Boost icon in your browser toolbar to open the popup
4. Toggle modules on or off — changes apply instantly (no page reload needed)
5. Use the popup `Settings` button when you want module-level options or shortcut help

Five modules are enabled by default: **Command Palette**, **Field Inspector**, **Quick Copy**, **Table Filter**, and **Environment Safeguard**. Six more are available to enable when you need them.

### Access Levels

Each module has an access level that tells you what it can do:

| Level | Meaning |
|---|---|
| **UI-only** | Works entirely in the browser. No Salesforce API calls. |
| **Read-only** | Reads Salesforce metadata (describe, SOQL) but never writes. |
| **Write-capable** | Can create or modify Salesforce data (e.g., create a Permission Set). Only acts when you explicitly trigger it. |

---

## Settings Page

Open the popup and click **Settings** to access SF Boost's dedicated settings page.

The current `0.7.0` settings page includes:

- global module settings for **Field Inspector**, **Quick Copy**, **Table Filter**, and **Environment Safeguard**
- a keyboard-shortcuts card with the default shortcuts for Command Palette and Field Inspector
- a direct button to open `chrome://extensions/shortcuts`

Settings save automatically. Module-setting changes are designed to apply on the next page load.

---

## Modules

### Command Palette

> Enabled by default · Write-capable · `Alt+Shift+S`

Jump anywhere in Setup — or search Salesforce metadata — without clicking through menus.

**How to use:** Press `Alt+Shift+S` (or `Cmd+Shift+S` on Mac), start typing, and hit Enter.

**What you can do:**

- **50+ Setup shortcuts** — type "Users", "Profiles", "Flows", "Apex", "Object Manager", and more to jump directly to that Setup page
- **Search sub-modes** — type "Profiles", "Permission Sets", "Flows", "Apex Classes", or "Apex Triggers" to enter a search mode that queries your org's metadata in real time
- **Quick actions** — click the pills at the top of the palette, or press number keys `1`–`9` when the input is empty. Default actions: `1` Profiles · `2` Permission Sets · `3` Flows · `4` Classes · `5` Triggers · `6` Debug Log
- **Toggle Debug Log** — creates a 30-minute FINEST trace flag for your user, then removes only that SF Boost-created flag. If Salesforce already has a manual active log, SF Boost leaves it unchanged.
- **Quick SOQL** — run a SOQL query and see results right in the palette
- **Copy helpers** — copy the current Record ID or page URL

**Navigation:**
- Arrow keys to move through results
- `Enter` to select (hold `Ctrl`/`Cmd` to open in a new tab)
- `Escape` to close
- `Backspace` on empty input to exit a sub-mode

**Customization:** Click the pencil icon (✎) in the quick action bar to customize actions — hide built-in actions, add your own URL shortcuts, or reset to defaults. Custom actions are synced across your Chrome profile.

---

### Field Inspector

> Enabled by default · Read-only · `Alt+Shift+F` to toggle

See field API names directly on Lightning record pages.

**How it works:** Blue badges appear next to supported field labels on record pages. Click a badge to open a metadata panel for that field.

**Tips:**
- Works on standard and custom object Lightning record pages
- Uses Salesforce's describe API (cached for 1 hour per object, max 25 objects)
- Toggle visibility with `Alt+Shift+F` without disabling the module
- `Ctrl`/`Cmd` + click copies the API name immediately
- The metadata panel includes quick actions for Copy API, Copy SOQL, Open Setup, and Copy Relationship (when available)
- If enabled in Settings, the metadata panel also shows sampled field usage percentage based on up to 1,000 queried records with a 5-minute cache
- Badges update automatically when new sections are rendered

---

### Quick Copy

> Enabled by default · UI-only

One-click copy of Record IDs.

- **Record pages** — a clipboard icon appears next to the record header. Click it to copy the 18-character Record ID.
- **List views** — a copy icon appears next to each record name on row hover. Click to copy that row's Record ID.

---

### Table Filter

> Enabled by default · UI-only

Instant client-side search for any Salesforce table.

A search bar appears above Setup list views, List Views, and Classic tables. Type to filter rows in real time — no page reload.

**Features:**
- Multi-term search: separate terms with spaces (all terms must match)
- Live `filtered / total` row count
- Matched text highlighted in yellow
- Clear with the × button or `Escape`

**Smart row loading:** Lightning tables lazy-load rows as you scroll. By default, Table Filter automatically loads lazy rows while filtering, and on Classic pages it selects the maximum "records per page" option.

**Settings:** In **SF Boost Settings**, you can now control:
- whether Table Filter appears on Setup pages
- whether it appears on Lightning list views
- whether lazy rows auto-load during filtering
- whether Classic pagination auto-expands

---

### Environment Safeguard

> Enabled by default · Read-only

A color-coded badge in the top-left corner of every Salesforce page that tells you which environment you're in.

| Environment | Badge Color | Tab Title Prefix |
|---|---|---|
| Production | Red | `[PROD]` |
| Sandbox | Orange | `[SBX: name]` |
| Developer Edition | Green | `[DEV]` |
| Scratch Org | Teal | `[SCRATCH]` |
| Trailhead Playground | Purple | `[TRAIL]` |

The badge is automatically hidden on Flow Builder and Lightning App Builder pages to avoid overlapping the canvas.

By default, the badge can also show the org's current time, and the module can recolor the Salesforce favicon and prefix the browser tab title. In **SF Boost Settings**, you can control the global Environment Safeguard options for org clock, colored favicon, and tab-title prefix.

When the org clock is enabled, Environment Safeguard performs a read-only query to resolve the org's timezone.

**Legacy manual config:** Existing raw `chrome.storage.sync` overrides continue to load for compatibility.

---

### Profile → Permission Set

> Disabled by default · Write-capable

Extract permissions from any Salesforce Profile and create a new Permission Set — no code required.

**How to enable:** Open the SF Boost popup and toggle "Profile to Permission Set" on.

**How to use:**

1. Navigate to any Profile page in Setup (Enhanced or Classic)
2. Click the **"Extract to Permission Set"** button that appears
3. Follow the 5-step wizard:
   - **Load** — reads all profile permissions in parallel (objects, fields, user perms, tabs, Apex/VF/custom access)
   - **Select** — review permissions by category with collapsible sections, Select All, and individual checkboxes. Object permission flags shown inline (R/C/E/D/VA/MA)
   - **Name** — pre-filled with `{ProfileName}_Extracted`, validates API naming rules, checks for duplicates
   - **Execute** — 10-stage progress view with live status updates
   - **Result** — success banner with a direct link to the new Permission Set, plus notices about any adjustments (auto-resolved dependencies, non-permissionable items, etc.)

**Export options:** On the result step, use "Copy for Excel" (tab-separated) or "Download CSV" to export the permission details.

---

### Deep Dependency Inspector

> Disabled by default · Read-only

Find where a field, Apex class, or Classic Email Template is used across the org.

**How to enable:** Open the SF Boost popup and toggle "Dependency Inspector" on.

**How to use:** Navigate to an Object Manager field page or an Apex Class page. Click the **"Deep Scan"** button. Results appear in a modal, grouped by component type (Flows, Apex Classes, Triggers, LWC, Validation Rules, Layouts, etc.) with collapsible sections, icons, and counts. Click an item to copy its name, or use "Copy All".

Uses the Salesforce Tooling API (`MetadataComponentDependency`).

**Classic Email Templates:** Open a saved template detail page in Classic or in Setup → Classic Email Templates, then click **Deep Scan → Used By**. The scan combines indexed metadata references, direct Email Alerts (`WorkflowAlert.TemplateId`), and Approval Assignment Email Templates in active and inactive Classic Approval Processes (`ApprovalProcess.emailTemplate`). Approval definitions are read using Metadata API `listMetadata`/`readMetadata`, matching the template's full metadata name including its folder and namespace. Approval results include their active/inactive status and link to Setup. Refresh reruns the scan. Template lists and creation pages do not have a current template to scan.

Coverage is limited to references exposed by these APIs. Dynamic Apex references, manual email use, Flow Approval Processes, and indirect uses through alerts are not fully covered. The Uses tab only checks the metadata index, not template content or merge fields. Metadata API access is required to read approval definitions; unavailable sources, unreadable definitions and the 1,000-process listing limit are reported as incomplete results. An empty result does not prove that a template is unused. Searches are read-only and cached per org for five minutes. No approval process or template is modified.

---

### Change Set Buddy

> Disabled by default · UI-only

Search and filter large Change Set component lists.

**How to enable:** Open the SF Boost popup and toggle "Change Set Buddy" on.

**How to use:** Navigate to any Outbound or Inbound Change Set page. A search bar appears above the component table with multi-term search, live `filtered / total` count, and a component type counter showing the top 3 types (e.g., `5 ApexClass, 3 CustomObject, 2 ValidationRule`).

---

### Bulk Check

> Disabled by default · UI-only

Adds an inline master checkbox with a live `checked / total` counter on Setup permission tables.

**How to enable:** Open the SF Boost popup and toggle "Bulk Check" on.

**How to use:** Open a Profile, Permission Set, or similar Setup edit page with checkbox columns. A compact control appears in the header so you can toggle the whole column at once. It dispatches the same checkbox events Salesforce expects, and it can also work inside classic Setup iframes that are embedded under Lightning Setup.

---

### Hide DevOps Center Bar

> Disabled by default · UI-only

Removes the DevOps Center navigation bar from all Salesforce pages.

**How to enable:** Open the SF Boost popup and toggle "Hide DevOps Center Bar" on.

Once enabled, the bar is hidden via CSS injection and stays hidden across page navigations. A MutationObserver catches any dynamically added DevOps bar elements.

---

### Console Formatter

> Disabled by default · UI-only

Readable snapshots for LWC/LWS console output when native DevTools formatting is unavailable or incomplete.

**How to enable:** Open the SF Boost popup and toggle "Console Formatter" on.

**How to use:** Open DevTools on an authenticated org host (`*.my.salesforce.com`, `*.lightning.force.com`, or `*.salesforce-setup.com`) and log a proxy-heavy value. SF Boost provides readable plain-object snapshots and exposes `window.SFBoostConsole.snapshot()`, `.log()`, and `.dir()` helpers.

The formatter does not inject on public Salesforce properties such as `help.salesforce.com`.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Alt+Shift+S` | Open Command Palette |
| `Alt+Shift+F` | Toggle Field Inspector |
| `↑` / `↓` | Navigate Command Palette results |
| `Enter` | Select Command Palette item |
| `Ctrl/Cmd+Enter` | Open in new tab |
| `Escape` | Close palette / clear Table Filter |
| `Backspace` (empty input) | Exit Command Palette sub-mode |
| `1`–`9` (empty input) | Quick actions in Command Palette |

You can customize Chrome extension shortcuts at `chrome://extensions/shortcuts`.

---

## FAQ

**Is SF Boost safe to use?**
Yes. SF Boost runs entirely in your browser. It does not send any Salesforce data to third-party servers. API calls go directly from the extension to your Salesforce org using your existing session. See the full [Privacy Policy](privacy-policy.md).

**What data does it access?**
SF Boost reads the Salesforce session cookie (`sid`) locally to authenticate API calls. It uses `chrome.storage.sync` for module toggles, module settings, per-org UI settings, and Command Palette quick actions, plus `chrome.storage.local` for caching object describe data (1-hour TTL). No data leaves your browser.

**Why are some modules disabled by default?**
Modules that modify Salesforce data (Profile → Permission Set) or change the native UI significantly (Hide DevOps Bar) are opt-in. This ensures the extension is non-intrusive out of the box.

**Does it work in Salesforce Classic?**
Partially. Table Filter and Change Set Buddy work on Classic pages. Bulk Check also supports classic Setup iframes where available. Command Palette Setup shortcuts work in both Lightning and Classic. Field Inspector and Quick Copy are Lightning-only.

**Can I use it in multiple orgs?**
Yes. SF Boost works in any Salesforce org you're logged into. Environment Safeguard detects the org type automatically, and global module toggles sync across your Chrome profile.

**How do I report a bug or request a feature?**
- [Report a bug](https://github.com/nocebov/sf-boost-chrome/issues/new?template=bug_report.md)
- [Request a feature](https://github.com/nocebov/sf-boost-chrome/issues/new?template=feature_request.md)

---

## Troubleshooting

**Command Palette doesn't open**
- Check that the module is enabled in the popup
- Verify the shortcut at `chrome://extensions/shortcuts` — it may conflict with another extension
- Make sure focus is on the Salesforce page (not inside an iframe or DevTools)

**Field Inspector badges don't appear**
- Only works on Lightning record pages (not list views, Setup, or Classic)
- The object describe API call may fail if your profile lacks read access to the object
- Try toggling with `Alt+Shift+F`

**Environment badge is missing**
- Hidden automatically on Flow Builder and App Builder pages
- Module may be disabled — check the popup
- The badge can also be turned off by per-org Environment Safeguard overrides

**Console Formatter doesn't appear**
- It only runs on authenticated org hosts such as `*.my.salesforce.com`, `*.lightning.force.com`, and `*.salesforce-setup.com`
- It does not inject on public Salesforce properties like `help.salesforce.com`
- Reload the tab after enabling it if the current page was opened before the module was turned on

**Profile → Permission Set shows errors**
- Ensure your user has permission to create Permission Sets in the target org
- Some profile permissions (like "Modify All Data") cannot be added to Permission Sets — these are noted in the result summary
- If the creation fails mid-way, SF Boost attempts a rollback (deletes the partially created Permission Set)

**Extension not loading on Salesforce pages**
- Verify the extension is enabled at `chrome://extensions`
- Check that Developer Mode is on if you're using an unpacked build
- Clear the browser cache and reload the Salesforce page
