# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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
- **`entrypoints/background/index.ts`** — Service worker. Handles all Salesforce API calls (REST, Tooling) via the `onMessage` bridge; retrieves sessions from the `sid` cookie. Also handles storage migration on install, Chrome command shortcuts (`show-command-palette`, `toggle-field-inspector`), badge updates, and long-lived port connections for permission set creation.
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

The `ModuleContext` wraps an `SFPageContext` containing: `url`, `orgType`, `myDomain`, `sandboxName`, `pageType`, `objectApiName`, `recordId`, `instanceUrl`.

Modules **self-register** by calling `registry.register(module)` at the bottom of their `index.ts` file. The import in the content script's `index.ts` is what triggers registration.

The `ModuleRegistry` (`modules/registry.ts`) manages lifecycle: `initModules` initializes enabled modules, `onNavigate` propagates URL changes, and `disableModule`/`enableModule` allow runtime toggling. Each module's `init()` is wrapped in try/catch so one module failing does not take down others.

### Module Catalog

`modules/catalog.ts` defines `ModuleCatalogEntry` with `id`, `name`, `description`, `info`, `defaultEnabled`, and `accessLevel` (one of `ui-only`, `read-only`, `write-capable`). Exports the `MODULE_CATALOG` array plus `DEFAULT_ENABLED_MODULE_IDS` and `DISABLED_BY_DEFAULT_MODULE_IDS`.

### Lib Utilities

- **`lib/messaging.ts`** — Type-safe content↔background messaging. `sendMessage(type, data)` from content; `onMessage(type, handler)` in background. All message types are defined in `MessageMap`: `getSession`, `describeObject`, `executeSOQL`, `executeSOQLAll`, `executeToolingQuery`, `toggleDebugLog`, `createPermissionSet`. Instance URLs are validated via `assertAllowedSalesforceInstanceUrl`. Sender trust is verified via `isTrustedSender()`. A separate `createPermissionSetViaPort` function uses `chrome.runtime.connect()` for long-lived port communication with progress/complete/error messages.
- **`lib/storage.ts`** — `chrome.storage.sync` for enabled module IDs (validated against known IDs) and per-org `OrgSettings` (label, banner/badge colors, badge text, show/hide flags); `chrome.storage.local` for object describe cache (1-hour TTL, max 25 entries). Default-enabled modules come from `modules/catalog.ts`.
- **`lib/salesforce-urls.ts`** — `detectOrgType()` identifies org type (production/sandbox/developer/scratch/trailhead) from hostname. `buildInstanceUrl()` converts `lightning.force.com` and `salesforce-setup.com` hostnames to `my.salesforce.com` for API calls. `parseLightningUrl()` returns `PageType` (record, list, setup, home, app, flow-builder, change-set, other) and optionally `objectApiName`/`recordId`.
- **`lib/design-tokens.ts`** — Single source of truth for all visual values (colors, fonts, spacing, radii, shadows, z-indices, transitions). All modules and shared components import `tokens` from here. The popup CSS uses matching CSS custom properties (`--sfb-*`).
- **`lib/ui-helpers.ts`** — Shared DOM utilities: `createModal`, `createSpinner`, `createButton`, `createInput`, `createBadge`, `createFilterBar`. All styled via design tokens.
- **`lib/toast.ts`** — Toast notification helper. Styled via design tokens.

### Background API Layer

`entrypoints/background/api-client.ts` makes all Salesforce HTTP calls (API version `v63.0`):
- `fetchWithRetry` — 30s timeout, up to 3 retries with exponential backoff for GET/HEAD/OPTIONS on status 408/429/503
- `dedup` — request deduplication for inflight requests
- `describeObject` — REST describe with local cache integration
- `executeSOQL` / `executeSOQLAll` — SOQL with auto-pagination (up to 50,000 records)
- `executeToolingQuery` / `executeToolingQueryAll` — Tooling API queries with same pagination
- `getCurrentUserId` — extracts user ID from the identity endpoint
- `toolingCreate` / `toolingDelete` — Tooling API DML operations
- `toggleDebugLog` — checks for existing active TraceFlag, deletes if found, otherwise creates a 30-minute FINEST trace flag using DebugLevel `SFBoost_Debug`
- `createPermissionSet` — Multi-step REST creation with validation, dependency resolution (auto-adds parent object Read permissions), rollback on failure, and progress callbacks. Steps: validate field permissions, validate object permissions, create PermissionSet, add ObjectPermissions (multi-pass), FieldPermissions, UserPermissions (single PATCH), TabSettings, SetupEntityAccess. Handles duplicate insert errors gracefully.

