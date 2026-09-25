// Выставляет тему до первой отрисовки, чтобы при открытии вкладки не мелькал светлый фон.
// Отдельный файл, а не inline-скрипт: политика безопасности страниц расширений запрещает inline.
try {
  const {theme} = JSON.parse(localStorage.getItem('settings-cache') ?? '{}');
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.dataset.theme = theme;
  }
} catch {
  // Нет сохранённых настроек — тема как в системе
}
