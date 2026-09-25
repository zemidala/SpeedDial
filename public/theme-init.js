// Применяет тему и пользовательский CSS до первой отрисовки, чтобы при открытии вкладки ничего не мелькало.
// Отдельный файл, а не inline-скрипт: политика безопасности страниц расширений запрещает inline.
try {
  const {theme, customCss} = JSON.parse(localStorage.getItem('settings-cache') ?? '{}').settings ?? {};
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.dataset.theme = theme;
  }
  if (typeof customCss === 'string' && customCss) {
    const style = document.createElement('style');
    style.id = 'custom-css'; // Тот же id использует App.svelte
    style.textContent = customCss;
    document.head.append(style);
  }
} catch {
  // Нет сохранённых настроек — тема как в системе
}
