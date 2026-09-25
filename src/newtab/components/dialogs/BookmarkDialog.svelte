<script lang="ts">
  import {SITE_ACCESS} from '../../../lib/permissionSets';
  import {permissions} from '../../../lib/permissions.svelte';
  import {settings} from '../../../lib/settings/store.svelte';
  import {thumbnails} from '../../../lib/thumbnails/store.svelte';
  import type {Dialog} from '../../../lib/ui.svelte';
  import {getHostname, isWebUrl, normalizeUrl} from '../../../lib/url';
  import Modal from '../ui/Modal.svelte';

  // Создание закладки или папки либо изменение существующей
  let {dialog, onclose}: {dialog: Extract<Dialog, {kind: 'create' | 'edit'}>; onclose: () => void} = $props();

  // Форма заполняется один раз при открытии; дальнейшие изменения закладки её не сбрасывают
  // svelte-ignore state_referenced_locally
  const initial = $state.snapshot(dialog);
  const isFolder = initial.kind === 'create' ? initial.type === 'folder' : !initial.node.url;
  const formId = $props.id();

  let title = $state(initial.kind === 'edit' ? initial.node.title : '');
  let url = $state(initial.kind === 'edit' ? initial.node.url ?? '' : '');
  let error = $state('');
  let saving = $state(false);

  function getHeading(): string {
    if (initial.kind === 'create') return isFolder ? 'Новая папка' : 'Новая закладка';
    return isFolder ? 'Изменить папку' : 'Изменить закладку';
  }

  /** Место новой закладки: в начало, если так задано в настройках, иначе переданное (по умолчанию — в конец) */
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
          title: title.trim() || 'Новая папка',
        });
      }
      return;
    }

    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) {
      throw new Error('Неверный формат URL');
    }
    const details = {title: title.trim() || getHostname(normalizedUrl), url: normalizedUrl};

    if (initial.kind === 'edit') {
      await chrome.bookmarks.update(initial.node.id, details);
      return;
    }

    // Разрешение на снимок запрашиваем до остальных await, пока действует нажатие кнопки
    const canCapture = settings.current.captureOnCreate && isWebUrl(normalizedUrl)
      && (permissions.siteAccess || await permissions.request(SITE_ACCESS));
    const created = await chrome.bookmarks.create({
      parentId: initial.parentId,
      index: newIndex(initial.index),
      ...details,
    });
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
    <label class="bookmark-form__label" for="{formId}-title">Название</label>
    <input
      id="{formId}-title"
      class="input bookmark-form__field"
      type="text"
      placeholder={isFolder ? 'Новая папка' : 'Введите название'}
      bind:value={title}
    >

    {#if !isFolder}
      <label class="bookmark-form__label" for="{formId}-url">Адрес</label>
      <input
        id="{formId}-url"
        class="input bookmark-form__field"
        type="text"
        placeholder="example.com"
        required
        bind:value={url}
      >
    {/if}

    {#if error}
      <p class="bookmark-form__error" role="alert">{error}</p>
    {/if}
  </form>

  {#snippet footer()}
    <button type="button" class="button" onclick={onclose}>Отмена</button>
    <button type="submit" class="button button--primary" form={formId} disabled={saving}>
      {initial.kind === 'create' ? 'Создать' : 'Сохранить'}
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
    font-size: 14px;
  }

  .bookmark-form__field {
    margin-bottom: 10px;
  }

  .bookmark-form__error {
    margin: 0;
    color: var(--danger);
    font-size: 13px;
  }
</style>
