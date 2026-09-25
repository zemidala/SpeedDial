<script lang="ts">
  import {bookmarks} from '../../lib/bookmarks.svelte';
  import BookmarkTile from './BookmarkTile.svelte';
  import FolderTile from './FolderTile.svelte';
</script>

<section class="grid" aria-label="Закладки">
  {#each bookmarks.items as item (item.id)}
    {#if item.url}
      <BookmarkTile bookmark={item}/>
    {:else}
      <FolderTile folder={item} preview={bookmarks.previews[item.id] ?? []}/>
    {/if}
  {:else}
    <p class="empty">Здесь пока пусто. Нажмите правой кнопкой мыши, чтобы добавить закладку.</p>
  {/each}
</section>

<style>
  .grid {
    display: grid;
    /* Столько колонок, сколько задано в настройках, но на узком экране плитки не уже 120px */
    grid-template-columns: repeat(
      auto-fill,
      minmax(max(120px, (100% - (var(--columns) - 1) * var(--gap)) / var(--columns)), 1fr)
    );
    gap: var(--gap);
  }

  .empty {
    grid-column: 1 / -1;
    margin: 40px 0;
    color: var(--text-muted);
    text-align: center;
  }
</style>
