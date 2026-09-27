<script lang="ts">
  import {onMount} from 'svelte';
  import {currentLanguage, t} from '../../../lib/i18n/index.svelte';
  import {permissions} from '../../../lib/permissions.svelte';
  import {searchEngineName} from '../../../lib/search';
  import {search} from '../../../lib/search.svelte';
  import {searchHistory} from '../../../lib/searchHistory.svelte';
  import {fetchSuggestions} from '../../../lib/searchSuggest';
  import {settings} from '../../../lib/settings/store.svelte';
  import {modals} from '../../../lib/ui.svelte';
  import Icon from '../ui/Icon.svelte';

  // Typing searches bookmarks (the tiles below), Enter searches the web, Esc clears.
  // Under the box: recent searches and the search engine's suggestions, like in the browser's address bar
  const SUGGEST_DELAY = 150;
  const RECENT_EMPTY = 8; // Recent searches when nothing is typed yet
  const RECENT_MATCHING = 3; // …and those matching what's typed

  interface Item {
    text: string;
    recent: boolean;
  }

  let input: HTMLInputElement;
  const listId = $props.id();

  const engineName = $derived(searchEngineName(settings.current.searchEngine));

  let focused = $state(false);
  /** The list is wanted: the user typed or clicked; Esc and a choice close it. Autofocus alone doesn't open it */
  let open = $state(false);
  let active = $state(-1);
  let suggestions = $state.raw<string[]>([]);

  const suggestEnabled = $derived(
    settings.current.searchSuggestions && permissions.suggest && settings.current.searchEngine !== 'custom',
  );

  // The engine's suggestions for what's typed — a moment after typing stops; a newer query cancels the older one
  $effect(() => {
    const query = search.query.trim();
    const engine = settings.current.searchEngine;
    if (!suggestEnabled || !query) {
      suggestions = [];
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchSuggestions(engine, query, currentLanguage(), controller.signal)
        .then((found) => {
          if (!controller.signal.aborted) suggestions = found;
        });
    }, SUGGEST_DELAY);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  });

  const items = $derived.by((): Item[] => {
    const query = search.query.trim().toLowerCase();
    const recent = query
      ? searchHistory.entries
        .filter((entry) => entry.toLowerCase().includes(query) && entry.toLowerCase() !== query)
        .slice(0, RECENT_MATCHING)
      : searchHistory.entries.slice(0, RECENT_EMPTY);
    const shown = new Set(recent.map((entry) => entry.toLowerCase()));
    return [
      ...recent.map((text) => ({text, recent: true})),
      ...suggestions.filter((text) => !shown.has(text.toLowerCase())).map((text) => ({text, recent: false})),
    ];
  });

  const showList = $derived(focused && open && items.length > 0);

  // A new list — nothing chosen in it yet
  $effect(() => {
    void items;
    active = -1;
  });

  onMount(() => {
    if (settings.current.autofocusSearch) input.focus();
  });

  function close() {
    open = false;
    active = -1;
  }

  function choose(text: string) {
    close();
    search.searchWeb(text);
  }

  function onsubmit(event: SubmitEvent) {
    event.preventDefault();
    if (showList && active >= 0) choose(items[active].text);
    else search.searchWeb();
  }

  function toTiles(event: KeyboardEvent) {
    const first = document.querySelector<HTMLElement>('.bookmark-grid .tile');
    if (!first) return;
    event.preventDefault();
    close();
    first.focus();
  }

  // Arrows move through the list, and from its end (or with no list) — down to the tiles: find, move, open with Enter.
  // Esc closes the list, then clears the search. Shift+Delete removes a recent search, as in the browser
  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      // A search field clears itself on Esc — here the first Esc only closes the list
      if (showList) {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (search.active) {
        event.preventDefault();
        event.stopPropagation();
        search.clear();
      }
    } else if (event.key === 'ArrowDown') {
      if (showList && active < items.length - 1) {
        event.preventDefault();
        active++;
      } else {
        toTiles(event);
      }
    } else if (event.key === 'ArrowUp') {
      if (showList && active >= 0) {
        event.preventDefault();
        active--;
      }
    } else if (event.key === 'Delete' && event.shiftKey && showList && items[active]?.recent) {
      event.preventDefault();
      searchHistory.remove(items[active].text);
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

  /** The option under the pointer: -1 outside the options */
  function optionAt(event: MouseEvent): number {
    const option = (event.target as Element).closest<HTMLElement>('[data-index]');
    return option ? Number(option.dataset.index) : -1;
  }

  function onListClick(event: MouseEvent) {
    const index = optionAt(event);
    if (index >= 0) choose(items[index].text);
  }

  function onListHover(event: MouseEvent) {
    const index = optionAt(event);
    if (index >= 0) active = index;
  }

  /** The typed start of a suggestion as is, the rest in bold — as in the browser's address bar; otherwise all plain */
  function split(text: string): [string, string] {
    const query = search.query.trim();
    return query && text.toLowerCase().startsWith(query.toLowerCase())
      ? [text.slice(0, query.length), text.slice(query.length)]
      : [text, ''];
  }
</script>

<svelte:window onkeydown={onWindowKeydown}/>

<form class="search-bar" class:search-bar--open={showList} role="search" {onsubmit}>
  <Icon name="search" size={18} class="search-bar__icon"/>
  <input
    bind:this={input}
    class="search-bar__input"
    type="search"
    role="combobox"
    aria-label={t.header.search}
    aria-autocomplete="list"
    aria-expanded={showList}
    aria-controls={listId}
    aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
    autocomplete="off"
    placeholder={t.header.searchPlaceholder(engineName)}
    value={search.query}
    oninput={(event) => {
      open = true;
      search.setQuery(event.currentTarget.value);
    }}
    onclick={() => (open = true)}
    onfocus={() => (focused = true)}
    onblur={() => {
      focused = false;
      active = -1;
    }}
    {onkeydown}
  >

  {#if showList}
    <!-- Clicks in the list keep the focus in the box: the list stays open, the keyboard keeps working.
         The keyboard is handled by the box itself (aria-activedescendant), so the list needs no key handler -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <ul
      id={listId}
      class="search-suggest"
      role="listbox"
      aria-label={t.header.suggestions}
      onmousedown={(event) => event.preventDefault()}
      onclick={onListClick}
      onmousemove={onListHover}
    >
      {#each items as item, i (item.text)}
        {@const [typed, rest] = split(item.text)}
        <!-- Options are chosen with the keyboard from the search box (aria-activedescendant), clicks — in the list -->
        <li
          id="{listId}-{i}"
          data-index={i}
          class="search-suggest__item"
          class:search-suggest__item--active={i === active}
          role="option"
          aria-selected={i === active}
        >
          <Icon
            name={item.recent ? 'history' : 'search'}
            size={16}
            class="search-suggest__icon"
          />
          <span class="search-suggest__text" title={item.recent ? t.header.recentSearch : undefined}>
            {typed}<b>{rest}</b>
          </span>
          {#if item.recent}
            <button
              type="button"
              class="search-suggest__remove"
              tabindex="-1"
              aria-label={t.header.removeRecent(item.text)}
              title={t.header.removeRecent(item.text)}
              onclick={(event) => {
                event.stopPropagation();
                searchHistory.remove(item.text);
              }}
            >
              <Icon name="close" size={14}/>
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</form>

<style>
  .search-bar {
    position: relative;
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

  /* ===== The list under the box ===== */
  .search-suggest {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    left: 0;
    z-index: 950;
    margin: 0;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-raised);
    list-style: none;
  }

  .search-suggest__item {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 36px;
    padding: 0 8px;
    border-radius: var(--radius-small);
    color: var(--text);
    cursor: pointer;
  }

  .search-suggest__item--active {
    background: var(--surface-hover);
  }

  .search-suggest__item :global(.search-suggest__icon) {
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .search-suggest__text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .search-suggest__text b {
    font-weight: 600;
  }

  /* Remove a recent search: shown on the chosen row */
  .search-suggest__remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    visibility: hidden;
  }

  .search-suggest__item--active .search-suggest__remove {
    visibility: visible;
  }

  .search-suggest__remove:hover {
    background: color-mix(in oklab, var(--text) 10%, transparent);
    color: var(--text);
  }
</style>
