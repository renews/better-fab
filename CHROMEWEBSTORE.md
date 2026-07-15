# Chrome Web Store Listing — Better Fab

> Current Package Version: 1.1.2
>
> Last Updated: 2026-07-15

## Store Listing

**Extension Name** [REQUIRED]
Better Fab

**Short Description** [REQUIRED]
Supercharge Fab.com with powerful filters to hide ignored sellers, sort by ratings, view detailed seller metrics, and auto-add free assets.

**Detailed Description** [REQUIRED]
Better Fab transforms your experience on the Epic Games Fab marketplace by giving you advanced tools to curate, filter, and automate your workflow.

Features:
- Filter out items from sellers you want to ignore.
- Filter out items by specific keywords.
- Require a minimum number of reviews for items to appear.
- Advanced sorting: Sort items by rating to easily find the highest quality assets.
- Mass-Add Free Items: Automatically scrolls through the page and adds all visible free items directly to your library with a single click, saving you countless hours of manual clicking.
- Hide items you already own from search results.
- Product Page Enhancements: Automatically expands product descriptions so you don't have to click "Show More", and injects a detailed seller metrics profile directly under the title (showing total packages, review counts, and average star ratings).
- One-Click Ignore: Ignore sellers directly from their product page or seller profile.

How to Use:
Simply click the Better Fab icon in your browser toolbar while on Fab.com. Use the popup menu to configure your filters, manage your ignored sellers list, or trigger the "Add Displaying Free Items" automation.

Privacy & Permissions:
Better Fab requires access to Fab.com to apply its layout filters and automate button clicks on your behalf. All filtering configurations are stored locally on your device using Chrome's local storage API. We do not track, collect, or transmit any of your personal data.

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
Provides advanced filtering, sorting, and automation tools for the Epic Games Fab marketplace.

**Primary Language** [REQUIRED]
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | logo128.png |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 3 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | |

### Screenshot Notes
- **Screenshot 1**: Show the Better Fab popup menu open while on a Fab.com search results page, highlighting the configuration options (Min Reviews, Ignore Sellers, etc.).
- **Screenshot 2**: Show the Fab.com grid with filtered items cleanly removed, and the "Sorted by Rating" overlay or visual indicator if applicable.
- **Screenshot 3**: Show the mass-add feature in action or the success summary alert indicating that items were automatically added to the library.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Used to save the user's custom filter preferences, ignored seller lists, and configuration settings locally so they persist across browser sessions. |
| `downloads` | permissions | Required to allow the user to export their extension configuration (e.g., their list of ignored sellers and keywords) as a backup file. |
| `*://*.fab.com/*` | host_permissions | Required to inject the content scripts that apply layout filters, hide unwanted items, sort the asset grid, and automate clicking the "Add to Library" buttons on Fab.com. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [RECOMMENDED]
*(Provide a URL if you choose to host one, e.g., on GitHub Pages, outlining that no user data is collected or transmitted off-device).*

## Distribution

**Visibility**: Public
**Regions**: All regions
**Pricing**: Free

## Developer Info

**Publisher Name** [REQUIRED]
*(Your Developer Name)*

**Contact Email** [REQUIRED]
*(Your Developer Email)*

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.1.2 | 2026-07-15 | Prevented Mass-Add detail-page navigation and corrected vendor package, review, and seller-identity aggregation on product and seller pages. | Current draft |
| 1.1.1 | 2026-07-11 | Patch release containing the completed Mass-Add safety, product lifecycle, popup persistence, badge ordering, modular runtime, regression coverage, deterministic packaging, and privacy-documentation improvements. | Prior package |
| 1.1 | 2026-07-10 | Improved Mass-Add safety and result verification; fixed localized review counts, product-page lifecycle retries and cleanup, popup persistence error handling, and badge update ordering; modularized the runtime into fixture-backed Fab DOM, Seller Profile, Mass-Add, and processing modules; added reproducible release packaging and aligned privacy documentation. | Prior package |
| 1.0 | 2026-06-24 | Initial release: Advanced filtering, ignored sellers, review count limits, rating sorting, automated mass-add for free items, and product page enhancements (seller metrics & auto-expand descriptions). | Superseded |

> Release package: upload version 1.1.2. The manifest, store metadata, and generated archive filename are aligned to this patch version.
