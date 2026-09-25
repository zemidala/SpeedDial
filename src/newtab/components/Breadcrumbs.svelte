<script lang="ts">
  import {bookmarks, folderHref} from '../../lib/bookmarks.svelte';
  import {ROOT_FOLDER_ID} from '../../lib/constants';
</script>

<nav class="breadcrumbs" aria-label="Путь к папке">
  <a
    href={folderHref(ROOT_FOLDER_ID)}
    aria-current={bookmarks.path.length === 0 ? 'page' : undefined}
  >Главная</a>
  {#each bookmarks.path as crumb, i (crumb.id)}
    <span class="separator" aria-hidden="true">›</span>
    <a
      href={folderHref(crumb.id)}
      aria-current={i === bookmarks.path.length - 1 ? 'page' : undefined}
    >{crumb.title}</a>
  {/each}
</nav>

<style>
  .breadcrumbs {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  a {
    color: var(--accent);
    font-weight: 500;
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }

  a[aria-current='page'] {
    color: var(--text);
  }

  .separator {
    color: var(--text-muted);
  }
</style>
