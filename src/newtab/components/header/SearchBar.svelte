<script lang="ts">
  import {onMount} from 'svelte';
  import {SEARCH_ENGINE_NAMES} from '../../../lib/search';
  import {search} from '../../../lib/search.svelte';
  import {settings} from '../../../lib/settings/store.svelte';
  import Icon from '../ui/Icon.svelte';

  let input: HTMLInputElement;

  const engineName = $derived(SEARCH_ENGINE_NAMES[settings.current.searchEngine]);

  onMount(() => {
    if (settings.current.autofocusSearch) input.focus();
  });

  // Ввод ищет по закладкам, Enter — в интернете, Esc — очищает
  function onsubmit(event: SubmitEvent) {
    event.preventDefault();
    search.searchWeb();
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && search.active) {
      event.stopPropagation();
      search.clear();
    }
  }
</script>

<form class="search-bar" role="search" {onsubmit}>
  <Icon name="search" size={18} class="search-bar__icon"/>
  <input
    bind:this={input}
    class="search-bar__input"
    type="search"
    aria-label="Поиск"
    placeholder="Поиск в закладках, Enter — в {engineName}"
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
    padding: 11px 0;
    border: none;
    outline: none;
    background: none;
    color: var(--text);
  }
</style>
