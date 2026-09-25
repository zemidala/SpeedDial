<script lang="ts">
  import type {BookmarkNode} from '../../../lib/bookmarks.svelte';
  import {pickFile, readClipboardImage} from '../../../lib/files';
  import {icons} from '../../../lib/icons.svelte';
  import {SITE_ACCESS} from '../../../lib/permissionSets';
  import {permissions} from '../../../lib/permissions.svelte';
  import {thumbnails} from '../../../lib/thumbnails/store.svelte';
  import {isWebUrl} from '../../../lib/url';
  import SiteIcon from '../grid/SiteIcon.svelte';
  import Modal from '../ui/Modal.svelte';

  // Иконка и миниатюра закладки: превью и все способы их поменять
  let {node, onclose}: {node: BookmarkNode & {url: string}; onclose: () => void} = $props();

  const icon = $derived(icons.get(node.url));
  const thumbnail = $derived(thumbnails.get(node.id));

  let status = $state('');
  let error = $state('');
  let busy = $state(false);

  async function run(action: () => Promise<unknown>, doneMessage: string) {
    busy = true;
    status = '';
    error = '';
    try {
      await action();
      status = doneMessage;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  const refreshIcon = () => run(() => icons.refresh(node.url), 'Иконка загружается заново');

  const capture = () => run(async () => {
    // Запрос разрешения — первым делом, пока действует клик пользователя
    if (!permissions.siteAccess && !(await permissions.request(SITE_ACCESS))) {
      throw new Error('Без доступа к сайтам снимок страницы сделать нельзя');
    }
    await thumbnails.capture([{id: node.id, url: node.url}]);
  }, 'Снимок страницы делается — картинка обновится, когда он будет готов');

  const pick = () => run(async () => {
    const file = await pickFile('image/*');
    if (file) await thumbnails.setCustom(node.id, file);
  }, 'Картинка обновлена');

  const paste = () => run(async () => {
    const image = await readClipboardImage();
    if (!image) throw new Error('В буфере обмена нет картинки');
    await thumbnails.setCustom(node.id, image);
  }, 'Картинка вставлена из буфера обмена');

  const removeThumbnail = () => run(() => thumbnails.remove(node.id), 'Картинка убрана — показывается иконка сайта');
</script>

<Modal title="Значок «{node.title}»" {onclose}>
  <div class="icon-dialog__preview">
    {#if thumbnail.url}
      <img class="icon-dialog__thumbnail" src={thumbnail.url} alt="Текущая картинка">
    {:else}
      <SiteIcon entry={icon}/>
    {/if}
  </div>

  <div class="icon-dialog__actions">
    <button type="button" class="button" disabled={busy} onclick={refreshIcon}>Обновить иконку сайта</button>
    {#if isWebUrl(node.url)}
      <button type="button" class="button" disabled={busy || thumbnails.progress !== null} onclick={capture}>
        Сделать снимок страницы
      </button>
    {/if}
    <button type="button" class="button" disabled={busy} onclick={pick}>Выбрать картинку…</button>
    <button type="button" class="button" disabled={busy || !permissions.clipboard} onclick={paste}>
      Вставить из буфера обмена
    </button>
    {#if thumbnail.url}
      <button type="button" class="button" disabled={busy} onclick={removeThumbnail}>Убрать картинку</button>
    {/if}
  </div>

  {#if !permissions.clipboard}
    <p class="icon-dialog__hint">Чтобы вставлять картинки из буфера обмена, включите это разрешение в настройках, раздел «Расширенные».</p>
  {/if}
  {#if error}
    <p class="icon-dialog__error" role="alert">{error}</p>
  {:else if status}
    <p class="icon-dialog__status" role="status">{status}</p>
  {/if}

  {#snippet footer()}
    <button type="button" class="button button--primary" onclick={onclose}>Готово</button>
  {/snippet}
</Modal>

<style>
  .icon-dialog__preview {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 160px;
    margin-bottom: 16px;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--tile-bg);
    container-type: inline-size;
    --site-icon-size: 88px;
  }

  .icon-dialog__thumbnail {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
  }

  .icon-dialog__actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .icon-dialog__hint,
  .icon-dialog__status {
    margin: 12px 0 0;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.4;
  }

  .icon-dialog__error {
    margin: 12px 0 0;
    color: var(--danger);
    font-size: 13px;
  }
</style>
