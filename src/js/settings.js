class SettingsManager {
  constructor() {
    // Начальные настройки
    this.settings = {
      tileScale: 1, // Масштаб контента по умолчанию
      tileColor: '#ffffff', // Цвет плитки по умолчанию
      folderColor: '#e6f2ff', // Цвет папки по умолчанию
      fontFamily: 'Segoe UI, system-ui, sans-serif', // Шрифт по умолчанию
      columns: 3 // Количество колонок по умолчанию
    };

    this.defaultSettings = {...this.settings}; // Сохраняем значения по умолчанию
    this.init(); // Инициализация
  }

  init() {
    this.loadSettings(); // Загружаем сохраненные настройки
    this.setupEventListeners(); // Устанавливаем обработчики событий
    this.applySettings(); // Применяем настройки при инициализации
    this.adjustSectionBookmarks(); // Настраиваем section_bookmarks
  }

  loadSettings() {
    // Загружаем настройки из localStorage
    const savedSettings = localStorage.getItem('speedDialSettings');
    if (savedSettings) {
      this.settings = JSON.parse(savedSettings); // Преобразуем строку в объект
      this.applySettings(); // Применяем загруженные настройки
    }
  }

  saveSettings() {
    // Сохраняем текущие настройки в localStorage
    localStorage.setItem('speedDialSettings', JSON.stringify(this.settings));
    this.applySettings(); // Применяем настройки
    this.adjustSectionBookmarks(); // Обновляем section_bookmarks
  }

  applySettings() {
    const root = document.documentElement; // Получаем корневой элемент

    // Применяем настройки к CSS переменным
    root.style.setProperty('--tile-scale', this.settings.tileScale);
    root.style.setProperty('--tile-bg', this.settings.tileColor);
    root.style.setProperty('--folder-bg', this.settings.folderColor);
    root.style.setProperty('font-family', this.settings.fontFamily);
    root.style.setProperty('--columns', this.settings.columns); // Устанавливаем количество колонок

    // Обновляем значения в интерфейсе
    document.getElementById('columns').value = this.settings.columns;
    document.getElementById('columnsValue').textContent = this.settings.columns;
  }

  adjustSectionBookmarks() {
    const section = document.getElementById('section_bookmarks');
    if (!section) return; // Если секция не найдена, выходим

    // Обновляем количество колонок в сетке
    section.style.gridTemplateColumns = `repeat(${this.settings.columns}, 1fr)`;
  }

  setupEventListeners() {
    // Устанавливаем обработчики событий для элементов управления

    const saveButton = document.getElementById('saveSettings');
    if (saveButton) {
      saveButton.addEventListener('click', () => {
        // Сохраняем цвета и шрифт
        this.settings.tileColor = document.getElementById('tileColor').value;
        this.settings.folderColor = document.getElementById('folderColor').value;
        this.settings.fontFamily = document.getElementById('fontFamily').value;
        this.saveSettings(); // Сохраняем настройки
      });
    }

    const toggleButton = document.getElementById('toggleSettings');
    const settingsPanel = document.getElementById('settingsPanel');
    toggleButton.addEventListener('click', () => {
      settingsPanel.classList.toggle('active'); // Переключаем видимость панели настроек
      toggleButton.textContent = settingsPanel.classList.contains('active') ? '✖️' : '⚙️';
    });

    const tileColorInput = document.getElementById('tileColor');
    const folderColorInput = document.getElementById('folderColor');
    if (tileColorInput) {
      tileColorInput.addEventListener('input', () => {
        this.settings.tileColor = tileColorInput.value; // Обновляем цвет плитки
        this.applySettings(); // Применяем изменения
      });
    }

    // Обработчик для количества колонок
    const columnsInput = document.getElementById('columns');
    const columnsValue = document.getElementById('columnsValue');
    if (columnsInput) {
      columnsInput.addEventListener('input', () => {
        columnsValue.textContent = columnsInput.value; // Обновляем текстовое значение
        this.settings.columns = parseInt(columnsInput.value, 10); // Обновляем количество колонок
        this.adjustSectionBookmarks(); // Применяем изменения к секции
        localStorage.setItem('columns', this.settings.columns); // Сохраняем количество колонок
      });
    }

    // Обработчики для кнопок сброса
    const resetTileColorButton = document.getElementById('resetTileColor');
    const resetFolderColorButton = document.getElementById('resetFolderColor');

    if (resetTileColorButton) {
      resetTileColorButton.addEventListener('click', () => {
        this.settings.tileColor = this.defaultSettings.tileColor; // Сбрасываем цвет плитки
        tileColorInput.value = this.settings.tileColor; // Обновляем значение в интерфейсе
        this.applySettings(); // Применяем изменения
      });
    }

    if (resetFolderColorButton) {
      resetFolderColorButton.addEventListener('click', () => {
        this.settings.folderColor = this.defaultSettings.folderColor; // Сбрасываем цвет папки
        folderColorInput.value = this.settings.folderColor; // Обновляем значение в интерфейсе
        this.applySettings(); // Применяем изменения
      });
    }

    // Загружаем текущие настройки в поля панели
    this.loadCurrentSettings();
  }

  loadCurrentSettings() {
    // Загружаем текущие настройки в элементы управления
    const tileColorInput = document.getElementById('tileColor');
    const folderColorInput = document.getElementById('folderColor');
    const fontFamilyInput = document.getElementById('fontFamily');

    if (tileColorInput) {
      tileColorInput.value = this.settings.tileColor; // Устанавливаем цвет плитки
    }
    if (folderColorInput) {
      folderColorInput.value = this.settings.folderColor; // Устанавливаем цвет папки
    }
    if (fontFamilyInput) {
      fontFamilyInput.value = this.settings.fontFamily; // Устанавливаем шрифт
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const settingsManager = new SettingsManager(); // Создаем экземпляр SettingsManager при загрузке страницы
});