import {describe, expect, it} from 'vitest';
import {firstFamily, fontStack, isFontInstalled} from './fonts';

describe('шрифты', () => {
  it('первый шрифт из font-family', () => {
    expect(firstFamily('Segoe UI, system-ui, sans-serif')).toBe('Segoe UI');
    expect(firstFamily('"Open Sans", system-ui, sans-serif')).toBe('Open Sans');
    expect(firstFamily("'PT Sans'")).toBe('PT Sans');
    expect(firstFamily('')).toBe('');
  });

  it('font-family с запасными шрифтами', () => {
    expect(fontStack('Open Sans')).toBe('"Open Sans", system-ui, sans-serif');
    expect(fontStack('system-ui')).toBe('system-ui, sans-serif');
    expect(firstFamily(fontStack('Georgia'))).toBe('Georgia');
  });

  it('шрифт установлен, если текст им отличается по ширине от запасного', () => {
    // Холст-заглушка: «Georgia» шире, неизвестный шрифт совпадает с запасным
    const context = {
      font: '',
      measureText(this: {font: string}) {
        return {width: this.font.includes('Georgia') ? 120 : 100};
      },
    } as unknown as CanvasRenderingContext2D;
    expect(isFontInstalled('Georgia', context)).toBe(true);
    expect(isFontInstalled('Нет такого шрифта', context)).toBe(false);
    expect(isFontInstalled('system-ui', context)).toBe(true);
  });
});
