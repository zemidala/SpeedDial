class SettingsManager {
  constructor() {
    this.settings = {
      tileWidth: 120, // Ширина плитки по умолчанию
      tileColor: '#ffffff',
      folderColor: '#e6f2ff',
      fontFamily: 'Segoe UI, system-ui, sans-serif',
    };

    this.defaultSettings = {...this.settings}; // Сохраняем значения по умолчанию
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

    // Применяем настройки через CSS-переменные
    root.style.setProperty('--tile-size', `${this.settings.tileWidth}px`);
    root.style.setProperty('--tile-bg', this.settings.tileColor);
    root.style.setProperty('--folder-bg', this.settings.folderColor);
    root.style.setProperty('font-family', this.settings.fontFamily);

    // Обновляем отображаемые значения
    document.getElementById('tileWidth').value = this.settings.tileWidth;
    document.getElementById('tileWidthValue').textContent = `${this.settings.tileWidth}px`;
    document.getElementById('tileColorValue').textContent = this.settings.tileColor;
    document.getElementById('folderColorValue').textContent = this.settings.folderColor;
  }

  setupEventListeners() {
    const toggleButton = document.getElementById('toggleSettings');
    const settingsPanel = document.getElementById('settingsPanel');

    if (!toggleButton || !settingsPanel) {
      console.error('Не удалось найти кнопку или панель настроек');
      return;
    }

    const tileSizeInput = document.getElementById('tileSize');
    const tileSizeValue = document.getElementById('tileSizeValue');

    if (tileSizeInput && tileSizeValue) {
      tileSizeInput.addEventListener('input', () => {
        this.settings.tileSize = parseInt(tileSizeInput.value, 10);
        tileSizeValue.textContent = `${this.settings.tileSize}px`;
        this.applySettings();
      });
    }

    // Добавляем обработчик для ширины плитки
    const tileWidthInput = document.getElementById('tileWidth');
    const tileWidthValue = document.getElementById('tileWidthValue');

    if (tileWidthInput && tileWidthValue) {
      tileWidthInput.addEventListener('input', () => {
        this.settings.tileWidth = parseInt(tileWidthInput.value, 10);
        tileWidthValue.textContent = `${this.settings.tileWidth}px`;
        this.applySettings();
      });
    }

    const saveButton = document.getElementById('saveSettings');
    if (saveButton) {
      saveButton.addEventListener('click', () => {
        this.settings.tileColor = document.getElementById('tileColor').value;
        this.settings.folderColor = document.getElementById('folderColor').value;
        this.settings.fontFamily = document.getElementById('fontFamily').value;
        this.saveSettings();
      });
    }

    toggleButton.addEventListener('click', () => {
      settingsPanel.classList.toggle('active');
      if (settingsPanel.classList.contains('active')) {
        toggleButton.textContent = '✖️';
      } else {
        toggleButton.textContent = '⚙️';
      }
    });

    const tileColorInput = document.getElementById('tileColor');
    const folderColorInput = document.getElementById('folderColor');

    if (tileColorInput) {
      tileColorInput.addEventListener('input', () => {
        this.settings.tileColor = tileColorInput.value;
        this.applySettings();
      });
    }

    if (folderColorInput) {
      folderColorInput.addEventListener('input', () => {
        this.settings.folderColor = folderColorInput.value;
        this.applySettings();
      });
    }

    // Обработчики для кнопок сброса
    const resetTileColorButton = document.getElementById('resetTileColor');
    const resetFolderColorButton = document.getElementById('resetFolderColor');

    if (resetTileColorButton) {
      resetTileColorButton.addEventListener('click', () => {
        this.settings.tileColor = this.defaultSettings.tileColor;
        tileColorInput.value = this.settings.tileColor;
        this.applySettings();
      });
    }

    if (resetFolderColorButton) {
      resetFolderColorButton.addEventListener('click', () => {
        this.settings.folderColor = this.defaultSettings.folderColor;
        folderColorInput.value = this.settings.folderColor;
        this.applySettings();
      });
    }

    // Загружаем текущие настройки в поля панели
    if (tileSizeInput && tileSizeValue) {
      tileSizeInput.value = this.settings.tileSize;
      tileSizeValue.textContent = `${this.settings.tileSize}px`;
    }
    if (tileWidthInput && tileWidthValue) {
      tileWidthInput.value = this.settings.tileWidth;
      tileWidthValue.textContent = `${this.settings.tileWidth}px`;
    }
    if (tileColorInput && folderColorInput) {
      tileColorInput.value = this.settings.tileColor;
      folderColorInput.value = this.settings.folderColor;
    }
    const fontFamilyInput = document.getElementById('fontFamily');
    if (fontFamilyInput) {
      fontFamilyInput.value = this.settings.fontFamily;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const settingsManager = new SettingsManager();
});