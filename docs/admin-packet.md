# SF Boost Admin Packet

Last updated: March 7, 2026

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

| Module | Default | Capability |
|---|---|---|
| Command Palette | enabled | Read-only. Setup navigation is local; Flow Search reads Salesforce metadata only after the user enters Flow Search mode. |
| Field Inspector | enabled | Read-only. Reads describe metadata from the active org only after the user toggles the inspector. |
| Quick Copy | enabled | UI-only. Copies visible values locally to the clipboard. |
| Table Filter | enabled | UI-only. Filters already-rendered table rows in the browser. |
| Environment Safeguard | enabled | UI-only. Displays an org badge and updates the browser-action badge. |
| Dependency Inspector | disabled | Read-only. Queries Salesforce Tooling API only after the user clicks `Deep Scan`. |
| Change Set Buddy | disabled | UI-only. Enhances Change Set pages already rendered in Salesforce. |
| Profile to Permission Set | disabled | Write-capable. Creates a Permission Set in the same Salesforce org only after the user explicitly completes the wizard. |
| Hide DevOps Center Bar | disabled | UI-only. Hides a native Salesforce UI bar only when the user enables the module. |

## No external service

- SF Boost does not send Salesforce cookies, page content, or metadata to a developer-operated server.
- SF Boost does not use third-party analytics, tracking pixels, or ad networks.
- If the `cookies` permission is blocked by enterprise policy, API-backed modules will not work, but UI-only features still remain local to the page.
