# SF Boost Reviewer Notes

Last updated: March 15, 2026

## Single purpose

SF Boost has one purpose: improve day-to-day Salesforce admin and developer workflows inside the native Salesforce UI. It adds optional navigation, inspection, filtering, and environment-safety helpers, and it uses the current Salesforce session only for user-triggered REST and Tooling API calls to the active org.

## Review prerequisites

- A valid Salesforce Lightning login is required to exercise most features.
- Supported page hosts for review are `*.salesforce.com`, `*.my.salesforce.com`, `*.lightning.force.com`, and `*.salesforce-setup.com`.
- The extension does not include bundled reviewer credentials in the repository. If the Chrome Web Store review requires isolated access, provide a dedicated sandbox/demo-org login directly in the Store reviewer notes at submission time.

## Permissions and data use summary

- `storage`: stores `enabledModules`, `orgSettings`, `storageVersion`, Command Palette quick actions, and a small local describe cache.
- `cookies`: reads the Salesforce `sid` cookie locally so the extension can authenticate Salesforce API calls to the active org.
- `scripting`: used only as a fallback to dispatch the keyboard shortcut events into the active Salesforce tab if `tabs.sendMessage` fails (e.g. content script not injected yet).
- The `sid` cookie is not sent to any developer-operated backend. It is read locally in Chrome and used only for direct requests to Salesforce REST and Tooling API endpoints.
- Host permissions are limited to Salesforce domains used by the extension.

## Step-by-step review path

1. Open the extension popup on any Salesforce page. Confirm that `Command Palette`, `Field Inspector`, `Quick Copy`, `Table Filter`, and `Environment Safeguard` are enabled by default. Confirm that `Dependency Inspector`, `Change Set Buddy`, `Profile to Permission Set`, and `Hide DevOps Center Bar` are disabled by default.
2. On any Salesforce page, press `Alt+Shift+S`. Expected result: the Command Palette opens with a quick action bar and allows Setup-page search without leaving the browser tab. With an empty input, press number keys `1`–`9` to activate quick actions (by default: `1` Profiles, `2` Permission Sets, `3` Flows, `4` Classes, `5` Triggers, `6` Debug Log). Use the ✎ button to customize quick actions (hide built-ins, add custom URL shortcuts, or reset to defaults). Hold `Ctrl`/`Cmd` when selecting an item to open it in a new tab.
3. Open any Lightning record page, for example `/lightning/r/Account/<recordId>/view`. Expected result: field API name badges appear next to supported field labels. Hover a badge to see the field type + required; click to copy the API name.
4. On any record page, verify a small clipboard icon next to the record header. Click it. Expected result: the record ID is copied to the clipboard. On any Lightning list view (for example `/lightning/o/Account/list`), verify a small copy icon next to the record name (it fades in on row hover). Clicking it copies that row's record ID.
5. Open any Setup list page, for example Profiles, Permission Sets, or Apex Classes. Expected result: a table filter input appears above the table and filters rows client-side as you type. Multi-term search (space-separated) uses AND logic. Matched text is highlighted in yellow.
6. On any supported page, verify the environment badge near the top-left of the page. Expected result: a color-coded Production (red), Sandbox (orange), Developer (green), Scratch (teal), or Trailhead (purple) indicator is shown. The browser tab title is prefixed with the environment label. The badge is automatically hidden on Flow Builder and Lightning App Builder pages to avoid canvas overlap.
7. Optional read-only API scenario: enable `Dependency Inspector`, open an Object Manager field page or Apex Class page, then click `Deep Scan`. Expected result: the extension issues a Tooling API query to the active org and shows dependency results grouped by component type in a modal.
8. Optional write-capable scenario: enable `Profile to Permission Set`, open a Profile page in Setup, click `Extract to Permission Set`, and walk through the wizard. Expected result: the extension reads the profile, lets you choose permissions with per-category Select All controls, and creates a new Permission Set in the same Salesforce org only after you explicitly confirm creation. A 10-stage progress view shows real-time status. A result report includes export actions (`Copy for Excel`, `Download CSV`).
9. Optional UI-only scenario: enable `Hide DevOps Center Bar`, navigate to any Salesforce page where the DevOps Center bar is visible, and confirm that the bar is hidden. The module uses CSS injection and a MutationObserver to catch dynamically rendered elements.
10. Optional UI-only scenario: enable `Change Set Buddy`, open an Outbound or Inbound Change Set page. Expected result: a search bar appears above the component table with multi-term filtering and a component type counter.

## Disabled by default

- Dependency Inspector
- Change Set Buddy
- Profile to PermSet
- Hide DevOps Center Bar

## Write-capable modules

- **Command Palette** — the Toggle Debug Log action creates/deletes a TraceFlag and DebugLevel in the active org.
- **Profile to Permission Set** — creates a Permission Set and associated permission records. This is the only module that creates persistent records in the org.

## Permissions rationale

- `storage`: stores enabled modules, org badge settings, Command Palette quick actions, and a small local describe cache.
- `cookies`: reads the Salesforce `sid` cookie locally so the extension can authenticate Salesforce API calls directly against the active org.
- `scripting`: used only for a keyboard-shortcut fallback path; it dispatches a local event into the active Salesforce tab (no remote code).
- Host permissions are limited to Salesforce API domains used by the extension.

## Network behavior

- The extension calls only Salesforce REST and Tooling API endpoints for the active org.
- The extension does not send cookies, metadata, or page data to any developer-operated backend.
