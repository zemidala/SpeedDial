<script lang="ts">
  import type {BookmarkNode} from '../../lib/bookmarks.svelte';
  import Modal from './Modal.svelte';

  let {node, onclose}: {node: BookmarkNode; onclose: () => void} = $props();

  const isFolder = $derived(!node.url);
  let error = $state('');
  let deleting = $state(false);

  async function remove() {
    deleting = true;
    error = '';
    try {
      if (isFolder) {
        await chrome.bookmarks.removeTree(node.id);
      } else {
        await chrome.bookmarks.remove(node.id);
      }
      onclose();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      deleting = false;
    }
  }
</script>

<Modal title={isFolder ? 'Удалить папку?' : 'Удалить закладку?'} {onclose}>
  <p>
    «{node.title}»{#if isFolder}&nbsp;будет удалена вместе со всем содержимым{/if}.
    Отменить это действие нельзя.
  </p>

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  <div class="actions">
    <button type="button" class="button" onclick={onclose}>Отмена</button>
    <button type="button" class="button danger" disabled={deleting} onclick={remove}>Удалить</button>
  </div>
</Modal>

<style>
  p {
    margin: 0 0 16px;
    line-height: 1.4;
  }

  .error {
    color: var(--danger);
    font-size: 13px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
