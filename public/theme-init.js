// Applies the mode (light/dark), theme colours and custom CSS before the first paint,
// so nothing flickers when the tab opens.
// A separate file, not an inline script: the extension pages' security policy forbids inline scripts.

function addStyle(id, css) {
  const style = document.createElement('style');
  style.id = id; // App.svelte uses the same ids
  style.textContent = css;
  document.head.append(style);
}

try {
  const {theme, contrast, customCss, fontSize, fontFamily} = JSON.parse(localStorage.getItem('settings-cache') ?? '{}').settings ?? {};
  // Text size and font — the same values App.svelte sets (FONT_SCALES in lib/fonts.ts)
  const fontScales = {xs: 0.875, s: 0.9375, m: 1, l: 1.125, xl: 1.25};
  if (fontScales[fontSize]) document.documentElement.style.fontSize = `${fontScales[fontSize] * 100}%`;
  if (typeof fontFamily === 'string' && fontFamily) document.documentElement.style.setProperty('--font-family', fontFamily);
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.dataset.theme = theme;
  }
  // High contrast — as in App.svelte: chosen explicitly or enabled in the system
  const systemHighContrast = matchMedia('(prefers-contrast: more)').matches;
  if (contrast === 'high' || ((contrast ?? 'auto') === 'auto' && systemHighContrast)) {
    document.documentElement.dataset.contrast = 'high';
  }

  const palette = localStorage.getItem('theme-palette-css');
  if (palette) addStyle('theme-palette', palette);

  if (typeof customCss === 'string' && customCss) addStyle('custom-css', customCss);
} catch {
  // No saved settings — the theme follows the system
}
