<script lang="ts">
  import type {BookmarkNode} from '../../../lib/bookmarks.svelte';
  import {pickFile, readClipboardImage} from '../../../lib/files';
  import {t} from '../../../lib/i18n/index.svelte';
  import {icons} from '../../../lib/icons.svelte';
  import {SITE_ACCESS} from '../../../lib/permissionSets';
  import {permissions} from '../../../lib/permissions.svelte';
  import {thumbnails} from '../../../lib/thumbnails/store.svelte';
  import {isWebUrl} from '../../../lib/url';
  import SiteIcon from '../grid/SiteIcon.svelte';
  import Modal from '../ui/Modal.svelte';

  // Bookmark icon and thumbnail: a preview and every way to change them
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

  const refreshIcon = () => run(() => icons.refresh(node.url), t.iconDialog.iconReloading);

  const capture = () => run(async () => {
    // Request the permission first, while the user's click still counts
    if (!permissions.siteAccess && !(await permissions.request(SITE_ACCESS))) {
      throw new Error(t.iconDialog.captureNeedsAccess);
    }
    await thumbnails.capture([{id: node.id, url: node.url}]);
  }, t.iconDialog.captureStarted);

  const pick = () => run(async () => {
    const file = await pickFile('image/*');
    if (file) await thumbnails.setCustom(node.id, file);
  }, t.iconDialog.imageUpdated);

  const paste = () => run(async () => {
    const image = await readClipboardImage();
    if (!image) throw new Error(t.iconDialog.noClipboardImage);
    await thumbnails.setCustom(node.id, image);
  }, t.iconDialog.pasted);

  const removeThumbnail = () => run(() => thumbnails.remove(node.id), t.iconDialog.removed);
</script>

<Modal title={t.iconDialog.title(node.title)} {onclose}>
  <div class="icon-dialog__preview">
    {#if thumbnail.url}
      <img class="icon-dialog__thumbnail" src={thumbnail.url} alt={t.iconDialog.currentImage}>
    {:else}
      <SiteIcon entry={icon}/>
    {/if}
  </div>

  <div class="icon-dialog__actions">
    <button type="button" class="button" disabled={busy} onclick={refreshIcon}>{t.iconDialog.refreshIcon}</button>
    {#if isWebUrl(node.url)}
      <button type="button" class="button" disabled={busy || thumbnails.progress !== null} onclick={capture}>
        {t.iconDialog.capture}
      </button>
    {/if}
    <button type="button" class="button" disabled={busy} onclick={pick}>{t.iconDialog.chooseImage}</button>
    <button type="button" class="button" disabled={busy || !permissions.clipboard} onclick={paste}>
      {t.iconDialog.paste}
    </button>
    {#if thumbnail.url}
      <button type="button" class="button" disabled={busy} onclick={removeThumbnail}>{t.iconDialog.removeImage}</button>
    {/if}
  </div>

  {#if !permissions.clipboard}
    <p class="icon-dialog__hint">{t.iconDialog.clipboardHint}</p>
  {/if}
  {#if error}
    <p class="icon-dialog__error" role="alert">{error}</p>
  {:else if status}
    <p class="icon-dialog__status" role="status">{status}</p>
  {/if}

  {#snippet footer()}
    <button type="button" class="button button--primary" onclick={onclose}>{t.common.done}</button>
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
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  .icon-dialog__error {
    margin: 12px 0 0;
    color: var(--danger);
    font-size: 0.8125rem;
  }
</style>
