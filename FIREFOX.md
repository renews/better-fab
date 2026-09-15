# Firefox extension

This release targets Firefox desktop 140 or later.

Build the Firefox release with:

```sh
bun run package:firefox
```

Edit the root extension sources, then run the command to regenerate the
loadable `firefox/` directory and `better-fab-firefox-release-1.1.4.zip`. Do
not edit the generated runtime files in `firefox/`. The directory and archive
contain the same extension runtime files. The Firefox manifest keeps the
stable add-on ID `better-fab@renews`.

For a local smoke test, open
`about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**, and
choose `firefox/manifest.json`. Grant the Fab host permission if Firefox asks.
Temporary add-ons are unsigned and are removed when Firefox restarts.

For a permanent installation, upload the Firefox archive to AMO. AMO signs the
extension, and users install that signed release. Use the same stable ID for
updates.

Better Fab stores its settings in local browser storage and sends no telemetry.
On Fab pages, it reads page data and requests Fab seller pages for seller
metrics. The free-item workflow runs only after the user selects it in the
popup and operates through the Fab page.

Before uploading, load the temporary add-on and check the popup on Fab, a
seller metrics panel on a product page, filter changes on a listing page, and
the user-started free-item workflow.

Validate the generated directory with:

```sh
bunx --bun web-ext lint --source-dir firefox
```

The current lint result is 0 errors and 0 notices, with one Android-only
warning: `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION`. This release keeps
the Firefox desktop minimum at 140 and does not declare Android support.

The generated manifest uses Firefox's documented
[background scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background)
and [browser-specific settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings).
