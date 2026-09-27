<script lang="ts">
  import {onMount} from 'svelte';
  import {t} from '../../../lib/i18n/index.svelte';
  import {searchEngineName} from '../../../lib/search';
  import {search} from '../../../lib/search.svelte';
  import {settings} from '../../../lib/settings/store.svelte';
  import {modals} from '../../../lib/ui.svelte';
  import Icon from '../ui/Icon.svelte';

  let input: HTMLInputElement;

  const engineName = $derived(searchEngineName(settings.current.searchEngine));

  onMount(() => {
    if (settings.current.autofocusSearch) input.focus();
  });

  // Typing searches bookmarks, Enter searches the web, Esc clears
  function onsubmit(event: SubmitEvent) {
    event.preventDefault();
    search.searchWeb();
  }

  // Esc — clear the search, arrow down — to the first tile: find, move with arrows, open with Enter
  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && search.active) {
      event.stopPropagation();
      search.clear();
    } else if (event.key === 'ArrowDown') {
      const first = document.querySelector<HTMLElement>('.bookmark-grid .tile');
      if (!first) return;
      event.preventDefault();
      first.focus();
    }
  }

  // "/" anywhere on the page except input fields moves focus to the search
  function onWindowKeydown(event: KeyboardEvent) {
    if (event.key !== '/' || event.ctrlKey || event.altKey || event.metaKey || modals.depth > 0) return;
    if ((event.target as Element).closest('input, textarea, select, [contenteditable]')) return;
    event.preventDefault();
    input.focus();
    input.select();
  }
</script>

<svelte:window onkeydown={onWindowKeydown}/>

<form class="search-bar" role="search" {onsubmit}>
  <Icon name="search" size={18} class="search-bar__icon"/>
  <input
    bind:this={input}
    class="search-bar__input"
    type="search"
    aria-label={t.header.search}
    placeholder={t.header.searchPlaceholder(engineName)}
    value={search.query}
    oninput={(event) => search.setQuery(event.currentTarget.value)}
    {onkeydown}
  >
</form>

<style>
  .search-bar {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 10px;
    min-width: 0;
    /* A fixed height: the same in every browser, and the same as the folder list next to it */
    height: 44px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
    color: var(--text-muted);
  }

  .search-bar:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .search-bar__input {
    flex: 1;
    min-width: 0;
    padding: 0;
    height: 100%;
    border: none;
    outline: none;
    background: none;
    color: var(--text);
  }
</style>
