// Renders the extension icon PNGs from the SVG sources: npm run icons
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const SIZES = [
  {size: 16, source: 'icon-small.svg'},
  {size: 32, source: 'icon.svg'},
  {size: 48, source: 'icon.svg'},
  {size: 128, source: 'icon.svg'},
  // The store listing's logo
  {size: 300, source: 'icon.svg', path: 'docs/store/logo-300.png'},
];

const browser = await chromium.launch({channel: 'chromium'});
const page = await browser.newPage();
for (const {size, source, path} of SIZES) {
  const svg = await readFile(new URL(source, import.meta.url), 'utf8');
  await page.setViewportSize({width: size, height: size});
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await page.screenshot({path: path ?? `public/icons/icon${size}.png`, omitBackground: true});
}
await browser.close();
