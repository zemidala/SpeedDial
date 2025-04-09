class BookmarksManager {
  constructor() {
    this.currentFolderId = '1'; // Root folder
    this.folderStack = [];

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
      const bookmarks = await this.getBookmarks(folderId);
      const section = document.getElementById('section_bookmarks');
      if (!section) {
        console.error('Section not found');
        return;
      }
      section.innerHTML = '';

      await this.renderBreadcrumbs(folderId);

      bookmarks.forEach(item => {
        const element = item.url
          ? this.createBookmarkTile(item, section)
          : this.createFolderTile(item, section);

        if (element instanceof Node) { // Проверяем, что это DOM-элемент
          section.appendChild(element);
        }
      });
    } catch (error) {
      console.error('Render error:', error);
    }
  }

  async renderBreadcrumbs(folderId) {
    const breadcrumbs = document.getElementById('breadcrumbs');
    const path = await this.getFolderPath(folderId);

    // Clear existing breadcrumbs except Home
    while (breadcrumbs.children.length > 1) {
      breadcrumbs.removeChild(breadcrumbs.lastChild);
    }

    // Add path breadcrumbs
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
    tile.className = 'tile';
    tile.dataset.id = bookmark.id;

    const faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}`;

    const tileIcon = document.createElement('div');
    tileIcon.className = 'tile-icon';

    const img = document.createElement('img');
    img.src = faviconUrl;
    img.alt = '';
    img.className = 'tile-favicon'; // Добавляем класс для стилей
    tileIcon.appendChild(img);

    const tileTitle = document.createElement('div');
    tileTitle.className = 'tile-title';
    tileTitle.textContent = bookmark.title;

    tile.appendChild(tileIcon);
    tile.appendChild(tileTitle);

    tile.addEventListener('click', (e) => {
      e.preventDefault();
      window.open(bookmark.url, '_self');
    });

    container.appendChild(tile);
  }

  createFolderTile(folder, container) {
    const tile = document.createElement('div');
    tile.className = 'folder-tile';
    tile.dataset.id = folder.id;
    tile.title = folder.title;

    // Сетка миниатюр 4x3
    const miniGrid = document.createElement('div');
    miniGrid.className = 'folder-grid';

    this.getBookmarks(folder.id).then(children => {
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
            img.src = `https://www.google.com/s2/favicons?domain=${new URL(item.url).hostname}`;
            img.alt = '';
            img.loading = 'lazy';
            icon.appendChild(img);
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

  navigateToFolder(folderId) {
    this.currentFolderId = folderId;
    this.renderBookmarks(folderId);
  }

  setupEventListeners() {
    // Home breadcrumb click
    document.querySelector('.breadcrumb-home').addEventListener('click', (e) => {
      e.preventDefault();
      this.navigateToFolder('0');
    });
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new BookmarksManager();
});