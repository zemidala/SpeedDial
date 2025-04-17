import {normalizeUrl} from './bookmarks.js';

document.addEventListener('DOMContentLoaded', () => {
  let customContextMenu = null;
  let bookmarkModal = null;

  // Обработчик для создания контекстного меню
  document.addEventListener('contextmenu', (event) => {
    event.preventDefault();

    // Если меню уже существует, удаляем его
    if (customContextMenu) {
      document.body.removeChild(customContextMenu);
      customContextMenu = null;
    }

    // Создаем новое контекстное меню
    customContextMenu = document.createElement('div');
    customContextMenu.classList.add('context-menu');

    const ul = document.createElement('ul');
    const li = document.createElement('li');
    li.textContent = 'Добавить закладку';

    ul.appendChild(li);
    customContextMenu.appendChild(ul);

    // Устанавливаем позицию меню
    customContextMenu.style.left = `${event.clientX}px`;
    customContextMenu.style.top = `${event.clientY}px`;

    // Добавляем меню в DOM
    document.body.appendChild(customContextMenu);

    console.log('Контекстное меню создано:', customContextMenu);

    // Обработчик для добавления закладки
    li.addEventListener('click', () => {
      document.body.removeChild(customContextMenu);
      customContextMenu = null;
      createAndShowBookmarkModal();
    });
  });

  // Обработчик для удаления меню при клике вне его области
  document.addEventListener('click', (event) => {
    if (customContextMenu && !customContextMenu.contains(event.target)) {
      document.body.removeChild(customContextMenu);
      customContextMenu = null;
      console.log('Контекстное меню удалено');
    }
  });

  // Функция для создания и показа модального окна
  function createAndShowBookmarkModal() {
    if (bookmarkModal) {
      console.error('Модальное окно уже существует');
      return;
    }

    // Создаем модальное окно
    bookmarkModal = document.createElement('div');
    bookmarkModal.id = 'bookmarkModal';
    bookmarkModal.classList.add('modal');

    const modalContent = document.createElement('div');
    modalContent.classList.add('modal-content');

    modalContent.innerHTML = `
      <h2>Добавить закладку</h2>
      <form id="bookmarkForm">
        <label for="bookmarkTitle">Название сайта:</label>
        <input type="text" id="bookmarkTitle" placeholder="Введите название">

        <label for="bookmarkUrl">URL:</label>
        <input type="text" id="bookmarkUrl" placeholder="Введите URL" required>

        <div class="modal-actions">
          <button type="submit" class="save-button">Сохранить</button>
          <button type="button" class="cancel-button">Отмена</button>
        </div>
      </form>
    `;

    bookmarkModal.appendChild(modalContent);
    document.body.appendChild(bookmarkModal);

    console.log('Модальное окно создано динамически:', bookmarkModal);

    // Показываем модальное окно
    bookmarkModal.classList.add('active');

    // Обработка формы добавления закладки
    const bookmarkForm = document.getElementById('bookmarkForm');
    if (bookmarkForm) {
      bookmarkForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const titleInput = document.getElementById('bookmarkTitle');
        const urlInput = document.getElementById('bookmarkUrl');

        const title = titleInput.value.trim();
        const url = urlInput.value.trim();

        if (!url) {
          console.error('URL не может быть пустым');
          return;
        }

        // Нормализуем URL
        const processedUrl = normalizeUrl(url);
        if (!processedUrl) {
          console.error('Неверный формат URL:', url);
          return;
        }

        let finalTitle = title;
        if (!finalTitle) {
          try {
            const parsedUrl = new URL(processedUrl);
            finalTitle = parsedUrl.hostname;
          } catch (error) {
            console.error('Неверный формат URL:', error);
            return;
          }
        }

        await saveBookmark(finalTitle, processedUrl);

        bookmarkForm.reset();
        removeBookmarkModal();
      });
    }

    // Кнопка "Отмена" в модальном окне
    const cancelButton = document.querySelector('.cancel-button');
    if (cancelButton) {
      cancelButton.addEventListener('click', (event) => {
        event.stopPropagation(); // Останавливаем всплытие события
        removeBookmarkModal();
      });
    }

    // Скрытие модального окна при клике вне его области
    function handleOutsideClick(event) {
      // Если модальное окно активно, игнорируем клики вне его области
      if (bookmarkModal && bookmarkModal.classList.contains('active')) {
        console.log('Клик вне модального окна игнорируется');
        return;
      }

      // Если контекстное меню существует, удаляем его
      if (customContextMenu && !customContextMenu.contains(event.target)) {
        document.body.removeChild(customContextMenu);
        customContextMenu = null;
        console.log('Контекстное меню удалено');
      }
    }

    // Добавляем обработчик для кликов вне области
    document.addEventListener('click', handleOutsideClick);

    // Функция для удаления модального окна
    function removeBookmarkModal() {
      if (bookmarkModal) {
        document.body.removeChild(bookmarkModal);
        bookmarkModal = null;
        console.log('Модальное окно удалено из DOM');

        // Удаляем обработчик события для кликов вне области
        document.removeEventListener('click', handleOutsideClick);
      }
    }
  }

  // Функция сохранения закладки через Chrome API
  async function saveBookmark(title, url) {
    try {
      const newBookmark = await new Promise((resolve, reject) => {
        chrome.bookmarks.create(
          {
            title: title,
            url: url,
          },
          (bookmark) => {
            if (chrome.runtime.lastError) {
              console.error('Ошибка при добавлении закладки:', chrome.runtime.lastError.message);
              reject(chrome.runtime.lastError);
            } else {
              resolve(bookmark);
            }
          }
        );
      });

      console.log('Закладка успешно добавлена:', newBookmark);
      alert('Закладка успешно добавлена!');
    } catch (error) {
      console.error('Ошибка при добавлении закладки:', error);
      alert('Не удалось добавить закладку. Пожалуйста, попробуйте снова.');
    }
  }
});