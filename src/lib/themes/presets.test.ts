import {describe, expect, it} from 'vitest';
import {contrastRatio} from '../color';
import {customPreset, dimLightPalette, paletteCss, type ThemePalette} from './palette';
import {THEME_PRESETS} from './presets';

const AA = 4.5; // WCAG AA for normal text

/** All "text on background" pairs used in the interface that lack contrast */
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

describe('built-in themes', () => {
  it('themes have distinct ids and names', () => {
    expect(new Set(THEME_PRESETS.map((preset) => preset.id)).size).toBe(THEME_PRESETS.length);
    expect(new Set(THEME_PRESETS.map((preset) => preset.name)).size).toBe(THEME_PRESETS.length);
  });

  describe.each(THEME_PRESETS.flatMap((preset) => [
    [`${preset.name}, светлая`, preset.light],
    [`${preset.name}, тёмная`, preset.dark],
  ] as const))('%s', (_name, palette) => {
    it('all text is readable (WCAG AA contrast)', () => {
      expect(contrastProblems(palette)).toEqual([]);
    });

    it('tiles and folders differ from the page background and from each other', () => {
      expect(palette.tile).not.toBe(palette.folder);
      expect(contrastRatio(palette.folder, palette.pageFrom)).toBeGreaterThan(1.02);
    });
  });
});

describe('custom colours', () => {
  // Various accents and tints, including hard-to-read ones: yellow, pale grey, near-black
  const accents = ['#ff0000', '#ffd700', '#00ff00', '#1e90ff', '#8a2be2', '#cccccc', '#111111', '#ff69b4'];
  const tints = ['#ffffff', '#000000', '#3366ff', '#ff8800', '#22aa55', '#999999', '#ffff00', '#aa00aa'];

  it.each(accents.flatMap((accent) => tints.map((tint) => [accent, tint])))('акцент %s, оттенок %s — всё читается', (accent, tint) => {
    const preset = customPreset(accent, tint);
    expect(contrastProblems(preset.light)).toEqual([]);
    expect(contrastProblems(preset.dark)).toEqual([]);
  });
});

describe('softened light theme', () => {
  const amounts = [0.1, 0.2, 0.3];

  it.each(THEME_PRESETS.flatMap((preset) => amounts.map((amount) => [preset.name, amount, preset.light] as const)))(
    '%s, приглушение %s — всё читается',
    (_name, amount, palette) => {
      expect(contrastProblems(dimLightPalette(palette, amount))).toEqual([]);
    },
  );

  it.each(amounts)('свои цвета, приглушение %s — всё читается', (amount) => {
    for (const [accent, tint] of [['#ffd700', '#ffffff'], ['#1e90ff', '#ffff00'], ['#cccccc', '#aa00aa']]) {
      expect(contrastProblems(dimLightPalette(customPreset(accent, tint).light, amount))).toEqual([]);
    }
  });

  it('backgrounds darken, icon plates half as much', () => {
    const light = THEME_PRESETS[0].light;
    const dimmed = dimLightPalette(light, 0.2);
    const drop = (from: string, to: string) => contrastRatio(from, '#000000') - contrastRatio(to, '#000000');
    expect(drop(light.surface, dimmed.surface)).toBeGreaterThan(0);
    expect(drop(light.plate, dimmed.plate)).toBeLessThan(drop(light.surface, dimmed.surface));
    expect(dimLightPalette(light, 0)).toBe(light);
  });
});

describe('paletteCss', () => {
  it('light-dark() variables for every colour', () => {
    const css = paletteCss(THEME_PRESETS[0]);
    expect(css).toMatch(/^:root:root \{/);
    expect(css).toContain('--surface: light-dark(#ffffff, #2c3039);');
    expect(css).toContain('--tile-bg: light-dark(#ffffff, #2c3039);');
    expect(css.match(/light-dark/g)).toHaveLength(19);
  });
});
