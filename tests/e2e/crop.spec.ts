import type {Page} from '@playwright/test';
import {expect, seed, test, tile} from './fixtures';

/** A 1600×1000 PNG: the left half red, the right half blue — the colour on the tile tells which part was chosen */
async function makeHalves(page: Page) {
  const bytes = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(1600, 1000);
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#e02020';
    context.fillRect(0, 0, 800, 1000);
    context.fillStyle = '#2040e0';
    context.fillRect(800, 0, 800, 1000);
    const blob = await canvas.convertToBlob({type: 'image/png'});
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  return Buffer.from(bytes);
}

/** RGB in the middle of the tile's thumbnail */
function centreColor(page: Page, title: string) {
  return tile(page, title).locator('.tile__thumbnail').evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    const canvas = new OffscreenCanvas(1, 1);
    const context = canvas.getContext('2d')!;
    context.drawImage(img, img.naturalWidth / 2, img.naturalHeight / 2, 1, 1, 0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  });
}

async function chooseFile(page: Page, title: string) {
  await tile(page, title).click({button: 'right'});
  await page.getByRole('menuitem', {name: 'Значок…'}).click();
  const iconDialog = page.getByRole('dialog', {name: `Значок «${title}»`});
  const chooser = page.waitForEvent('filechooser');
  await iconDialog.getByRole('button', {name: 'Выбрать картинку…'}).click();
  await (await chooser).setFiles({name: 'halves.png', mimeType: 'image/png', buffer: await makeHalves(page)});
  const crop = page.getByRole('dialog', {name: 'Выберите область'});
  await expect(crop.getByRole('button', {name: 'Область миниатюры'})).toBeVisible();
  return {iconDialog, crop};
}

test.beforeEach(async ({newtab}) => {
  await seed(newtab, [{title: 'Halves', url: 'https://halves.example/'}]);
});

test('the frame is dragged by a corner and moved with the mouse; the tile gets that part', async ({newtab}) => {
  const {iconDialog, crop} = await chooseFile(newtab, 'Halves');
  const frame = crop.getByRole('button', {name: 'Область миниатюры'});

  // The image is wider than the tile: at first the frame takes its full height, in the middle
  const stage = await crop.locator('.crop__stage').boundingBox();
  let box = (await frame.boundingBox())!;
  expect(Math.abs(box.height - stage!.height)).toBeLessThan(4);

  // The bottom-right corner up and left — the frame shrinks, its top-left corner stays
  const corner = crop.locator('.crop__handle--se');
  const handle = (await corner.boundingBox())!;
  await newtab.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await newtab.mouse.down();
  await newtab.mouse.move(handle.x - box.width * 0.6, handle.y - box.height * 0.6, {steps: 5});
  await newtab.mouse.up();
  const smaller = (await frame.boundingBox())!;
  expect(smaller.width).toBeLessThan(box.width * 0.6);
  expect(Math.abs(smaller.x - box.x)).toBeLessThan(2);
  box = smaller;

  // Moved to the right edge: the frame is all on the blue half
  await newtab.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await newtab.mouse.down();
  await newtab.mouse.move(stage!.x + stage!.width, box.y + box.height / 2, {steps: 5});
  await newtab.mouse.up();
  const moved = (await frame.boundingBox())!;
  expect(Math.abs(moved.x + moved.width - (stage!.x + stage!.width))).toBeLessThan(4);

  await crop.getByRole('button', {name: 'Сохранить'}).click();
  await expect(crop).toHaveCount(0);
  await expect(iconDialog.getByRole('status')).toHaveText('Область сохранена');
  const [red, , blue] = await centreColor(newtab, 'Halves');
  expect(blue).toBeGreaterThan(180);
  expect(red).toBeLessThan(80);
});

