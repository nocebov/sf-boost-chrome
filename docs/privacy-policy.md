# SF Boost — Privacy Policy

**Last updated: March 14, 2026**

SF Boost ("the extension") is a Chrome browser extension for Salesforce administrators and developers. Its sole purpose is to improve day-to-day productivity within the native Salesforce user interface. The extension runs entirely inside the user's browser and communicates only with the Salesforce org the user already has open.

---

## 1. Summary

| Topic | Position |
|---|---|
| Data sent to developer servers | **Never** |
| Personal data collected | **None** |
| Analytics or tracking | **None** |
| Advertising | **None** |
| Data sold or transferred to third parties | **Never** |
| Data used for unrelated purposes | **Never** |

This extension complies with the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq/), including the **Limited Use** requirements. All user data is used solely to provide the features visible to the user in the browser.

---

## 2. What Data the Extension Accesses

### 2.1 Salesforce Session Cookie (`sid`)

The extension reads the Salesforce `sid` session cookie **locally** using the Chrome `cookies` API. This is the same session the user already has active in their browser. The cookie is used only to authenticate requests sent directly from the browser to the user's own Salesforce org. The value is never forwarded to any server operated by the developer, never stored permanently, and never logged.

### 2.2 Salesforce Page Content and DOM

The extension's content script runs on Salesforce pages (`*.salesforce.com`, `*.my.salesforce.com`, `*.lightning.force.com`, `*.salesforce-setup.com`) to add UI enhancements: field labels, table filters, environment indicators, keyboard shortcuts, copy buttons, and setup helpers. No page content is transmitted outside the browser.

### 2.3 Salesforce REST and Tooling API Responses

Several features query the user's Salesforce org via the REST and Tooling APIs:
- **Field Inspector** reads object describe metadata.
- **Command Palette** queries Profiles, Permission Sets, Flows, Apex Classes, and Apex Triggers for metadata search, and can toggle debug logs (creating/deleting TraceFlag and DebugLevel records).
- **Deep Dependency Inspector** queries `MetadataComponentDependency` via the Tooling API.
- **Profile to Permission Set** reads profile permissions and creates a new Permission Set with associated permission records.

Responses are used immediately to display information to the user or, in the case of object metadata, cached locally for up to one hour to reduce redundant network requests. No API response data is sent to developer-operated infrastructure.

### 2.4 Extension Settings (`chrome.storage.sync`)

The extension stores the following values in Chrome's synced storage so preferences are preserved across browser sessions and devices signed in to the same Chrome profile:

- `enabledModules` — list of module IDs the user has toggled on or off
- `orgSettings` — per-org UI preferences (e.g., environment badge label, colors)
- `storageVersion` — internal migration marker

These values contain no personally identifiable information and no Salesforce data.

### 2.5 Object Describe Cache (`chrome.storage.local`)

Salesforce object metadata (field names, types, labels) fetched by the Field Inspector is cached in local storage with a one-hour TTL and a maximum of 25 entries. The cache is used solely to avoid redundant API calls and is never read by the developer.

---

## 3. What the Extension Does Not Do

- Does **not** transmit any data — Salesforce content, API responses, session cookies, or settings — to any server controlled by the developer.
- Does **not** collect, store, or process personally identifiable information (PII).
- Does **not** use analytics services, crash reporting backends, tracking pixels, or ad networks.
- Does **not** run on any website other than `*.salesforce.com`, `*.my.salesforce.com`, `*.lightning.force.com`, and `*.salesforce-setup.com`.
- Does **not** access Salesforce orgs other than the one the user has open in the active tab.
- Does **not** modify Salesforce data except when the user explicitly invokes write-capable features: **Profile to Permission Set** (creates a new permission set) and **Command Palette Toggle Debug Log** (creates/deletes TraceFlag and DebugLevel records). Both operate only in the user's own org via the standard Salesforce REST and Tooling APIs.
- Does **not** use remote code execution (no `eval`, no externally hosted scripts).

---

## 4. Permissions Justification

| Permission | Why it is needed |
|---|---|
| `storage` | Save and sync the user's enabled-module preferences and per-org settings via `chrome.storage.sync`; cache object metadata via `chrome.storage.local`. |
| `cookies` | Read the `sid` session cookie locally so the extension can authenticate Salesforce API requests on the user's behalf without requiring a separate login. |
| Host: `*://*.salesforce.com/*` | Required to inject the content script and make API calls to standard Salesforce production orgs. |
| Host: `*://*.my.salesforce.com/*` | Required to support Salesforce My Domain orgs (the standard for Enterprise and Unlimited editions). |

No other permissions are requested. The extension does not request `<all_urls>`, `tabs`, `history`, `bookmarks`, `downloads`, `identity`, or any broad host permission.

---

## 5. Data Retention and Deletion

- **Session cookie:** read at the moment of an API call; never written or persisted by the extension.
- **Extension settings:** retained in Chrome storage until the user changes them, resets Chrome sync, or uninstalls the extension. Uninstalling the extension removes all locally stored data.
- **Describe cache:** individual entries expire automatically after one hour; the total cache is capped at 25 entries and the oldest entries are evicted first.
- **Developer servers:** no Salesforce data is ever stored on developer-controlled infrastructure — there is no developer-operated backend for this extension.

---

## 6. Limited Use Compliance

SF Boost's use of data obtained through Chrome extension APIs conforms to the Chrome Web Store [Limited Use Policy](https://developer.chrome.com/docs/webstore/program-policies/limited-use/):

1. Data is used only to provide or improve the user-facing features described in the store listing.
2. Data is not transferred to third parties except as necessary to provide the user-facing features (there are no such transfers).
3. Data is not used for advertising purposes.
4. Data is not used for creditworthiness determinations or lending.
5. Data is not sold.

---

## 7. Children's Privacy

This extension is a professional developer tool intended for Salesforce administrators and developers. It is not directed at children under the age of 13. The extension does not knowingly collect any information from children.

---

## 8. Changes to This Policy

If a future update changes how the extension accesses or handles data, this document will be updated and a new `Last updated` date will be set. Significant changes will be noted in the release notes for that version.

---

## 9. Contact and Support

For questions about this privacy policy or about data handling:

- **GitHub Issues:** https://github.com/nocebov/sf-boost-chrome/issues
- **Support documentation:** https://github.com/nocebov/sf-boost-chrome/blob/master/docs/support.md
