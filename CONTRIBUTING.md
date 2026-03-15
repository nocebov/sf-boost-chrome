# Contributing to SF Boost

Thanks for your interest in contributing to SF Boost! This guide will help you get started.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (package manager & runtime)
- [Google Chrome](https://www.google.com/chrome/) with Developer Mode enabled
- A Salesforce org to test against

### Setup

```bash
git clone https://github.com/nocebov/sf-boost-chrome.git
cd sf-boost-chrome
bun install
bun run dev
```

Load the unpacked extension from `.output/chrome-mv3/` in `chrome://extensions`.

## How to Contribute

### Reporting Bugs

Use the [Bug Report](https://github.com/nocebov/sf-boost-chrome/issues/new?template=bug_report.md) issue template. Include:
- Steps to reproduce
- Expected vs actual behavior
- Chrome version and Salesforce edition (Classic/Lightning)

### Requesting Features

Use the [Feature Request](https://github.com/nocebov/sf-boost-chrome/issues/new?template=feature_request.md) issue template.

### Submitting a Pull Request

1. Fork the repo and create a branch from `master`
2. Make your changes
3. Run all checks before submitting:
   ```bash
   bun run check       # TypeScript type-check
   bun run test        # Unit tests (vitest)
   bun run build       # Ensure it builds
   bun run test:smoke  # Smoke tests (Puppeteer)
   ```
4. Open a PR with a clear description of what you changed and why

## Adding a New Module

1. Create `modules/<module-id>/index.ts`
2. Implement the `SFBoostModule` interface (see `modules/types.ts`)
3. Call `registry.register(module)` at the bottom of the file
4. Import the module in `entrypoints/content/index.ts`
5. Add a catalog entry in `modules/catalog.ts` with `id`, `name`, `description`, `defaultEnabled`, and `accessLevel`

### Access Levels

- `ui-only` — DOM-only changes, no Salesforce API calls
- `read-only` — reads data via API but never writes
- `write-capable` — can create/modify Salesforce metadata

## Testing

### Automated Tests

SF Boost uses three levels of automated testing:

| Command | Tool | What it tests |
|---------|------|---------------|
| `bun run check` | TypeScript | Type safety across all files |
| `bun run test` | Vitest | Unit tests for pure logic (URL parsing, search, storage, catalog, registry) |
| `bun run test:smoke` | Puppeteer | Extension loads correctly in Chrome, popup renders, content script injects |

#### Unit Tests (`tests/`)

Unit tests cover all pure-logic modules that don't depend on the DOM or Chrome APIs:

- **`salesforce-urls.test.ts`** — org type detection, instance URL building, Lightning URL parsing
- **`salesforce-utils.test.ts`** — Salesforce ID validation, SOQL escaping, CSS color validation, domain/URL security checks
- **`storage.test.ts`** — module ID normalization, org settings, describe cache TTL & eviction (uses chrome.storage mock)
- **`search-engine.test.ts`** — fuzzy search scoring: exact, starts-with, word initials, substring, fuzzy, keyword matches
- **`catalog.test.ts`** — catalog integrity: all 9 modules present, unique IDs, access levels, default-enabled/disabled sets
- **`registry.test.ts`** — module lifecycle: register, init, navigate, enable/disable, destroy, error isolation

Run in watch mode during development:

```bash
bun run test:watch
```

#### Writing New Tests

1. Create `tests/<module-name>.test.ts`
2. Import the module under test directly
3. For Chrome API dependencies, mock `chrome.storage` / `chrome.runtime` before importing (see `storage.test.ts` for example)
4. Focus on edge cases: invalid inputs, empty values, error handling, boundary conditions

### Manual QA

Before publishing a new version, run through the full manual QA checklist in [`QA_CHECKLIST.md`](./QA_CHECKLIST.md). It covers all 9 modules, SPA navigation, cross-browser checks, and security verification.

## Code Guidelines

- **TypeScript** — all code must pass `bun run check` with no errors
- **Design tokens** — use `tokens` from `lib/design-tokens.ts` for all visual values (colors, spacing, shadows, etc.). Never hardcode CSS values.
- **Shared components** — use helpers from `lib/ui-helpers.ts` (`createModal`, `createButton`, `createInput`, etc.) before building from scratch
- **Messaging** — all Salesforce API calls go through the background script via `lib/messaging.ts`. Never call Salesforce APIs directly from content scripts.
- **Error isolation** — each module's `init()` is wrapped in try/catch. One module failing must not break others.

## Questions?

Open a [Discussion](https://github.com/nocebov/sf-boost-chrome/discussions) or an issue — happy to help!
