import {expect, getChildren, openSettings, patchManifest, seed, test} from './fixtures';

// The popup of the toolbar icon, opened as a page: a test can't click the toolbar
test.use({isolatedBuild: true});

test('shows the numbers of sites, folders and broken links, and the version', async ({context, extensionId, newtab}) => {
  await seed(newtab, [
    {title: 'Alpha', url: 'https://alpha.example/'},
    {title: 'Work', children: [{title: 'Beta', url: 'https://beta.example/'}, {title: 'Empty', children: []}]},
  ]);
  const [alpha] = await getChildren(newtab, '1');
  await newtab.evaluate((id) => chrome.storage.local.set({[`brokenLinks:${id}`]: {checkedAt: Date.now(), reason: 'test'}}), alpha.id);

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const version = await popup.evaluate(() => chrome.runtime.getManifest().version);

  await expect(popup.getByText(`Версия ${version}`)).toBeVisible();
  await expect(popup.locator('.popup__stat', {hasText: 'Сайты'}).locator('dd')).toHaveText('2');
  await expect(popup.locator('.popup__stat', {hasText: 'Папки'}).locator('dd')).toHaveText('2');
  await expect(popup.locator('.popup__stat', {hasText: 'Не работают'}).locator('dd')).toHaveText('1');
});

test('"Settings" opens a new tab with the settings', async ({context, extensionId}) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  const [tab] = await Promise.all([
    context.waitForEvent('page'),
    popup.getByRole('button', {name: 'Настройки'}).click(),
  ]);
  await expect(tab.getByRole('dialog', {name: 'Настройки'})).toBeVisible();
});

test('unpacked: a newer build on disk is shown, reloading is offered, the icon gets a mark', async ({context, extensionId, extensionPath}) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByRole('status')).toHaveText('Загружена сборка с диска');
  await expect(popup.getByRole('button', {name: 'Перезагрузить'})).toBeVisible();

  // A rebuild: the manifest on disk has the next build number, the browser keeps the loaded one
  let newer = '';
  patchManifest(extensionPath, (manifest) => {
    const parts = (manifest.version as string).split('.');
    parts[3] = String(Number(parts[3]) + 1);
    newer = parts.join('.');
    manifest.version = newer;
  });
  await popup.reload();
  await expect(popup.getByRole('status')).toHaveText(`На диске новая сборка: ${newer}`);
  expect(await popup.evaluate(() => chrome.action.getBadgeText({}))).toBe('↑');
});

test('About shows the update status too', async ({newtab}) => {
  const dialog = await openSettings(newtab, 'О программе');
  await expect(dialog.getByText('Загружена сборка с диска')).toBeVisible();
  await expect(dialog.getByRole('button', {name: 'Перезагрузить'})).toBeVisible();
});
