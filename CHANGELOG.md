# Changelog

All notable changes to Better Fab are documented in this file.

## [1.1.2] - 2026-07-15

### Fixed

- Prevented Mass-Add from opening product detail pages when library controls are nested inside card links or alternate Fab detail routes contain action text.
- Corrected product and seller-page review totals by excluding unrelated recommendation sections and packages linked to other sellers.
- Prevented packages with multiple product links from being counted more than once.
- Matched canonical seller URL identities with visible seller names so slug formatting cannot hide a vendor's own packages.

## [1.1.1] - 2026-07-11

### Added

- Added dedicated Fab DOM, Seller Profile, Mass-Add, and processing-coordinator runtime modules.
- Added `CONTEXT.md` with the extension's domain terms and content-script load order.
- Added module, integration, lifecycle, persistence, and release-package regression coverage.
- Added deterministic Bun-based Chrome Web Store packaging with atomic archive replacement and cross-timezone reproducibility checks.
- Added visible popup errors for initialization, persistence, Mass-Add, and content-script broadcast failures.

### Changed

- Made Mass-Add a single session with owned busy state, cancellation, license selection, scrolling, outcome confirmation, and result accounting.
- Limited free-item detection to explicit free labels, currency symbols, currency codes, or price context.
- Unified product-page and seller-page metrics through one Seller Profile analysis and presentation path.
- Routed initialization, startup retries, messages, storage changes, and DOM mutations through one processing coordinator.
- Serialized popup settings writes and based rollbacks on the last successfully persisted state.
- Updated the downloads-permission documentation to describe configuration exports rather than marketplace-asset downloads.

### Fixed

- Fixed paid listings with zero reviews being mistaken for free listings.
- Fixed `Add to cart`, unchanged card text, and unrelated `owned` or `saved` copy being treated as successful library additions.
- Fixed duplicate Mass-Add requests reporting success instead of an already-running error.
- Fixed deactivation allowing delayed Mass-Add clicks, license actions, scrolling, or inflated attempt counts.
- Fixed initially owned listings being counted as missing action buttons.
- Fixed localized review counts such as `1.234` being parsed as decimal values instead of grouped thousands.
- Fixed transient content-setting reads and legacy activation state producing inconsistent startup behavior.
- Fixed stale, failed, or late Seller Profile requests surviving navigation, deactivation, seller changes, or widget replacement.
- Fixed popup write races that could lose newer user intent or leave failed changes visible.
- Fixed rejected tab broadcasts being silently ignored after a successful save.
- Fixed late background startup work overwriting the latest toolbar badge state.

## [1.1] - 2026-07-10

### Added

- Added the privacy policy and repository links.

### Changed

- Renamed the MIT license file to `LICENSE.md` and refreshed the README documentation.

### Fixed

- Fixed seller-page package and review metric counting.

## [1.0] - 2026-06-24

### Added

- Added saved-item, ignored-seller, keyword, review-count, and rating filters.
- Added seller ignore controls and persistent local configuration.
- Added Mass-Add for visible free marketplace items.
- Added seller metrics, product-page Seller Profile details, and automatic description expansion.
