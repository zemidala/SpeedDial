<script lang="ts">
  import {type BookmarkNode, bookmarks} from '../../lib/bookmarks.svelte';
  import {getHostname, normalizeUrl} from '../../lib/url';
  import Modal from './Modal.svelte';

  // node = null — создание новой закладки в текущей папке
  let {node, onclose}: {node: BookmarkNode | null; onclose: () => void} = $props();

  // Форма заполняется один раз при открытии; дальнейшие изменения закладки её не сбрасывают
  // svelte-ignore state_referenced_locally
  const initial = $state.snapshot(node);
  const isFolder = initial !== null && !initial.url;

  let title = $state(initial?.title ?? '');
  let url = $state(initial?.url ?? '');
  let error = $state('');
  let saving = $state(false);

  function getHeading(): string {
    if (!initial) return 'Добавить закладку';
    return isFolder ? 'Изменить папку' : 'Изменить закладку';
  }

  async function save() {
    if (initial && isFolder) {
      await chrome.bookmarks.update(initial.id, {title: title.trim() || initial.title});
      return;
    }

    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) {
      throw new Error('Неверный формат URL');
    }
    const details = {title: title.trim() || getHostname(normalizedUrl), url: normalizedUrl};

    if (initial) {
      await chrome.bookmarks.update(initial.id, details);
    } else {
      await chrome.bookmarks.create({parentId: bookmarks.targetFolderId, ...details});
    }
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
  <form {onsubmit}>
    <label for="bookmark-title">Название</label>
    <input id="bookmark-title" class="input" type="text" placeholder="Введите название" bind:value={title}>

    {#if !isFolder}
      <label for="bookmark-url">Адрес</label>
      <input id="bookmark-url" class="input" type="text" placeholder="example.com" required bind:value={url}>
    {/if}

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}

    <div class="actions">
      <button type="button" class="button" onclick={onclose}>Отмена</button>
      <button type="submit" class="button primary" disabled={saving}>Сохранить</button>
    </div>
  </form>
</Modal>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  label {
    color: var(--text-muted);
    font-size: 14px;
  }

  .input {
    margin-bottom: 10px;
  }

  .error {
    margin: 0 0 10px;
    color: var(--danger);
    font-size: 13px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
