# Better Fab Domain Context

## Terms

- **Listing** — A Fab marketplace asset card discovered from a product or listing link.
- **Fab DOM adapter** — The deep module that interprets live or fetched Fab markup. It owns listing discovery, card ownership, seller source location, and marketplace-navigation classification.
- **Seller Profile** — The normalized seller result shared by product and seller pages: selected listings, weighted rating summary, and presentation text. Page adapters only place its rendered view.
- **Mass-Add session** — One run that discovers visible free listings, sequences library and license actions, confirms outcomes, scrolls for more listings, and returns one accounting result.
- **Processing coordinator** — The deep module that receives initialization, startup, message, storage, and mutation triggers, then owns coalescing, retry timing, scan selection, and reconciliation scheduling.
- **Content adapter** — The browser-facing seam in `content.js` that applies module results to the live page and connects Chrome messages and storage events.

## Runtime Module Order

1. `modules/fab-dom-adapter.js`
2. `modules/seller-profile.js`
3. `modules/mass-add.js`
4. `modules/processing-coordinator.js`
5. `content.js`

The manifest and release-package tests protect this order and ensure every runtime module ships in the Chrome Web Store archive.
