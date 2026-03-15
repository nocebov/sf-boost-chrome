# Pre-Deploy QA Checklist

Manual testing checklist before publishing a new version to the Chrome Web Store.

> Run all automated checks first: `bun run check && bun run test && bun run build && bun run test:smoke`

---

## Setup

- [ ] Load the unpacked extension from `.output/chrome-mv3/` in `chrome://extensions` (Developer Mode)
- [ ] Have access to at least one **Production** and one **Sandbox** Salesforce org
- [ ] Open Chrome DevTools console to watch for errors during testing

---

## 1. Extension Popup

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1.1 | Click the SF Boost icon in the toolbar | Popup opens, shows module list with toggles |
| 1.2 | Verify default-enabled modules are ON | Command Palette, Field Inspector, Quick Copy, Table Filter, Environment Safeguard are checked |
| 1.3 | Verify default-disabled modules are OFF | Dependency Inspector, Change Set Buddy, Profile to Permission Set, Hide DevOps Bar are unchecked |
| 1.4 | Toggle a module OFF, reload the Salesforce page | Module is no longer active on the page |
| 1.5 | Toggle a module ON, verify it activates immediately | Module starts working without page reload |
| 1.6 | Click "Keyboard Shortcuts" link | Opens `chrome://extensions/shortcuts` |
| 1.7 | Verify version number matches `package.json` | Version label in popup footer is correct |
| 1.8 | Close and reopen popup — toggles persist | Same modules remain enabled/disabled |

---

## 2. Environment Safeguard

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 2.1 | Open a **Production** org | Red "PRODUCTION" badge appears in top-left corner |
| 2.2 | Open a **Sandbox** org | Green badge with sandbox name appears |
| 2.3 | Check browser tab title | Tab title is prefixed with environment label (e.g., `[PROD]` or `[SANDBOX_NAME]`) |
| 2.4 | Check extension badge (icon) | Background color matches org type (red/green/blue/purple) |
| 2.5 | Navigate to Flow Builder | Badge hides automatically (no overlap with toolbar) |
| 2.6 | Navigate away from Flow Builder | Badge reappears |
| 2.7 | Test with different org types (Dev, Scratch) if available | Correct color and label for each type |

---

## 3. Command Palette

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 3.1 | Press `Alt+Shift+S` | Command Palette modal opens |
| 3.2 | Press `Alt+Shift+S` again | Modal closes (toggle behavior) |
| 3.3 | Press `Escape` | Modal closes |
| 3.4 | Click backdrop (outside modal) | Modal closes |
| 3.5 | Type a Setup page name (e.g., "users") | Matching commands appear in the list |
| 3.6 | Use arrow keys to navigate results | Selection moves up/down correctly |
| 3.7 | Press `Enter` on a selected result | Navigates to that Setup page |
| 3.8 | Type "ps" (word initials) | "Permission Sets" appears in results |
| 3.9 | Click a quick action button (e.g., "Flows") | Switches to Find Flows sub-mode, searches flows via SOQL |
| 3.10 | Test "Quick SOQL" — enter a SOQL query | Results display correctly, errors show clear messages |
| 3.11 | Test "Debug Log" toggle | Creates/deletes TraceFlag. Badge or message confirms state |
| 3.12 | Open palette while in an input/textarea | Palette does NOT open (prevents shortcut conflicts) |
| 3.13 | Edit quick actions: add a custom URL action | Custom action appears in the quick action bar |
| 3.14 | Edit quick actions: hide a built-in action | Action disappears from the bar |
| 3.15 | Reset quick actions to defaults | All built-in actions restored, custom actions removed |
| 3.16 | Press number keys 1-9 when palette is open | Corresponding quick action triggers |

---

## 4. Field Inspector

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 4.1 | Open a record page (e.g., Account) | API name badges appear next to field labels |
| 4.2 | Click a badge | API name is copied to clipboard; badge turns green with "Copied!" |
| 4.3 | Badge reverts after copy | Color returns to normal after ~1-2 seconds |
| 4.4 | Expand a collapsed section on the record | New badges appear for newly visible fields |
| 4.5 | Navigate to a different record type | Badges update for the new object's fields |
| 4.6 | Navigate to a non-record page (list, setup) | No badges appear |
| 4.7 | Press `Alt+Shift+F` (toggle shortcut) | Field Inspector toggles on/off |

---

## 5. Quick Copy

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 5.1 | Open a record page | Copy button appears next to the Record ID in the header |
| 5.2 | Click the copy button | Record ID is copied to clipboard |
| 5.3 | Open a list view | Hover over a row — copy icon appears next to the record name |
| 5.4 | Click the copy icon on a list row | Record ID from that row is copied to clipboard |
| 5.5 | Navigate between records | Copy button updates for the new record |
| 5.6 | Scroll down in a long list view | Copy icons appear on lazy-loaded rows |

