<script lang="ts">
  import {onMount} from 'svelte';
  import {t} from '../../../lib/i18n/index.svelte';
  import {requestSitePage} from '../../../lib/messages';
  import {MAX_DESCRIPTION_LENGTH, pageDescription, pageTitle} from '../../../lib/pageText';
  import {descriptionStorage} from '../../../lib/perBookmark';
  import {descriptions} from '../../../lib/perBookmark.svelte';
  import {SITE_ACCESS} from '../../../lib/permissionSets';
  import {permissions} from '../../../lib/permissions.svelte';
  import {settings} from '../../../lib/settings/store.svelte';
  import {thumbnails} from '../../../lib/thumbnails/store.svelte';
  import type {Dialog} from '../../../lib/ui.svelte';
  import {displayHost, getHostname, isWebUrl, normalizeUrl} from '../../../lib/url';
  import Modal from '../ui/Modal.svelte';

  // Creating a bookmark or folder, or editing an existing one
  let {dialog, onclose}: {dialog: Extract<Dialog, {kind: 'create' | 'edit'}>; onclose: () => void} = $props();

  // The form is filled once when it opens; later changes to the bookmark don't reset it
  // svelte-ignore state_referenced_locally
  const initial = $state.snapshot(dialog);
  const isFolder = initial.kind === 'create' ? initial.type === 'folder' : !initial.node.url;
  const formId = $props.id();

  let title = $state(initial.kind === 'edit' ? initial.node.title : '');
  let url = $state(initial.kind === 'edit' ? initial.node.url ?? '' : '');
  let error = $state('');
  let saving = $state(false);
  let description = $state(initial.kind === 'edit' ? descriptions.get(initial.node.id) ?? '' : '');

  // Right after the page opens the descriptions may not be loaded yet — then the stored one is read here,
  // so saving doesn't wipe it (unless something was already typed)
  onMount(() => {
    if (initial.kind !== 'edit' || description) return;
    const id = initial.node.id;
    descriptionStorage.load()
      .then((stored) => {
        if (!description && stored[id]) description = stored[id];
      })
      .catch(() => undefined);
  });
  let fetchingTitle = $state(false);
  let titleHint = $state('');

  /**
   * The page's name and description from the site, so they needn't be typed. By the button (interactive) they replace
   * what's in the fields and site access is asked for if needed; on their own (after the address is typed) they only
   * fill empty fields, silently. A site that gives no name gets its address as the name
   */
  // The button pressed while a silent load is already running (leaving the address field starts one) makes that
  // load count as a press — its result then replaces the fields
  let pressed = false;

  async function fetchTitle(interactive: boolean) {
    const pageUrl = normalizeUrl(url);
    if (!pageUrl || !isWebUrl(pageUrl)) {
      if (interactive) titleHint = t.bookmark.titleNeedsUrl;
      return;
    }
    if (interactive) pressed = true;
    if (fetchingTitle) return;
    if (!permissions.siteAccess && (!interactive || !(await permissions.request(SITE_ACCESS)))) return;

    fetchingTitle = true;
    titleHint = '';
    let page: Awaited<ReturnType<typeof requestSitePage>> | null = null;
    try {
      page = await requestSitePage(pageUrl);
    } catch {
      // The service worker didn't answer — as if the site gave nothing
    }
    const html = page && !('error' in page) ? page.text : '';
    const name = pageTitle(html);
    const about = pageDescription(html);
    const replace = pressed;
    pressed = false;

    if (replace || !title.trim()) title = name ?? displayHost(pageUrl);
    if (about && (replace || !description.trim())) description = about;
    if (!name && replace) titleHint = t.bookmark.titleNotFound;
    fetchingTitle = false;
  }

  function getHeading(): string {
    if (initial.kind === 'create') {
      const heading = isFolder ? t.bookmark.newFolder : t.bookmark.newBookmark;
      return initial.parentTitle ? t.bookmark.inFolder(heading, initial.parentTitle) : heading;
    }
    return isFolder ? t.bookmark.editFolder : t.bookmark.editBookmark;
  }

  /** Position of the new bookmark: at the top if the settings say so, otherwise the given one (the end by default) */
  function newIndex(index: number | undefined): number | undefined {
    return settings.current.newBookmarksFirst ? 0 : index;
  }

  async function save() {
    if (isFolder) {
      if (initial.kind === 'edit') {
        await chrome.bookmarks.update(initial.node.id, {title: title.trim() || initial.node.title});
      } else {
        await chrome.bookmarks.create({
          parentId: initial.parentId,
          index: newIndex(initial.index),
          title: title.trim() || t.bookmark.newFolder,
        });
      }
      return;
    }

    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) {
      throw new Error(t.bookmark.invalidUrl);
    }
    const details = {title: title.trim() || getHostname(normalizedUrl), url: normalizedUrl};

    // The browser has no field for a description — it's kept by the extension under the bookmark's id
    const saveDescription = (id: string) => descriptions.set(id, description.trim() || null);

    if (initial.kind === 'edit') {
      await chrome.bookmarks.update(initial.node.id, details);
      await saveDescription(initial.node.id);
      return;
    }

    // The screenshot permission is requested before other awaits, while the button press still counts
    const canCapture = settings.current.captureOnCreate && isWebUrl(normalizedUrl)
      && (permissions.siteAccess || await permissions.request(SITE_ACCESS));
    const created = await chrome.bookmarks.create({
      parentId: initial.parentId,
      index: newIndex(initial.index),
      ...details,
    });
    await saveDescription(created.id);
    if (canCapture) await thumbnails.capture([{id: created.id, url: normalizedUrl}]);
  }

  async function onsubmit(event: SubmitEvent) {
    event.preventDefault();
    saving = true;
    error = '';
    try {
      await save();
      onclose();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      saving = false;
    }
  }
