import {describe, expect, it} from 'vitest';
import {dependsOnColorScheme, fixSvgColorScheme} from './svgScheme';

// Shortened from GitHub's favicon.svg
const GITHUB = '<svg><style>path{fill:#24292f}@media (prefers-color-scheme: dark){path{fill:#fff}}</style><path d="M0 0"/></svg>';

describe('fixSvgColorScheme', () => {
  it('answers the theme query for SpeedDial\'s theme', () => {
    expect(fixSvgColorScheme(GITHUB, true)).toContain('@media (min-width: 0px){path{fill:#fff}}');
    expect(fixSvgColorScheme(GITHUB, false)).toContain('@media (max-width: 0px){path{fill:#fff}}');
  });

  it('handles light queries, spacing, case and compound queries', () => {
    const svg = '@media screen and ( Prefers-Color-Scheme : LIGHT ) {a{}} @media (prefers-color-scheme:dark){b{}}';
    expect(fixSvgColorScheme(svg, true)).toBe('@media screen and (max-width: 0px) {a{}} @media (min-width: 0px){b{}}');
  });

  it('tells which icons depend on the theme', () => {
    expect(dependsOnColorScheme(GITHUB)).toBe(true);
    expect(dependsOnColorScheme('<svg><path d="M0 0"/></svg>')).toBe(false);
  });
});
