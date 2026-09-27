# Store listing

Texts and assets for the extension stores (Edge Add-ons first, Chrome Web Store later). Copy each field as is.

- **Package:** `npm run package` → `release/speeddial-<version>.zip` (made from a commit; see README → Releasing).
- **Privacy policy URL:** https://github.com/zemidala/SpeedDial/blob/main/docs/privacy-policy.md
- **Website / support URL:** https://github.com/zemidala/SpeedDial · issues: https://github.com/zemidala/SpeedDial/issues
- **Category:** Productivity
- **Assets** in this folder: logo 300×300 (`logo-300.png`, from `npm run icons`); screenshots 1280×800, four per
  language (`screenshot-*-en.png`, `screenshot-*-ru.png`) and the small promotional tile 440×280 (`promo-440x280.png`),
  both from `npm run store-assets`.

---

## English

**Name:** SpeedDial

**Short description** (from the manifest):
Visual bookmarks on the new tab page: tiles with site icons and thumbnails, folders, themes and cloud backups

**Description:**

Your browser's bookmarks on the new tab page — as tiles with site icons and page thumbnails.

SpeedDial shows the bookmarks you already have. Nothing to import or set up: open a new tab, and your bookmarks bar is
there. Add, edit, sort and drag tiles; SpeedDial changes the browser's own bookmarks, so they stay in sync with the
browser's bookmark manager and your account.

• Folders with previews of what's inside, and a picture of your own for any folder
• Drag and drop, selecting several tiles, moving and exporting them together
• Search across all bookmarks; Enter searches the web, with recent searches and optional search suggestions
• Eleven themes, light and dark modes, high contrast, fonts, name position and alignment, tile look, background
  image or Bing's image of the day
• Page thumbnails, made while you browse or on request
• Duplicate finder and a link check that marks bookmarks whose sites no longer work
• Most visited sites and recently closed tabs under your bookmarks (optional)
• "Add to SpeedDial" and "Add to folder" in the browser's context menu
• Backups to a file, a cloud drive or a NAS over WebDAV (Yandex Disk, Nextcloud and others)
• Moving bookmarks between browsers: bookmarks from another browser's export merge with yours — same-named folders
  join, repeats are skipped
• Keyboard control, English and Russian

Private by design: no servers of its own, no analytics, no ads. Everything stays in your browser; data goes out only
to the services you turn on. The source code is open: https://github.com/zemidala/SpeedDial

**Search terms** (up to 7): speed dial, new tab, bookmarks, visual bookmarks, start page, tiles, dashboard

---

## Русский

**Название:** SpeedDial

**Краткое описание** (из манифеста):
Визуальные закладки на странице новой вкладки: плитки с иконками и миниатюрами сайтов, папки, темы и копии в облаке

**Описание:**

Закладки вашего браузера на странице новой вкладки — плитками с иконками сайтов и миниатюрами страниц.

SpeedDial показывает закладки, которые у вас уже есть. Ничего не нужно импортировать и настраивать: откройте новую
вкладку — и там ваша панель закладок. Добавляйте, меняйте, сортируйте и перетаскивайте плитки: SpeedDial работает
с закладками самого браузера, поэтому они совпадают с диспетчером закладок и синхронизируются с аккаунтом.

• Папки с превью содержимого и своей картинкой для любой папки
• Перетаскивание, выделение нескольких плиток, перенос и экспорт сразу всех
• Поиск по всем закладкам; Enter — поиск в интернете, с недавними запросами и подсказками поисковика (по желанию)
• Одиннадцать тем, светлый и тёмный режимы, высокая контрастность, шрифты, положение и выравнивание названий, вид
  плиток, фоновая картинка или изображение дня Bing
• Миниатюры страниц — сами во время работы или по кнопке
• Поиск дублей и проверка ссылок, которая отмечает закладки на неработающие сайты
• Часто посещаемые сайты и недавно закрытые вкладки под закладками (по желанию)
• «Добавить в SpeedDial» и «Добавить в папку» в контекстном меню браузера
• Копии в файл, в облако или на NAS по WebDAV (Яндекс.Диск, Nextcloud и другие)
• Перенос закладок между браузерами: закладки из экспорта другого браузера объединяются с вашими — папки с тем же
  названием сливаются, повторы пропускаются
• Управление с клавиатуры, русский и английский языки

Конфиденциальность по умолчанию: своих серверов нет, аналитики и рекламы нет. Всё остаётся в браузере, данные уходят
только в сервисы, которые вы включили сами. Исходный код открыт: https://github.com/zemidala/SpeedDial

**Поисковые слова** (до 7): speed dial, новая вкладка, закладки, визуальные закладки, стартовая страница, плитки, экспресс-панель

---

## Notes for certification (for the reviewers)

SpeedDial replaces the new tab page with the user's own browser bookmarks shown as tiles. No account or sign-in is
needed to test it: install, open a new tab — the bookmarks bar is shown; the settings are behind the gear button.

Required permissions:
- `bookmarks` — the extension's purpose: showing and editing the browser's bookmarks.
- `contextMenus` — "Add to SpeedDial" and "Add to folder" in the page and link context menu.
- `favicon` — site icons for the tiles from the browser's own icon cache.
- `alarms` — the automatic backup a minute after changes.
- `storage` — settings, thumbnails metadata and backup connection details.

Optional permissions (requested only when the user turns the feature on, from the settings):
- `<all_urls>` host access — site icons from the sites themselves and page screenshots for thumbnails
  (captureVisibleTab), checking whether bookmarked links still work.
- `https://www.bing.com/*` — Bing's "image of the day" background.
- Suggestion services (`suggestqueries.google.com`, `api.bing.com`, `duckduckgo.com`) — search suggestions under
  the search box.
- `topSites`, `sessions`, `tabs` — the "Most visited" and "Recently closed" shelves.
- `clipboardRead` — pasting a thumbnail image from the clipboard.
- `identity` — signing in to cloud drives (not offered yet: in development).

No remote code: everything is bundled in the package. No data is collected; see the privacy policy.
