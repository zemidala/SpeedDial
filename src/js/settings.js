class SettingsManager {
  constructor() {
    this.settings = {
      tileSize: 120,
      tileColor: '#ffffff',
      folderColor: '#e6f2ff',
      fontFamily: 'Segoe UI, system-ui, sans-serif',
    };

    this.init();
  }

  init() {
    this.loadSettings();
    this.setupEventListeners();
  }

  loadSettings() {
    const savedSettings = localStorage.getItem('speedDialSettings');
    if (savedSettings) {
      this.settings = JSON.parse(savedSettings);
      this.applySettings();
    }
  }

  saveSettings() {
    localStorage.setItem('speedDialSettings', JSON.stringify(this.settings));
    this.applySettings();
  }

  applySettings() {
    const root = document.documentElement;
    root.style.setProperty('--tile-size', `${this.settings.tileSize}px`);
    root.style.setProperty('--tile-bg', this.settings.tileColor);
    root.style.setProperty('--folder-bg', this.settings.folderColor);
    root.style.setProperty('font-family', this.settings.fontFamily);
  }

  setupEventListeners() {
    // Получаем элементы DOM
    const toggleButton = document.getElementById('toggleSettings');
    const settingsPanel = document.getElementById('settingsPanel');

    // Проверяем, что элементы существуют
    if (!toggleButton || !settingsPanel) {
      console.error('Не удалось найти кнопку или панель настроек');
      return;
    }

    // Обработчик для ползунка размера плитки
    const tileSizeInput = document.getElementById('tileSize');
    const tileSizeValue = document.getElementById('tileSizeValue');

    if (tileSizeInput && tileSizeValue) {
      tileSizeInput.addEventListener('input', () => {
        this.settings.tileSize = parseInt(tileSizeInput.value, 10);
        tileSizeValue.textContent = `${this.settings.tileSize}px`;
        this.applySettings();
      });
    }

    // Кнопка сохранения настроек
    const saveButton = document.getElementById('saveSettings');
    if (saveButton) {
      saveButton.addEventListener('click', () => {
        this.settings.tileColor = document.getElementById('tileColor').value;
        this.settings.folderColor = document.getElementById('folderColor').value;
        this.settings.fontFamily = document.getElementById('fontFamily').value;
        this.saveSettings();
      });
    }

    // Кнопка для открытия/закрытия панели настроек
    toggleButton.addEventListener('click', () => {
      settingsPanel.classList.toggle('active');
      // Меняем иконку кнопки
      if (settingsPanel.classList.contains('active')) {
        toggleButton.textContent = '✖️'; // Крестик, если панель открыта
      } else {
        toggleButton.textContent = '⚙️'; // Шестеренка, если панель закрыта
      }
    });

    // Загружаем текущие настройки в поля панели
    if (tileSizeInput && tileSizeValue) {
      tileSizeInput.value = this.settings.tileSize;
      tileSizeValue.textContent = `${this.settings.tileSize}px`;
    }
    const tileColorInput = document.getElementById('tileColor');
    const folderColorInput = document.getElementById('folderColor');
    const fontFamilyInput = document.getElementById('fontFamily');
    if (tileColorInput && folderColorInput && fontFamilyInput) {
      tileColorInput.value = this.settings.tileColor;
      folderColorInput.value = this.settings.folderColor;
      fontFamilyInput.value = this.settings.fontFamily;
    }
  }
}

// Инициализация менеджера настроек
document.addEventListener('DOMContentLoaded', () => {
  const settingsManager = new SettingsManager();
});