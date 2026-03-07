# SF Boost Reviewer Notes

Last updated: March 7, 2026

## Summary

SF Boost is a Salesforce productivity toolkit for admins and developers. It enhances the Salesforce UI with optional workflow helpers and uses the current Salesforce session only for user-triggered REST and Tooling API calls to the active org.

## Test prerequisites

- A valid Salesforce login is required.
- Test in a Salesforce Lightning org on supported `salesforce.com`, `my.salesforce.com`, `lightning.force.com`, or `salesforce-setup.com` pages.

## Suggested review paths

1. Open any record page and press `Alt+Shift+F` to test Field Inspector.
2. Open any Salesforce page and press `Alt+Shift+S` to test the Command Palette.
3. Open an Object Manager field page or an Apex Class page, enable `Dependency Inspector` in the popup, then click `Deep Scan`.
4. Open a Profile page in Setup, enable `Profile to PermSet` in the popup, then click `Extract to Permission Set`.
5. Open Setup list pages to verify Table Filter.
6. Enable `Change Set Buddy` in the popup, then open a Change Set page to verify Change Set filtering helpers.

## Disabled by default

- Dependency Inspector
- Change Set Buddy
- Profile to PermSet

## Permissions rationale

- `storage`: stores enabled modules, org badge settings, and a small local describe cache.
- `cookies`: reads the Salesforce `sid` cookie locally so the extension can authenticate Salesforce API calls.
- Host permissions are limited to Salesforce API domains used by the extension.

## Network behavior

- The extension calls only Salesforce REST and Tooling API endpoints for the active org.
- The extension does not send data to any developer-operated backend.