Authentication uses the `sid` cookie read via `chrome.cookies` in `session-manager.ts`.

### Module Overview

| Module ID | Default | Access Level | Location |
|---|---|---|---|
| `command-palette` | enabled | write-capable | `modules/command-palette/` |
| `field-inspector` | enabled | read-only | `modules/field-inspector/` |
| `quick-copy` | enabled | ui-only | `modules/quick-copy/` |
| `table-filter` | enabled | ui-only | `modules/table-filter/` |
| `environment-safeguard` | enabled | ui-only | `modules/environment-safeguard/` |
| `deep-dependency-inspector` | disabled | read-only | `modules/deep-dependency-inspector/` |
| `hide-devops-bar` | disabled | ui-only | `modules/hide-devops-bar/` |
| `change-set-buddy` | disabled | ui-only | `modules/change-set-buddy/` |
| `profile-to-permset` | disabled | write-capable | `modules/profile-to-permset/` |

### SPA Navigation

The content script patches `history.pushState`/`history.replaceState` and listens to `popstate` to detect navigation. A 1-second polling interval catches any edge cases. On each navigation, `registry.onNavigate(ctx)` is called for all active modules.

### Adding a New Module

1. Create `modules/<module-id>/index.ts`
2. Implement `SFBoostModule` and call `registry.register(module)` at the end
3. Import it in `entrypoints/content/index.ts`
4. Add the module metadata entry to `MODULE_CATALOG` in `modules/catalog.ts`
5. Decide the `defaultEnabled` and `accessLevel` values in `modules/catalog.ts` because that file is the source of truth for defaults shown in the popup and storage

### Session Log

**Обов'язково** після завершення будь-яких змін у коді — додати запис до `SESSION_LOG.md` у корені проєкту.

Формат запису:

```
## YYYY-MM-DD

**Зроблено:**
- ...

**Ціль:** ...
```

Правила:
- Новий запис **завжди додається вгорі файлу** (після `---` під заголовком), не в кінці
- Файл ведеться у зворотному хронологічному порядку: найновіший запис зверху
- Один блок на сесію (якщо кілька задач — перелічити в одному блоці)
- Якщо в один день кілька сесій — нумерувати суфіксом: `YYYY-MM-DD`, `YYYY-MM-DD (2)`, `YYYY-MM-DD (3)` і т.д.
- `SESSION_LOG.md` є в `.gitignore` — файл локальний, до репозиторію не потрапляє
- Додавати запис навіть якщо зміни мінімальні (bump версії, правки конфігу тощо)

---

### Version Management & Chrome Web Store Publishing

#### Versioning rules

- Version is defined in **`wxt.config.ts`** (`manifest.version`) — single source of truth
- Use **semver**: `MAJOR.MINOR.PATCH`
  - `PATCH` — bug fixes, copy changes, minor visual tweaks
  - `MINOR` — new module or significant feature
  - `MAJOR` — breaking change in storage schema, permissions, or architecture
- **Always bump the version** before running `bun run zip` for submission — the Web Store rejects a zip with the same version as a previously uploaded draft
- Commit the version bump separately with message format: `chore: bump version to X.Y.Z`

#### What triggers manual review (avoid when possible)

- Adding or changing **`permissions`** or **`host_permissions`** in the manifest
- Adding new **remote code execution** or `eval` usage
- Changing the **extension name or description** significantly
- First submission of a new extension

#### What minimizes review time

- Keep each release **focused** — fewer unrelated changes per submission
- Do **not** change `permissions` unless strictly necessary
- Provide clear **reviewer notes** in the Developer Dashboard explaining what changed and why (especially for write-capable features)
- `skip-review` (declarativeNetRequest only) **does not apply** to SF Boost — do not attempt to use it

#### Release checklist

Before running `bun run zip` and uploading:

1. [ ] `version` bumped in `wxt.config.ts`
2. [ ] `bun run check` passes (no TS errors)
3. [ ] `bun run test:smoke` passes
4. [ ] `bun run build` produces a clean `.output/chrome-mv3/`
5. [ ] Reviewer notes drafted for the Dashboard (what changed, why it's safe)
6. [ ] `SESSION_LOG.md` updated

---

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
