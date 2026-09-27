<script lang="ts">
  import type {BookmarkNode} from '../../../lib/bookmarks.svelte';
  import {pickFile, readClipboardImage} from '../../../lib/files';
  import {t} from '../../../lib/i18n/index.svelte';
  import {icons} from '../../../lib/icons.svelte';
  import {iconOnly} from '../../../lib/perBookmark.svelte';
  import {SITE_ACCESS} from '../../../lib/permissionSets';
  import {permissions} from '../../../lib/permissions.svelte';
  import {thumbnails} from '../../../lib/thumbnails/store.svelte';
  import {isWebUrl} from '../../../lib/url';
  import SiteIcon from '../grid/SiteIcon.svelte';
  import Icon from '../ui/Icon.svelte';
  import Modal from '../ui/Modal.svelte';

  // Bookmark icon and thumbnail: a preview and every way to change them. A folder gets only its own picture —
  // shown on its tile instead of the previews of what's inside
  let {node, onclose}: {node: BookmarkNode; onclose: () => void} = $props();

  const url = $derived(node.url ?? '');
  const isFolder = $derived(!node.url);
  const icon = $derived(isFolder ? null : icons.get(url));
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

  /** What's going on right now — shown on the preview and on the pressed button */
  let working = $state<'icon' | 'capture' | null>(null);

  async function refreshIcon() {
    working = 'icon';
    await run(() => icons.refresh(url), t.iconDialog.iconUpdated);
    working = null;
  }

  // The screenshot is taken by the service worker: done when the thumbnail changes; if capturing ends without
  // a new thumbnail (the page couldn't be captured), that's reported after a moment for the last message to arrive
  let thumbnailBefore: string | null = null;

  const capture = () => run(async () => {
    // Request the permission first, while the user's click still counts
    if (!permissions.siteAccess && !(await permissions.request(SITE_ACCESS))) {
      throw new Error(t.iconDialog.captureNeedsAccess);
    }
    thumbnailBefore = thumbnail.url;
    working = 'capture';
    await thumbnails.capture([{id: node.id, url}]);
  }, '');

  $effect(() => {
    if (working !== 'capture') return;
    if (thumbnail.url && thumbnail.url !== thumbnailBefore) {
      working = null;
      status = t.iconDialog.captureDone;
      void useThumbnail();
      return;
    }
    if (thumbnails.progress !== null) return;
    const timer = setTimeout(() => {
      working = null;
      error = t.iconDialog.captureFailed;
    }, 1500);
    return () => clearTimeout(timer);
  });

  const choiceName = $props.id();
  const showIcon = $derived(Boolean(iconOnly.get(node.id)));

  /** Thumbnail or site icon on this bookmark's tile; the thumbnail stays either way */
  const choose = (icon: boolean) => run(() => iconOnly.set(node.id, icon || null), icon ? t.iconDialog.iconShown : t.iconDialog.thumbnailShown);

  // A new image is wanted on the tile — so the tile shows it again, even if the icon was chosen before
  const useThumbnail = () => iconOnly.set(node.id, null);

  const pick = () => run(async () => {
    const file = await pickFile('image/*');
    if (!file) return;
    await thumbnails.setCustom(node.id, file);
    await useThumbnail();
  }, t.iconDialog.imageUpdated);

  const paste = () => run(async () => {
    const image = await readClipboardImage();
    if (!image) throw new Error(t.iconDialog.noClipboardImage);
    await thumbnails.setCustom(node.id, image);
    await useThumbnail();
  }, t.iconDialog.pasted);

  const removeThumbnail = () => run(async () => {
    await thumbnails.remove(node.id);
    await useThumbnail();
  }, isFolder ? t.iconDialog.folderImageRemoved : t.iconDialog.removed);
</script>

