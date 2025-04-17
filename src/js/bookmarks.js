import {
  BREADCRUMB_HOME_CLASS,
  BREADCRUMBS_ID,
  FOLDER_TILE_CLASS,
  HOME_FOLDER_ID,
  PLACEHOLDER_ICON_CLASS,
  ROOT_FOLDER_ID,
  SECTION_BOOKMARKS_ID,
  TILE_CLASS,
} from './constants.js';

export function normalizeUrl(input) {
  try {
    // Если URL не содержит протокола, добавляем 'https://' по умолчанию
    if (!input.startsWith('http://') && !input.startsWith('https://')) {
      input = 'https://' + input;
    }

    // Создаем объект URL для проверки и нормализации
    const url = new URL(input);

    // Возвращаем нормализованный URL
    return url.toString();
  } catch (error) {
    console.error('Invalid URL:', input);
    return null; // Возвращаем null, если URL некорректный
  }
}

class BookmarksManager {
  constructor() {
    this.currentFolderId = ROOT_FOLDER_ID; // Корневая папка

    // Привязываем контекст для обработчиков
    this.createBookmarkTile = this.createBookmarkTile.bind(this);
    this.createFolderTile = this.createFolderTile.bind(this);

    this.init();
  }

  async init() {
    try {
      await this.renderBookmarks();
      this.setupEventListeners();
    } catch (error) {
      console.error('Initialization error:', error);
    }
  }

  async getBookmarks(folderId) {
    return new Promise((resolve) => {
      chrome.bookmarks.getChildren(folderId, (children) => {
        resolve(children || []);
      });
    });
  }

  async getFolderPath(folderId) {
    return new Promise((resolve) => {
      const path = [];
      const getPath = (id) => {
        chrome.bookmarks.get(id, (nodes) => {
          if (!nodes || nodes.length === 0) {
            resolve(path.reverse());
            return;
          }
          const node = nodes[0];
          path.push({id: node.id, title: node.title});
          if (node.parentId && node.parentId !== '0') {
            getPath(node.parentId);
          } else {
            resolve(path.reverse());
          }
        });
      };
      getPath(folderId);
    });
  }

  async renderBookmarks(folderId = this.currentFolderId) {
    try {
      console.log('Rendering bookmarks for folder:', folderId);
      const bookmarks = await this.getBookmarks(folderId);
      const section = document.getElementById(SECTION_BOOKMARKS_ID);

      if (!section) {
        console.error('Section not found');
        return;
      }

      // Очищаем содержимое секции перед отрисовкой новых элементов
      section.innerHTML = '';

      // Отрисовываем хлебные крошки
      await this.renderBreadcrumbs(folderId);

      // Добавляем новые элементы (закладки и папки)
      bookmarks.forEach((item) => {
        const element = item.url
          ? this.createBookmarkTile(item, section)
          : this.createFolderTile(item, section);

        if (element instanceof Node) {
          section.appendChild(element);
        }
      });
    } catch (error) {
      console.error('Render error:', error);
    }
  }

  async renderBreadcrumbs(folderId) {
    const breadcrumbs = document.getElementById(BREADCRUMBS_ID);
    const path = await this.getFolderPath(folderId);

    // Очищаем существующие крошки, кроме "Домой"
    while (breadcrumbs.children.length > 1) {
      breadcrumbs.removeChild(breadcrumbs.lastChild);
    }

    // Добавляем крошки пути
    path.forEach((folder) => {
      const separator = document.createElement('span');
      separator.textContent = '›';
      separator.style.margin = '0 5px';
      separator.style.color = '#666';

      const crumb = document.createElement('a');
      crumb.textContent = folder.title;
      crumb.dataset.folderId = folder.id;
      crumb.addEventListener('click', () => this.navigateToFolder(folder.id));

      breadcrumbs.appendChild(separator);
      breadcrumbs.appendChild(crumb);
    });
  }

