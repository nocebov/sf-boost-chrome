# Changelog

All notable changes to SF Boost will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

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
