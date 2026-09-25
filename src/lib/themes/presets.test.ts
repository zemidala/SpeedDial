import {describe, expect, it} from 'vitest';
import {contrastRatio} from '../color';
import {customPreset, paletteCss, type ThemePalette} from './palette';
import {THEME_PRESETS} from './presets';

const AA = 4.5; // WCAG AA для обычного текста

/** Все пары «текст — фон», которые встречаются в интерфейсе, с недостающим контрастом */
function contrastProblems(palette: ThemePalette): string[] {
  const pairs: Array<[keyof ThemePalette, keyof ThemePalette]> = [
    ['text', 'surface'],
    ['text', 'surfaceMuted'],
    ['text', 'surfaceHover'],
    ['text', 'tile'],
    ['text', 'folder'],
    ['text', 'pageFrom'],
    ['text', 'pageTo'],
    ['textMuted', 'surface'],
    ['textMuted', 'surfaceMuted'],
    ['textMuted', 'tile'],
    ['accent', 'surface'],
    ['accentText', 'accent'],
    ['accentText', 'accentHover'],
    ['danger', 'surface'],
    ['dangerText', 'danger'],
  ];
  return pairs
    .map(([foreground, background]) => ({foreground, background, ratio: contrastRatio(palette[foreground], palette[background])}))
    .filter(({ratio}) => ratio < AA)
    .map(({foreground, background, ratio}) => `${foreground} на ${background}: ${ratio.toFixed(2)}`);
}

describe('готовые темы', () => {
  it('у тем разные id и названия', () => {
    expect(new Set(THEME_PRESETS.map((preset) => preset.id)).size).toBe(THEME_PRESETS.length);
    expect(new Set(THEME_PRESETS.map((preset) => preset.name)).size).toBe(THEME_PRESETS.length);
  });

  describe.each(THEME_PRESETS.flatMap((preset) => [
    [`${preset.name}, светлая`, preset.light],
    [`${preset.name}, тёмная`, preset.dark],
  ] as const))('%s', (_name, palette) => {
    it('весь текст читается (контраст WCAG AA)', () => {
      expect(contrastProblems(palette)).toEqual([]);
    });

    it('плитки и папки отличаются от фона страницы и друг от друга', () => {
      expect(palette.tile).not.toBe(palette.folder);
      expect(contrastRatio(palette.folder, palette.pageFrom)).toBeGreaterThan(1.02);
    });
  });
});

describe('свои цвета', () => {
  // Разные акценты и оттенки, в том числе неудачные для чтения: жёлтый, бледно-серый, почти чёрный
  const accents = ['#ff0000', '#ffd700', '#00ff00', '#1e90ff', '#8a2be2', '#cccccc', '#111111', '#ff69b4'];
  const tints = ['#ffffff', '#000000', '#3366ff', '#ff8800', '#22aa55', '#999999', '#ffff00', '#aa00aa'];

  it.each(accents.flatMap((accent) => tints.map((tint) => [accent, tint])))('акцент %s, оттенок %s — всё читается', (accent, tint) => {
    const preset = customPreset(accent, tint);
    expect(contrastProblems(preset.light)).toEqual([]);
    expect(contrastProblems(preset.dark)).toEqual([]);
  });
});

describe('paletteCss', () => {
  it('переменные с light-dark() для каждого цвета', () => {
    const css = paletteCss(THEME_PRESETS[0]);
    expect(css).toMatch(/^:root:root \{/);
    expect(css).toContain('--surface: light-dark(#ffffff, #23262d);');
    expect(css).toContain('--tile-bg: light-dark(#ffffff, #262a31);');
    expect(css.match(/light-dark/g)).toHaveLength(19);
  });
});
