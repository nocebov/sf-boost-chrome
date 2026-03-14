# SF Boost Reviewer Notes

Last updated: March 14, 2026

## Single purpose

SF Boost has one purpose: improve day-to-day Salesforce admin and developer workflows inside the native Salesforce UI. It adds optional navigation, inspection, filtering, and environment-safety helpers, and it uses the current Salesforce session only for user-triggered REST and Tooling API calls to the active org.

## Review prerequisites

- A valid Salesforce Lightning login is required to exercise most features.
- Supported page hosts for review are `*.salesforce.com`, `*.my.salesforce.com`, `*.lightning.force.com`, and `*.salesforce-setup.com`.
- The extension does not include bundled reviewer credentials in the repository. If the Chrome Web Store review requires isolated access, provide a dedicated sandbox/demo-org login directly in the Store reviewer notes at submission time.

## Permissions and data use summary

- `storage`: stores `enabledModules`, `orgSettings`, `storageVersion`, and a small local describe cache.
- `cookies`: reads the Salesforce `sid` cookie locally so the extension can authenticate Salesforce API calls to the active org.
- The `sid` cookie is not sent to any developer-operated backend. It is read locally in Chrome and used only for direct requests to Salesforce REST and Tooling API endpoints.
- Host permissions are limited to Salesforce domains used by the extension.

## Step-by-step review path

1. Open the extension popup on any Salesforce page. Confirm that `Command Palette`, `Field Inspector`, `Quick Copy`, `Table Filter`, and `Environment Safeguard` are enabled by default. Confirm that `Dependency Inspector`, `Change Set Buddy`, `Profile to Permission Set`, and `Hide DevOps Center Bar` are disabled by default.
2. On any Salesforce page, press `Alt+Shift+S`. Expected result: the Command Palette opens with quick action pills (numbered 1–7) and allows Setup-page search without leaving the browser tab. Press number keys 1–7 to enter sub-modes: Profile Search, PermSet Search, Flow Search, Apex Class Search, Apex Trigger Search, Toggle Debug Log, SOQL Query.
3. Open any Lightning record page, for example `/lightning/r/Account/<recordId>/view`, then press `Alt+Shift+F`. Expected result: a `{ }` FAB button appears in the bottom-right corner, and field API name badges appear next to visible field labels. Hover a badge to see the field type; click to copy the API name.
4. On any record page, verify a small clipboard icon next to the record header. Click it. Expected result: the 18-character record ID is copied to the clipboard. On any list view, hover a table row. Expected result: a "Copy ID" pill appears; clicking it copies that row's record ID.
5. Open any Setup list page, for example Profiles, Permission Sets, or Apex Classes. Expected result: a table filter input appears above the table and filters rows client-side as you type. Multi-term search (space-separated) uses AND logic. Matched text is highlighted in yellow.
6. On any supported page, verify the environment badge near the top-left of the page. Expected result: a color-coded Production (red), Sandbox (orange), Developer (green), Scratch (teal), or Trailhead (purple) indicator is shown. The browser tab title is prefixed with the environment label.
7. Optional read-only API scenario: enable `Dependency Inspector`, open an Object Manager field page or Apex Class page, then click `Deep Scan`. Expected result: the extension issues a Tooling API query to the active org and shows dependency results grouped by component type in a modal.
8. Optional write-capable scenario: enable `Profile to Permission Set`, open a Profile page in Setup, click `Extract to Permission Set`, and walk through the wizard. Expected result: the extension reads the profile, lets you choose permissions with per-category Select All controls, and creates a new Permission Set in the same Salesforce org only after you explicitly confirm creation. A 10-stage progress view shows real-time status.
9. Optional UI-only scenario: enable `Hide DevOps Center Bar`, navigate to any Salesforce page where the DevOps Center bar is visible, and confirm that the bar is hidden. The module uses CSS injection and a MutationObserver to catch dynamically rendered elements.
10. Optional UI-only scenario: enable `Change Set Buddy`, open an Outbound or Inbound Change Set page. Expected result: a search bar appears above the component table with multi-term filtering and a component type counter.

## Disabled by default

- Dependency Inspector
- Change Set Buddy
- Profile to PermSet
- Hide DevOps Center Bar

## Write-capable modules

- **Command Palette** — the Toggle Debug Log action (quick action pill #6) creates/deletes a TraceFlag and DebugLevel in the active org.
- **Profile to Permission Set** — creates a Permission Set and associated permission records. This is the only module that creates persistent records in the org.

## Permissions rationale

- `storage`: stores enabled modules, org badge settings, and a small local describe cache.
- `cookies`: reads the Salesforce `sid` cookie locally so the extension can authenticate Salesforce API calls directly against the active org.
- Host permissions are limited to Salesforce API domains used by the extension.

## Network behavior

- The extension calls only Salesforce REST and Tooling API endpoints for the active org.
- The extension does not send cookies, metadata, or page data to any developer-operated backend.
