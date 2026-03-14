# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install          # Install dependencies
bun run dev          # Dev server with HMR (auto-reloads extension)
bun run build        # Production build → .output/chrome-mv3/
bun run zip          # Package for Chrome Web Store
bun run check        # TypeScript type-check (no emit)
bun run test:smoke   # Popup + content-script smoke test
```

After building, load the unpacked extension from `.output/chrome-mv3/` in `chrome://extensions` with Developer Mode on.

## Architecture

SF Boost is a Chrome Extension (MV3) built with [WXT](https://wxt.dev/), TypeScript, and Bun.

### Entry Points

- **`entrypoints/content/index.ts`** — Content script injected into all Salesforce pages. Imports all modules (triggering self-registration), initializes enabled ones, and patches the History API for SPA navigation detection.
- **`entrypoints/background/index.ts`** — Service worker. Handles all Salesforce API calls (REST, Tooling) via the `onMessage` bridge; retrieves sessions from the `sid` cookie.
- **`entrypoints/popup/main.ts`** — Extension popup for toggling modules on/off. Writes to `chrome.storage.sync`.

### Module System

Each module in `modules/` implements the `SFBoostModule` interface (`modules/types.ts`):

```ts
interface SFBoostModule {
  id: string;
  name: string;
  description: string;
  init(ctx: ModuleContext): Promise<void>;
  onNavigate(ctx: ModuleContext): Promise<void>;
  destroy(): void;
}
```

Modules **self-register** by calling `registry.register(module)` at the bottom of their `index.ts` file. The import in the content script's `index.ts` is what triggers registration.

The `ModuleRegistry` (`modules/registry.ts`) manages lifecycle: `initModules` initializes enabled modules, `onNavigate` propagates URL changes, and `disableModule`/`enableModule` allow runtime toggling.

### Lib Utilities

- **`lib/messaging.ts`** — Type-safe content↔background messaging. `sendMessage(type, data)` from content; `onMessage(type, handler)` in background. All message types are defined in `MessageMap`.
- **`lib/storage.ts`** — `chrome.storage.sync` for enabled module IDs and per-org settings; `chrome.storage.local` for object describe cache (1-hour TTL, max 25 entries). Default-enabled modules come from `modules/catalog.ts`.
- **`lib/salesforce-urls.ts`** — Detects org type (production/sandbox/developer/scratch/trailhead) from hostname; parses Lightning URL path into `PageType` and extracts `objectApiName`/`recordId`.
- **`lib/design-tokens.ts`** — Single source of truth for all visual values (colors, fonts, spacing, radii, shadows, z-indices, transitions). All modules and shared components import `tokens` from here. The popup CSS uses matching CSS custom properties (`--sfb-*`).
- **`lib/ui-helpers.ts`** — Shared DOM utilities: `createModal`, `createSpinner`, `createButton`, `createInput`, `createBadge`, `createFilterBar`. All styled via design tokens.
- **`lib/toast.ts`** — Toast notification helper. Styled via design tokens.

### Background API Layer

`entrypoints/background/api-client.ts` makes all Salesforce HTTP calls (API version `v62.0`):
- `describeObject` — REST describe with cache
- `executeSOQL` / `executeSOQLAll` — SOQL with auto-pagination
- `executeToolingQueryAll` — Tooling API with auto-pagination
- `createPermissionSet` — Multi-step REST creation with progress callbacks

Authentication uses the `sid` cookie read via `chrome.cookies` in `session-manager.ts`.

### Module Overview

| Module ID | Default | Location |
|---|---|---|
| `command-palette` | enabled | `modules/command-palette/` |
| `field-inspector` | enabled | `modules/field-inspector/` |
| `quick-copy` | enabled | `modules/quick-copy/` |
| `table-filter` | enabled | `modules/table-filter/` |
| `environment-safeguard` | enabled | `modules/environment-safeguard/` |
| `deep-dependency-inspector` | disabled | `modules/deep-dependency-inspector/` |
| `hide-devops-bar` | disabled | `modules/hide-devops-bar/` |
| `change-set-buddy` | disabled | `modules/change-set-buddy/` |
| `profile-to-permset` | disabled | `modules/profile-to-permset/` |

### SPA Navigation

The content script patches `history.pushState`/`history.replaceState` and listens to `popstate` to detect navigation. A 1-second polling interval catches any edge cases. On each navigation, `registry.onNavigate(ctx)` is called for all active modules.

### Adding a New Module

1. Create `modules/<module-id>/index.ts`
2. Implement `SFBoostModule` and call `registry.register(module)` at the end
3. Import it in `entrypoints/content/index.ts`
4. Add the module metadata entry to `MODULE_CATALOG` in `modules/catalog.ts`
5. Decide the `defaultEnabled` value in `modules/catalog.ts` because that file is the source of truth for defaults shown in the popup and storage

### Design Tokens

All visual values (colors, spacing, typography, shadows, z-indices, transitions) are centralized in `lib/design-tokens.ts`. When creating or modifying UI in any module:

- **Always** import `tokens` from `../../lib/design-tokens` and use token values instead of hardcoded CSS values
- Use `tokens.color.*` for all colors (brand, text hierarchy, surfaces, borders, semantic)
- Use `tokens.font.size.*` / `tokens.font.weight.*` / `tokens.font.family.*` for typography
- Use `tokens.space.*` for padding, margin, and gap values
- Use `tokens.radius.*` for border-radius
- Use `tokens.shadow.*` for box-shadow
- Use `tokens.zIndex.*` for z-index (layering: badge < fab < overlay < modalBackdrop < modal < toast)
- Use `tokens.transition.*` for transition durations
- Prefer shared components from `lib/ui-helpers.ts` (`createModal`, `createButton`, `createInput`, `createBadge`, `createFilterBar`) over building from scratch
- For the popup (`entrypoints/popup/style.css`), use the matching CSS custom properties (`var(--sfb-*)`) instead of hardcoded values
