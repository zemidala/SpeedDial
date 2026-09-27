# SpeedDial

A browser extension (Chrome and Edge, Manifest V3) that replaces the new tab page with visual bookmarks:
tiles with site icons and thumbnails, folders with previews, search, themes, and backups to a file or the cloud.
Bookmarks are the browser's own — the extension shows and edits them, it keeps no separate copy.

The interface is in English and Russian.

## Requirements

- Node.js 22.12 or newer (developed on 24)
- Chrome or Edge 123 or newer

## Getting started

```sh
npm install
npm run build
```

Then load the extension: open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**,
click **Load unpacked** and choose the `dist` folder. After a new build, click **Reload** on the extension —
the new tab pages that were open come back with SpeedDial on their own.

### Local settings

Optional build-time values go in `.env.local` (not committed): copy `.env.example` and fill in what you need.
Cloud sign-in (Google Drive, Dropbox, OneDrive) needs registered app Client IDs — see
[docs/cloud-setup.md](docs/cloud-setup.md). WebDAV services (Yandex Disk, Nextcloud) work without them.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Build in watch mode: rebuilds `dist` on every change (then **Reload** the extension) |
| `npm run build` | Production build into `dist` |
| `npm run check` | Type check (`svelte-check`) and lint (`eslint`) |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Build, then end-to-end tests (Playwright) in Chromium with the extension loaded |
| `npm run icons` | Render the extension icons in `public/icons` (and the store logo) from the SVGs in `icon/` |
| `npm run package` | Build and pack `dist` into `release/speeddial-<version>.zip` for the stores (from a commit) |
| `npm run store-assets` | Screenshots (English and Russian) and the promotional tile for the store, into `docs/store` (needs the internet) |

End-to-end tests start a separate browser for each test. `E2E_CHANNEL=msedge npm run test:e2e` runs them in the
installed Edge. The first run needs the browser: `npx playwright install chromium`.

## Versions and builds

The version has four parts, e.g. `2.0.0.52`:

- The first three are the release, set by hand in `public/manifest.json` (and `package.json`).
- The fourth is the build number: the commit count, added to the built manifest by `vite.config.ts`.
  Uncommitted changes count as the next commit, and Settings → About marks such a build.

When the release changes, the next new tab tells the user what's new. The list of changes for each release is in
`whatsNew.releases` in `src/lib/i18n/en.ts` and `src/lib/i18n/ru.ts` — add the new release to both.

### Releasing

1. Set the new version (three parts) in `public/manifest.json` and `package.json`, add its changes to
   `whatsNew.releases`, commit.
2. Tag the commit and push the tag: `git tag -a v2.1.0 -m "SpeedDial 2.1.0"`, then `git push origin v2.1.0`.
3. On GitHub, create a release from the tag (Releases → Draft a new release) with the same list of changes, and
   attach the package from `npm run package`.
4. Upload the same package to the stores; texts, permission notes and assets are in
   [docs/store/listing.md](docs/store/listing.md), the privacy policy in [docs/privacy-policy.md](docs/privacy-policy.md).

## Issues and discussions

Bugs and planned features are GitHub issues, filled in through the forms in `.github/ISSUE_TEMPLATE`
(bug report, feature request). Questions and new ideas go to Discussions (Q&A, Ideas), with forms in
`.github/DISCUSSION_TEMPLATE`; an idea that's agreed on becomes a feature request.

## Project layout

```
public/           Copied into dist as is: manifest.json, icons, _locales, theme-init.js
icon/             Icon sources (SVG) and the script that renders the PNGs
newtab.html       Entry pages (Vite inputs): the new tab, the toolbar popup, the welcome page
popup.html
welcome.html
src/
  background/     Service worker: context menu, thumbnails, link checks, site requests, updates
  newtab/         The new tab page (Svelte): App.svelte, components/, styles/
  popup/          The toolbar popup
  welcome/        The welcome page
  lib/            Shared code: bookmarks, settings, icons, thumbnails, backups, i18n…
    settings/     The settings schema (types, defaults, validation) and storage
    i18n/         Translations: en.ts is the reference, ru.ts has the same keys
    backup/       Backups: file, WebDAV and the OAuth cloud services
tests/e2e/        Playwright tests; fixtures.ts starts Chromium with the extension
docs/             Setup guides
```

Unit tests sit next to the code they test (`*.test.ts`).

## Conventions

- Code, comments, tests and commit messages are in English; Russian appears only in `ru.ts`
  (and in e2e tests, which run the Russian interface).
- Every user-visible string goes through `t` (`src/lib/i18n`), with the same key in `en.ts` and `ru.ts`.
- A new setting goes into `src/lib/settings/schema.ts` (type, default, allowed values) and into `TAB_SETTINGS` in
  `changes.svelte.ts`, so the settings dialog marks it as changed.

## License

Copyright (C) 2026 zemidala

SpeedDial is free software: you can redistribute it and/or modify it under the terms of the
[GNU General Public License, version 3](LICENSE). A modified version you distribute must be released under the same
license, with its source code. The SpeedDial name and icon identify the official version.