</script>

<Modal title={getHeading()} {onclose}>
  <form id={formId} class="bookmark-form" {onsubmit}>
    <label class="bookmark-form__label" for="{formId}-title">{t.bookmark.title}</label>
    <div class="bookmark-form__row">
      <input
        id="{formId}-title"
        class="input"
        type="text"
        placeholder={fetchingTitle
          ? t.bookmark.titleLoading
          : isFolder ? t.bookmark.newFolder : t.bookmark.titlePlaceholder}
        bind:value={title}
      >
      {#if !isFolder}
        <button
          type="button"
          class="button bookmark-form__fetch"
          title={t.bookmark.titleFromSiteHint}
          aria-busy={fetchingTitle}
          onclick={() => fetchTitle(true)}
        >
          {#if fetchingTitle}<span class="bookmark-form__spinner" aria-hidden="true"></span>{/if}
          {t.bookmark.titleFromSite}
        </button>
      {/if}
    </div>
    {#if titleHint}
      <p class="bookmark-form__hint" role="status">{titleHint}</p>
    {/if}

    {#if !isFolder}
      <label class="bookmark-form__label" for="{formId}-url">{t.bookmark.address}</label>
      <!-- Empty name and description fields are filled from the site as soon as the address is typed -->
      <input
        id="{formId}-url"
        class="input bookmark-form__field"
        type="text"
        placeholder="example.com"
        required
        bind:value={url}
        onchange={() => (!title.trim() || !description.trim()) && fetchTitle(false)}
      >
    {/if}

    {#if !isFolder}
      <label class="bookmark-form__label" for="{formId}-description">{t.bookmark.description}</label>
      <textarea
        id="{formId}-description"
        class="input bookmark-form__field bookmark-form__description"
        rows="3"
        maxlength={MAX_DESCRIPTION_LENGTH}
        placeholder={fetchingTitle ? t.bookmark.titleLoading : t.bookmark.descriptionPlaceholder}
        bind:value={description}
      ></textarea>
    {/if}

    {#if error}
      <p class="bookmark-form__error" role="alert">{error}</p>
    {/if}
  </form>

  {#snippet footer()}
    <button type="button" class="button" onclick={onclose}>{t.common.cancel}</button>
    <button type="submit" class="button button--primary" form={formId} disabled={saving}>
      {initial.kind === 'create' ? t.common.create : t.common.save}
    </button>
  {/snippet}
</Modal>

<style>
  .bookmark-form {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .bookmark-form__label {
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .bookmark-form__field,
  .bookmark-form__row {
    margin-bottom: 10px;
  }

  .bookmark-form__description {
    min-height: 64px;
    resize: vertical;
    line-height: 1.4;
  }

  .bookmark-form__row {
    display: flex;
    gap: 8px;
  }

  .bookmark-form__fetch {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .bookmark-form__spinner {
    width: 14px;
    height: 14px;
    border: 2px solid color-mix(in oklab, var(--accent) 25%, transparent);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: bookmark-form-spin 0.8s linear infinite;
  }

  @keyframes bookmark-form-spin {
    to {
      transform: rotate(1turn);
    }
  }

  .bookmark-form__hint {
    margin: -6px 0 8px;
    color: var(--text-muted);
    font-size: 0.8125rem;
  }

  .bookmark-form__error {
    margin: 0;
    color: var(--danger);
    font-size: 0.8125rem;
  }
</style>
