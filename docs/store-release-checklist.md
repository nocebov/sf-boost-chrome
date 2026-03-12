# SF Boost Store Release Checklist

Last updated: March 7, 2026

## Listing and Privacy tab

- Keep the single-purpose wording consistent: `Salesforce productivity toolkit for admins and developers`.
- In the listing and Privacy tab, explain that the Salesforce `sid` cookie is read locally, only for direct requests to Salesforce, and is not sent to any developer backend.
- Reuse the same privacy language as `docs/privacy-policy.md`, including the Chrome Web Store User Data Policy and Limited Use statement.

## Reviewer package

- Paste the latest contents of `docs/reviewer-notes.md` into the reviewer notes field.
- If possible, provide a dedicated sandbox or demo-org login for review. Without an authenticated Salesforce session, reviewers cannot validate the API-backed features end-to-end.
- Mention that `Profile to Permission Set` is the only write-capable module and that it is disabled by default.

## Screenshots to capture before submission

- Popup with default module states.
- Command Palette opened on a Salesforce page.
- Field Inspector badges on a record page.
- Environment Safeguard badge on a Production or Sandbox page.
- Profile to Permission Set wizard on a profile page.

## Account hygiene before submit

- Verified publisher contact email.
- Two-step verification enabled on the publisher account.
- Correct trader or non-trader status configured in Chrome Web Store.
- Support hub and contact paths aligned with `docs/support.md`.

## Launch settings

- Prefer deferred publish for the first release so approval does not auto-publish immediately.
- For company pilots, evaluate private organization publishing before a public launch.