---

## 6. Table Filter

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 6.1 | Open a Setup list view (e.g., Custom Objects) | Filter bar appears above the table |
| 6.2 | Type a search term | Table rows filter instantly, matching text is highlighted |
| 6.3 | Type multiple space-separated terms | AND logic: only rows matching ALL terms are shown |
| 6.4 | Clear the search input | All rows reappear |
| 6.5 | Filter returns no matches | "No matches" message appears |
| 6.6 | Test on a table with many rows (100+) | Lazy hydration scrolls to load all rows before filtering |
| 6.7 | Verify row count updates | Count next to filter bar reflects visible/total rows |
| 6.8 | Test on Classic Setup page with pagination | Auto-selects max records per page |
| 6.9 | Navigate to a different Setup list | Filter bar updates for the new table |

---

## 7. Deep Dependency Inspector (disabled by default)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 7.1 | Enable the module in the popup | Module activates |
| 7.2 | Open Object Manager → a custom field page | "Deep Scan" button appears |
| 7.3 | Click "Deep Scan" | Modal shows dependencies (components referencing this field) |
| 7.4 | Open an Apex Class page in Setup | "Deep Scan" button appears |
| 7.5 | Click "Deep Scan" on Apex Class | Modal shows dependencies for the class |
| 7.6 | Test on a field with no dependencies | Modal shows "No dependencies found" |

---

## 8. Change Set Buddy (disabled by default)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 8.1 | Enable the module in the popup | Module activates |
| 8.2 | Navigate to an Outbound Change Set → Add Components | Filter bar appears above the component list |
| 8.3 | Type a search term | Components filter correctly |
| 8.4 | Verify component type breakdown | Shows counts per component type |
| 8.5 | Navigate away from Change Set pages | Module UI disappears |

---

## 9. Profile to Permission Set (disabled by default)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 9.1 | Enable the module in the popup | Module activates |
| 9.2 | Open a Profile page in Setup | "Extract to Permission Set" button appears |
| 9.3 | Click the button — wizard starts | Shows progress steps: reading permissions, creating PermSet |
| 9.4 | Complete the wizard | Report shows: applied, warnings, duplicates, stats |
| 9.5 | Verify the created Permission Set exists in the org | New PermSet is visible in Setup → Permission Sets |
| 9.6 | Run wizard on a Profile with complex permissions | All object, field, user, tab, and entity permissions are transferred |
| 9.7 | Open a Permission Set page (not Profile) | Button does NOT appear (only for Profiles) |

---

## 10. Hide DevOps Bar (disabled by default)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 10.1 | Enable the module in an org with DevOps Center | DevOps bar at the bottom disappears |
| 10.2 | Navigate between pages | Bar stays hidden |
| 10.3 | Disable the module | DevOps bar reappears |

---

## 11. SPA Navigation

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 11.1 | Click internal links in Salesforce | Modules update correctly without page reload |
| 11.2 | Use browser back/forward buttons | Modules respond to history navigation |
| 11.3 | Navigate rapidly between pages | No stale UI, no duplicate elements |
| 11.4 | Open the same page in multiple tabs | Each tab works independently |

---

## 12. Cross-Browser & Edge Cases

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 12.1 | Test in Chrome (latest stable) | All modules work correctly |
| 12.2 | Test with multiple Salesforce tabs open | Extension works in each tab independently |
| 12.3 | Reload extension via `chrome://extensions` | Extension recovers; all modules re-initialize on next page load |
| 12.4 | Test with slow network (Chrome DevTools throttling) | API calls retry correctly; UI doesn't break |
| 12.5 | Open a non-Salesforce page | Extension does not inject, no console errors |
| 12.6 | Check DevTools console for errors during all tests | No `[SF Boost]` errors in the console |

---

## 13. Security & Privacy

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 13.1 | Verify extension only activates on Salesforce domains | Content script doesn't run on other sites |
| 13.2 | Check that session tokens are not logged | No session IDs in console output |
| 13.3 | Verify API calls use HTTPS only | No HTTP requests in Network tab |
| 13.4 | Test with expired/invalid session | Extension handles gracefully — no unhandled errors |

---

## Sign-Off

| Check | Status |
|-------|--------|
| `bun run check` passes | [ ] |
| `bun run test` passes | [ ] |
| `bun run build` passes | [ ] |
| `bun run test:smoke` passes | [ ] |
| Manual QA above — all critical tests pass | [ ] |
| Version bumped in `package.json` + `wxt.config.ts` | [ ] |
| CHANGELOG / release notes prepared | [ ] |