test('the keyboard moves and resizes the frame', async ({newtab}) => {
  const {crop} = await chooseFile(newtab, 'Halves');
  const frame = crop.getByRole('button', {name: 'Область миниатюры'});
  await frame.focus();
  const before = (await frame.boundingBox())!;
  for (let i = 0; i < 30; i++) await newtab.keyboard.press('Shift+ArrowLeft');
  const after = (await frame.boundingBox())!;
  expect(after.width).toBeLessThan(before.width);
  for (let i = 0; i < 100; i++) await newtab.keyboard.press('ArrowRight');

  // The preview on the right follows the frame
  await expect(crop.locator('.crop__tile-image')).toHaveAttribute('style', /left: -/);
  await crop.getByRole('button', {name: 'Сохранить'}).click();
  const [red, , blue] = await centreColor(newtab, 'Halves');
  expect(blue).toBeGreaterThan(180);
  expect(red).toBeLessThan(80);
});

test('cancel saves nothing; "Choose area…" crops the current thumbnail', async ({newtab}) => {
  const {iconDialog, crop} = await chooseFile(newtab, 'Halves');
  await crop.getByRole('button', {name: 'Отмена'}).click();
  await expect(crop).toHaveCount(0);
  await expect(tile(newtab, 'Halves').locator('.tile__thumbnail')).toHaveCount(0);

  // The whole image this time
  const chooser = newtab.waitForEvent('filechooser');
  await iconDialog.getByRole('button', {name: 'Выбрать картинку…'}).click();
  await (await chooser).setFiles({name: 'halves.png', mimeType: 'image/png', buffer: await makeHalves(newtab)});
  await crop.getByRole('button', {name: 'Вся картинка'}).click();
  await expect(iconDialog.getByRole('status')).toHaveText('Картинка обновлена');
  await expect(tile(newtab, 'Halves').locator('.tile__thumbnail')).toBeVisible();

  // Later a part of it: the left edge — red
  await iconDialog.getByRole('button', {name: 'Выбрать область…'}).click();
  const frame = crop.getByRole('button', {name: 'Область миниатюры'});
  await frame.focus();
  for (let i = 0; i < 40; i++) await newtab.keyboard.press('Shift+ArrowLeft');
  for (let i = 0; i < 100; i++) await newtab.keyboard.press('ArrowLeft');
  await crop.getByRole('button', {name: 'Сохранить'}).click();
  await expect(iconDialog.getByRole('status')).toHaveText('Область сохранена');
  await expect.poll(async () => (await centreColor(newtab, 'Halves'))[0]).toBeGreaterThan(180);

  // "Whole image" for the current thumbnail changes nothing
  await iconDialog.getByRole('button', {name: 'Выбрать область…'}).click();
  await crop.getByRole('button', {name: 'Вся картинка'}).click();
  await expect(crop).toHaveCount(0);
  expect((await centreColor(newtab, 'Halves'))[0]).toBeGreaterThan(180);
});

test('the image goes to all bookmarks of the site at once', async ({newtab}) => {
  await seed(newtab, [
    {title: 'Halves 2', url: 'https://www.halves.example/other'},
    {title: 'Halves 3', url: 'http://halves.example/third'},
    {title: 'Elsewhere', url: 'https://elsewhere.example/'},
  ]);
  const {iconDialog, crop} = await chooseFile(newtab, 'Halves');
  await crop.getByRole('button', {name: 'Вся картинка'}).click();
  await expect(iconDialog.getByRole('status')).toHaveText('Картинка обновлена');

  await iconDialog.getByRole('button', {name: 'Для всех закладок сайта (3)'}).click();
  const confirm = newtab.getByRole('dialog', {name: 'Одна картинка для сайта halves.example'});
  await expect(confirm).toContainText('Ещё 2 закладки этого сайта получат такую же картинку');
  await confirm.getByRole('button', {name: 'Применить'}).click();
  await expect(confirm).toHaveCount(0);
  await expect(iconDialog.getByRole('status')).toHaveText('Картинка поставлена ещё 2 закладкам');

  await expect(tile(newtab, 'Halves 2').locator('.tile__thumbnail')).toBeVisible();
  await expect(tile(newtab, 'Halves 3').locator('.tile__thumbnail')).toBeVisible();
  await expect(tile(newtab, 'Elsewhere').locator('.tile__thumbnail')).toHaveCount(0);
});
