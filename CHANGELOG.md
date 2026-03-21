# Changelog

All notable changes to SF Boost will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.6.0] - 2026-03-21

### Added
- **Field Inspector — Field Usage %**: popover now shows the fill rate of each field (% of records where the field is populated). Uses a single sample SOQL query (`SELECT ... LIMIT 1000`) with a 5-minute cache. Progress bar with colour coding: green >50%, yellow 20–50%, red <20%. Toggleable via new setting `showFieldUsage`.
- **Field Inspector — list view support**: API name badges and metadata popovers now appear on Lightning list view column headers in addition to record pages. Attribute-based field resolution using `data-target-selection-name`, `field-name`, and related attributes for higher-confidence matching.
- **Org Limits Dashboard** (`org-limits` module, disabled by default): modal dashboard showing all Salesforce org limits grouped into API, Storage, Email, and Other categories. Each limit shows usage as a progress bar with colour coding. Includes search/filter and a Refresh button. Accessible as a quick action (📊) in the Command Palette. Uses the Salesforce REST `/limits/` endpoint.
- **Bulk Check** (`bulk-check` module, disabled by default): adds "✓ All" / "✗ All" buttons above checkbox columns on Profile edit, Permission Set edit, and other Setup pages with checkbox tables. Works with Classic Setup iframes via `contentDocument`.
- **Table Filter — Load All button**: a "Load All" button appears automatically on lazy-loaded Lightning tables with more than 200 rows (e.g. Object Manager field lists). Clicking it triggers progressive scroll-hydration to render all rows. Object Manager Fields pages auto-hydrate up to 500 rows.
- **Dependency Inspector — bidirectional analysis**: "Used By" and "Uses" tabs; click any result to navigate to its Setup page; Ctrl+Click copies the component name. Session cache with 5-minute TTL and manual Refresh.
- **Dependency Inspector — expanded page support**: now works on 8 page types — CustomField, ValidationRule, ApexClass, ApexTrigger, Flow, LWC, AuraDefinitionBundle, and AuraDefinitionBundle. Previously only 2 types were supported.
- **Dependency Inspector — filter bar**: search/filter input appears when a tab has 10+ results.
- **Dependency Inspector — Copy All**: exports tab-separated data with Type / Name / Id headers for pasting into Excel.
- **Dependency Inspector — Retry button**: shown on API errors instead of requiring a full page reload.
- **Environment Safeguard — Code Builder**: detects `*.code-builder.platform.salesforce.com` as a distinct environment type and shows an orange "CODE BUILDER" badge with `[CB]` title prefix.
- **Environment Safeguard — refactored appearance and favicon modules**: appearance logic (`appearance.ts`) and favicon recolouring (`favicon.ts`) extracted into separate files. Toggleable individually via module settings: `showClock`, `showFavicon`, `showTitlePrefix`.
- **Settings page** (`entrypoints/settings/`): dedicated HTML page listing all modules with their configurable settings as toggles. Accessible via the "Settings" button in the extension popup footer.
- **Command Palette — improved search tolerance**: fuzzy/typo-tolerant search engine with bigram similarity, consecutive bonus, and prefix matching. Handles typos such as `proflie` → Profile.
- **Command Palette — quick actions persistence**: quick action configuration (hidden built-in IDs, custom actions) stored in `chrome.storage.sync` and survives extension updates.
- **Module settings system**: `ModuleSettingDef` in `modules/catalog.ts` defines per-module boolean settings. `getModuleSettings` / `setModuleSettings` / `getAllModuleSettings` added to `lib/storage.ts`. Modules read their settings on `init()`.

### Changed
- Field Inspector popover updated to include Usage section between the facts and action buttons.
- Command Palette quick action bar now includes Org Limits (📊) as the 7th default action.
- Table Filter description updated to mention Load All functionality.
- `lib/messaging.ts` extended with `getOrgLimits` message type.
- Dependency Inspector injection switched from polling to MutationObserver; added FAB fallback and background probe that disables the button for unresolvable components.

## [0.5.0] - 2026-03-19

### Added
- User Guide (`docs/user-guide.md`) — getting started, module descriptions, keyboard shortcuts, FAQ, troubleshooting
- Chrome Web Store badge and Install section in README
- Environment Safeguard: badge adapts position when DevOps Center bar is visible

## [0.4.0] - 2026-03-15

### Added
- Screenshots in README for Command Palette, Command Palette sub-modes, Profile → Permission Set result, and extension popup

### Changed
- Version bump to 0.4.0

## [0.3.0] - 2025

### Added
- Design tokens system — centralized visual values for all modules
- Enhanced UI components and shared helpers

### Changed
- Profile → Permission Set overhaul: multi-stage wizard with validation, dependency resolution, rollback on failure, progress callbacks, and export options (Copy for Excel, Download CSV)
- Command Palette improvements

## [0.2.0] - 2025

### Added
- Module catalog system with access levels (`ui-only`, `read-only`, `write-capable`)
- Hide DevOps Bar module
- Change Set Buddy module
- Deep Dependency Inspector module
- Environment Safeguard module
- Profile → Permission Set module
- Table Filter module with smart row loading

### Changed
- Major API refactor — background service worker handles all Salesforce calls
- Extended Profile → Permission Set with all permission types

### Fixed
- Memory leaks eliminated, performance improvements
- Hide DevOps Bar extended to all pages

## [0.1.0] - 2024

### Added
- Initial release
- Command Palette with Setup page search
- Field Inspector with API name badges
- Quick Copy for Record IDs
- Find Flow command with fuzzy search
