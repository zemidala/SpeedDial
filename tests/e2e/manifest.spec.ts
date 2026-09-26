import {expect, patchManifest, test} from './fixtures';

test.use({isolatedBuild: true});

test('no notification when the manifest is current', async ({newtab}) => {
  await expect(newtab.getByRole('navigation', {name: 'Путь к папке'})).toBeVisible();
  await newtab.waitForTimeout(500); // The manifest check is asynchronous
  await expect(newtab.getByRole('alert')).toHaveCount(0);
});

test('suggests reloading the extension if the manifest on disk is newer than the loaded one', async ({extensionPath, newtab}) => {
  // This happens after a rebuild: the files changed, but the browser keeps the old manifest until the extension is reloaded
  patchManifest(extensionPath, (manifest) => {
    manifest.optional_permissions = [...(manifest.optional_permissions as string[]), 'notifications'];
  });
  await newtab.reload();

  const notice = newtab.getByRole('alert');
  await expect(notice).toContainText('нажмите «Перезагрузить» у SpeedDial');
  await notice.getByRole('button', {name: 'Закрыть уведомление'}).click();
  await expect(notice).toHaveCount(0);
});
