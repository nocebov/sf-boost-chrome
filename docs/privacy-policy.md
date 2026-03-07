# SF Boost Privacy Policy

Last updated: March 7, 2026

SF Boost is a Chrome extension for Salesforce admins and developers. It runs locally in the browser and is designed to work only with the Salesforce org that is open in the current tab.

## What the extension accesses

- Salesforce page content and DOM on supported Salesforce pages so the extension can add UI helpers such as field badges, table filters, environment indicators, and setup shortcuts.
- The Salesforce `sid` session cookie, read locally via the Chrome Extensions `cookies` API, so the extension can make Salesforce REST and Tooling API requests on the user's behalf.
- Salesforce API responses needed for user-triggered features such as Flow Search, Field Inspector, Deep Dependency Inspector, and Profile to Permission Set.
- Extension settings stored in `chrome.storage.sync`, including enabled modules and per-org environment badge settings.
- Cached describe metadata stored in `chrome.storage.local` to reduce repeated API calls.

## What the extension does not do

- It does not send Salesforce data, cookies, or metadata to any third-party server operated by the developer.
- It does not sell personal data.
- It does not use external analytics, tracking pixels, or ad networks.
- It does not access Salesforce orgs other than the org open in the active Salesforce page that initiated the request.

## How data is used

- Salesforce session data is used only to authenticate requests to Salesforce APIs.
- Salesforce metadata and page content are used only to provide the extension features requested by the user inside the browser.
- Stored extension settings are used only to preserve the user's configuration across browser sessions.

## Data retention

- Settings remain in Chrome storage until the user changes them or removes the extension.
- Local describe-cache entries expire automatically.
- No Salesforce data is stored on developer-controlled servers.

## Contact and support

Support is available at:

- GitHub Issues: https://github.com/nocebov/sf-boost-chrome/issues
- Support page: https://github.com/nocebov/sf-boost-chrome/blob/master/docs/support.md
