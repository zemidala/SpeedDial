import {expect, patchManifest, test} from './fixtures';

test.use({isolatedBuild: true});

test('без уведомления, когда манифест актуален', async ({newtab}) => {
  await expect(newtab.getByRole('navigation', {name: 'Путь к папке'})).toBeVisible();
  await newtab.waitForTimeout(500); // Проверка манифеста асинхронная
  await expect(newtab.getByRole('alert')).toHaveCount(0);
});

test('подсказывает перезагрузить расширение, если манифест на диске новее загруженного', async ({extensionPath, newtab}) => {
  // Так бывает после пересборки: файлы обновились, а браузер держит старый манифест до перезагрузки расширения
  patchManifest(extensionPath, (manifest) => {
    manifest.optional_permissions = [...(manifest.optional_permissions as string[]), 'notifications'];
  });
  await newtab.reload();

  const notice = newtab.getByRole('alert');
  await expect(notice).toContainText('нажмите «Перезагрузить» у SpeedDial');
  await notice.getByRole('button', {name: 'Закрыть уведомление'}).click();
  await expect(notice).toHaveCount(0);
});