<Modal title={isFolder ? t.iconDialog.folderTitle(node.title) : t.iconDialog.title(node.title)} {onclose}>
  <div class="icon-dialog__preview" class:icon-dialog__preview--choice={thumbnail.url && icon} aria-busy={working !== null}>
    {#if thumbnail.url && !icon}
      <img class="icon-dialog__thumbnail" src={thumbnail.url} alt={t.iconDialog.currentImage}>
    {:else if !icon}
      <Icon name="folder" class="icon-dialog__folder"/>
    {:else if thumbnail.url}
      <!-- There's a thumbnail: the tile can show it or the site icon — for this bookmark only -->
      <div class="icon-dialog__choices" role="radiogroup" aria-label={t.iconDialog.showOnTile}>
        <label class="icon-dialog__choice">
          <input
            type="radio"
            name="{choiceName}-look"
            checked={!showIcon}
            onchange={() => choose(false)}
          >
          <span class="icon-dialog__choice-visual">
            <img class="icon-dialog__thumbnail" src={thumbnail.url} alt={t.iconDialog.currentImage}>
          </span>
          <span class="icon-dialog__choice-label">{t.iconDialog.showThumbnail}</span>
        </label>
        <label class="icon-dialog__choice">
          <input
            type="radio"
            name="{choiceName}-look"
            checked={showIcon}
            onchange={() => choose(true)}
          >
          <span class="icon-dialog__choice-visual icon-dialog__choice-visual--icon"><SiteIcon entry={icon}/></span>
          <span class="icon-dialog__choice-label">{t.iconDialog.showIcon}</span>
        </label>
      </div>
    {:else}
      <SiteIcon entry={icon}/>
    {/if}
    {#if working}
      <div class="icon-dialog__working" role="status">
        <span class="icon-dialog__spinner" aria-hidden="true"></span>
        {working === 'icon' ? t.iconDialog.iconUpdating : t.iconDialog.capturing}
      </div>
    {/if}
  </div>

  <div class="icon-dialog__actions">
    {#if !isFolder}
      <button type="button" class="button" disabled={busy || working !== null} onclick={refreshIcon}>
        {t.iconDialog.refreshIcon}
      </button>
    {/if}
    {#if isWebUrl(url)}
      <button
        type="button"
        class="button"
        disabled={busy || working !== null || thumbnails.progress !== null}
        onclick={capture}
      >
        {t.iconDialog.capture}
      </button>
    {/if}
    <button type="button" class="button" disabled={busy || working !== null} onclick={pick}>{t.iconDialog.chooseImage}</button>
    <button type="button" class="button" disabled={busy || working !== null || !permissions.clipboard} onclick={paste}>
      {t.iconDialog.paste}
    </button>
    {#if thumbnail.url}
      <button type="button" class="button" disabled={busy || working !== null} onclick={removeThumbnail}>{t.iconDialog.removeImage}</button>
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
    position: relative;
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

  .icon-dialog__preview :global(.icon-dialog__folder) {
    width: 72px;
    height: 72px;
    color: var(--accent);
    stroke-width: 1.5;
  }

  .icon-dialog__thumbnail {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
  }

  /* Thumbnail or icon: two cards side by side, the chosen one outlined */
  .icon-dialog__preview--choice {
    height: auto;
    padding: 10px;
  }

  .icon-dialog__choices {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    width: 100%;
  }

  .icon-dialog__choice {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px;
    border: 2px solid transparent;
    border-radius: var(--radius-small);
    cursor: pointer;
  }

  .icon-dialog__choice:has(input:checked) {
    border-color: var(--accent);
    background: color-mix(in oklab, var(--accent) 8%, transparent);
  }

  .icon-dialog__choice:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* The radio button itself is hidden: the whole card is the choice */
  .icon-dialog__choice input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .icon-dialog__choice-visual {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 110px;
    overflow: hidden;
    border-radius: var(--radius-small);
    background: var(--surface);
    container-type: inline-size;
    --site-icon-size: 64px;
  }

  .icon-dialog__choice-label {
    font-size: 0.8125rem;
    text-align: center;
  }

  /* A veil over the preview with a spinner and what's being done */
  .icon-dialog__working {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    background: color-mix(in oklab, var(--surface) 78%, transparent);
    color: var(--text);
    font-size: 0.875rem;
    backdrop-filter: blur(2px);
  }

  .icon-dialog__spinner {
    width: 28px;
    height: 28px;
    border: 3px solid color-mix(in oklab, var(--accent) 25%, transparent);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: icon-dialog-spin 0.8s linear infinite;
  }

  @keyframes icon-dialog-spin {
    to {
      transform: rotate(1turn);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .icon-dialog__spinner {
      animation-duration: 2.4s;
    }
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