  createBookmarkTile(bookmark, container) {
    const tile = document.createElement('div');
    tile.className = TILE_CLASS;
    tile.dataset.id = bookmark.id;

    // Нормализуем URL
    const normalizedUrl = normalizeUrl(bookmark.url);
    if (!normalizedUrl) {
      console.error('Invalid URL for bookmark:', bookmark.url);
      return;
    }

    const hostname = new URL(normalizedUrl).hostname;
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}`;

    const icon = document.createElement('div');
    icon.className = 'tile-icon';

    // Проверяем кэш
    const cachedFavicon = localStorage.getItem(`favicon-${hostname}`);
    if (cachedFavicon) {
      const img = document.createElement('img');
      img.src = cachedFavicon;
      img.alt = '';
      img.className = 'tile-favicon';
      icon.appendChild(img);
    } else {
      fetch(faviconUrl)
        .then((response) => {
          if (response.ok) {
            const img = document.createElement('img');
            img.src = faviconUrl;
            img.alt = '';
            img.className = 'tile-favicon';
            icon.appendChild(img);

            // Сохраняем в кэш
            localStorage.setItem(`favicon-${hostname}`, faviconUrl);
          } else {
            icon.appendChild(this.createPlaceholderIcon(hostname));
            icon.style.background = 'cornflowerblue';
          }
        })
        .catch(() => {
          icon.appendChild(this.createPlaceholderIcon(hostname));
          icon.style.background = 'cornflowerblue';
        });
    }

    const tileTitle = document.createElement('div');
    tileTitle.className = 'tile-title';
    tileTitle.textContent = bookmark.title;

    tile.appendChild(icon);
    tile.appendChild(tileTitle);

    tile.addEventListener('click', (e) => {
      e.preventDefault();
      window.open(normalizedUrl, '_self');
    });

    container.appendChild(tile);
  }

  createFolderTile(folder, container) {
    const tile = document.createElement('div');
    tile.className = FOLDER_TILE_CLASS;
    tile.dataset.id = folder.id;
    tile.title = folder.title;

    // Сетка миниатюр 4x3
    const miniGrid = document.createElement('div');
    miniGrid.className = 'folder-grid';

    this.getBookmarks(folder.id).then((children) => {
      for (let i = 0; i < 12; i++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';

        if (i < children.length) {
          const item = children[i];
          const icon = document.createElement('div');
          icon.className = item.url ? 'bookmark-icon' : 'folder-icon';
          icon.title = item.title;

          if (item.url) {
            const img = document.createElement('img');
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(item.url).hostname}`;
            img.alt = '';
            img.loading = 'lazy';

            fetch(faviconUrl)
              .then((response) => {
                if (response.ok) {
                  img.src = faviconUrl;
                  icon.appendChild(img);
                } else {
                  icon.appendChild(this.createPlaceholderIcon(new URL(item.url).hostname));
                  icon.style.background = 'cornflowerblue';
                }
              })
              .catch(() => {
                icon.appendChild(this.createPlaceholderIcon(new URL(item.url).hostname));
                icon.style.background = 'cornflowerblue';
              });
          } else {
            icon.textContent = '📁';
          }
          cell.appendChild(icon);
        }
        miniGrid.appendChild(cell);
      }
    });

    // Название папки
    const title = document.createElement('div');
    title.className = 'folder-title';
    title.textContent = folder.title;

    tile.appendChild(miniGrid);
    tile.appendChild(title);
    tile.addEventListener('click', () => this.navigateToFolder(folder.id));
    container.appendChild(tile);
  }

  createPlaceholderIcon(title) {
    const placeholder = document.createElement('div');
    placeholder.className = PLACEHOLDER_ICON_CLASS;
    placeholder.textContent = title.charAt(0).toUpperCase(); // Первая буква названия сайта
    return placeholder;
  }

  navigateToFolder(folderId) {
    this.currentFolderId = folderId;
    this.renderBookmarks(folderId);
  }

  setupEventListeners() {
    // Обработчик клика по "Домой"
    document.querySelector(`.${BREADCRUMB_HOME_CLASS}`).addEventListener('click', (e) => {
      e.preventDefault();
      this.navigateToFolder(HOME_FOLDER_ID);
    });
  }
}

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
  new BookmarksManager();
});