<script lang="ts">
  import {type BookmarkNode, bookmarks} from '../../../lib/bookmarks.svelte';
  import {exportBookmarks} from '../../../lib/exportBookmarks';
  import {t} from '../../../lib/i18n/index.svelte';
  import {showNotice} from '../../../lib/notice.svelte';
  import {selection} from '../../../lib/selection.svelte';
  import {requestDeleteMany, requestOpenAll, ui} from '../../../lib/ui.svelte';
  import Icon from '../ui/Icon.svelte';

  // Action bar for the selected tiles — at the bottom of the page while something is selected
  let {nodes}: {nodes: BookmarkNode[]} = $props();

  const hasBookmarks = $derived(nodes.some((node) => node.url));

  async function exportSelected() {
    const title = nodes.length === 1 ? nodes[0].title : bookmarks.path.at(-1)?.title ?? t.common.home;
    const count = await exportBookmarks(nodes.map((node) => node.id), title);
    showNotice(t.selection.exported(count), 'info');
  }

  function run(action: () => Promise<unknown> | void) {
    Promise.resolve()
      .then(action)
      .catch((error) => showNotice(error instanceof Error ? error.message : String(error)));
  }
</script>

<div class="selection-bar" role="toolbar" aria-label={t.selection.toolbar}>
  <span class="selection-bar__count" role="status">{t.selection.count(nodes.length)}</span>
  <button type="button" class="button" disabled={!hasBookmarks} onclick={() => run(() => requestOpenAll(nodes))}>
    <Icon name="external" size={16}/>{t.selection.openAll}
  </button>
  <button type="button" class="button" onclick={() => (ui.dialog = {kind: 'move', nodes})}>
    <Icon name="folderMove" size={16}/>{t.selection.move}
  </button>
  <!-- The selected bookmarks and folders with everything inside, as a file any browser can import -->
  <button type="button" class="button" onclick={() => run(exportSelected)}>
    <Icon name="download" size={16}/>{t.selection.export}
  </button>
  <button type="button" class="button button--danger" onclick={() => run(() => requestDeleteMany(nodes))}>
    <Icon name="trash" size={16}/>{t.selection.delete}
  </button>
  <button
    type="button"
    class="icon-button selection-bar__close"
    aria-label={t.selection.clear}
    title={t.selection.clear}
    onclick={() => selection.clear()}
  >
    <Icon name="close" size={18}/>
  </button>
</div>

<style>
  .selection-bar {
    position: fixed;
    /* Above the shelves pinned to the bottom (VirtualShelves sets their height) */
    bottom: calc(16px + var(--shelves-height, 0px));
    left: 50%;
    z-index: 900;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px;
    /* With left: 50% the default width is only half the window; size it by content instead */
    width: max-content;
    max-width: calc(100vw - 32px);
    padding: 8px 8px 8px 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-raised);
    transform: translateX(-50%);
  }

  .selection-bar__count {
    margin-right: 4px;
    font-weight: 600;
    white-space: nowrap;
  }

  .selection-bar .button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .selection-bar__close {
    width: 34px;
    height: 34px;
    box-shadow: none;
  }
</style>
