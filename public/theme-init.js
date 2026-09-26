// Применяет режим (светлый/тёмный), цвета темы оформления и пользовательский CSS до первой отрисовки,
// чтобы при открытии вкладки ничего не мелькало.
// Отдельный файл, а не inline-скрипт: политика безопасности страниц расширений запрещает inline.

function addStyle(id, css) {
  const style = document.createElement('style');
  style.id = id; // Те же id использует App.svelte
  style.textContent = css;
  document.head.append(style);
}

try {
  const {theme, contrast, customCss, fontSize, fontFamily} = JSON.parse(localStorage.getItem('settings-cache') ?? '{}').settings ?? {};
  // Размер и шрифт текста — те же значения, что ставит App.svelte (FONT_SCALES в lib/fonts.ts)
  const fontScales = {xs: 0.875, s: 0.9375, m: 1, l: 1.125, xl: 1.25};
  if (fontScales[fontSize]) document.documentElement.style.fontSize = `${fontScales[fontSize] * 100}%`;
  if (typeof fontFamily === 'string' && fontFamily) document.documentElement.style.setProperty('--font-family', fontFamily);
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.dataset.theme = theme;
  }
  // Повышенная контрастность — как в App.svelte: выбрана явно или включена в системе
  const systemHighContrast = matchMedia('(prefers-contrast: more)').matches;
  if (contrast === 'high' || ((contrast ?? 'auto') === 'auto' && systemHighContrast)) {
    document.documentElement.dataset.contrast = 'high';
  }

  const palette = localStorage.getItem('theme-palette-css');
  if (palette) addStyle('theme-palette', palette);

  if (typeof customCss === 'string' && customCss) addStyle('custom-css', customCss);
} catch {
  // Нет сохранённых настроек — тема как в системе
}
