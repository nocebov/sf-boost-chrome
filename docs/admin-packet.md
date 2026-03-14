# SF Boost Admin Packet

Last updated: March 14, 2026

## Product summary

SF Boost is a Salesforce productivity toolkit for admins and developers. Its single purpose is to improve daily navigation, inspection, filtering, and environment-safety workflows inside the native Salesforce UI.

## Requested extension permissions

| Permission | Why it is needed |
|---|---|
| `storage` | Stores enabled module IDs, per-org badge settings, a storage version marker, and a small local metadata cache. |
| `cookies` | Reads the Salesforce `sid` cookie locally so the extension can authenticate direct Salesforce API calls to the active org. |
| Host permissions on `*.salesforce.com` and `*.my.salesforce.com` | Required for direct REST and Tooling API calls to the active Salesforce org. |

## Supported domains

- Page injection: `*.salesforce.com`, `*.lightning.force.com`, `*.my.salesforce.com`, `*.salesforce-setup.com`
- Direct API and cookie access: normalized `https://*.salesforce.com` and `https://*.my.salesforce.com`

## Data flow

1. The content script runs only on supported Salesforce pages.
2. When a user triggers an API-backed feature, the background worker reads the local Salesforce `sid` cookie via `chrome.cookies`.
3. The extension sends the request directly to Salesforce REST or Tooling API endpoints for the active org.
4. Responses are rendered locally in the browser. No developer-operated proxy or backend is involved.

## What is stored locally

| Storage area | Keys | Purpose |
|---|---|---|
| `chrome.storage.sync` | `enabledModules`, `orgSettings`, `storageVersion` | Persists module toggles and per-org badge settings across browser sessions. |
| `chrome.storage.local` | `describeCache` | Stores a short-lived Salesforce describe cache with 1-hour TTL and a max of 25 entries. |

## Feature capability map

| Module | Default | Access Level | Capability |
|---|---|---|---|
| Command Palette | enabled | write-capable | Read-only for navigation and metadata search (Profiles, Permission Sets, Flows, Apex Classes, Apex Triggers via SOQL/Tooling API). Write-capable for Toggle Debug Log (creates/deletes TraceFlag and DebugLevel in the active org). SOQL Query mode executes user-typed queries read-only. |
| Field Inspector | enabled | read-only | Read-only. Reads describe metadata from the active org only after the user toggles the inspector on a record page. |
| Quick Copy | enabled | ui-only | UI-only. Copies visible record IDs locally to the clipboard on record pages and list views. |
| Table Filter | enabled | ui-only | UI-only. Filters already-rendered table rows in the browser. Auto-scrolls Lightning tables to hydrate lazy-loaded rows. Auto-selects max pagination on Classic pages. |
| Environment Safeguard | enabled | ui-only | UI-only. Displays a color-coded org badge and updates the browser tab title prefix. Reads per-org customization from `chrome.storage.sync`. |
| Dependency Inspector | disabled | read-only | Read-only. Queries Salesforce Tooling API (`MetadataComponentDependency`) only after the user clicks Deep Scan on an Object Manager field or Apex Class page. |
| Change Set Buddy | disabled | ui-only | UI-only. Enhances Change Set pages already rendered in Salesforce with search, filter, and component type counters. |
| Profile to Permission Set | disabled | write-capable | Write-capable. Reads profile permissions via SOQL and describe, then creates a Permission Set in the same Salesforce org only after the user explicitly completes the wizard and confirms creation. Includes validation, dependency resolution, and rollback on failure. |
| Hide DevOps Center Bar | disabled | ui-only | UI-only. Hides the native DevOps Center navigation bar via CSS injection on all Salesforce pages when the user enables the module. |

## No external service

- SF Boost does not send Salesforce cookies, page content, or metadata to a developer-operated server.
- SF Boost does not use third-party analytics, tracking pixels, or ad networks.
- If the `cookies` permission is blocked by enterprise policy, API-backed modules will not work, but UI-only features still remain local to the page.
