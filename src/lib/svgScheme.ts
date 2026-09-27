// SVG icons that change colour with the theme (GitHub's logo: black on light, white on dark). Inside an <img>
// browsers decide that theme differently — some by the system, some by the page — so a dark-themed page may get
// the black logo on its dark tile. The icon's own theme switch is fixed to SpeedDial's theme instead. No DOM

const SCHEME_FEATURE = /\(\s*prefers-color-scheme\s*:\s*(dark|light)\s*\)/gi;
/** Always true and always false for an image of any size */
const ALWAYS = '(min-width: 0px)';
const NEVER = '(max-width: 0px)';

export function dependsOnColorScheme(svg: string): boolean {
  return /prefers-color-scheme/i.test(svg);
}

/** The SVG with its "light / dark" media queries answered for the given theme */
export function fixSvgColorScheme(svg: string, dark: boolean): string {
  return svg.replace(SCHEME_FEATURE, (_match, scheme: string) => ((scheme.toLowerCase() === 'dark') === dark ? ALWAYS : NEVER));
}
