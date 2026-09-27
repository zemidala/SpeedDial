<script lang="ts">
  import {bookmarks, enabledVirtualFolders} from '../../lib/bookmarks.svelte';
  import {ROOT_FOLDER_ID} from '../../lib/constants';
  import {t} from '../../lib/i18n/index.svelte';
  import {icons} from '../../lib/icons.svelte';
  import {permissions} from '../../lib/permissions.svelte';
  import {search} from '../../lib/search.svelte';
  import {settings} from '../../lib/settings/store.svelte';
  import {shelves} from '../../lib/shelves.svelte';
  import {ALL_VIRTUAL_FOLDER_PERMISSIONS} from '../../lib/virtualFolders';
  import SiteIcon from './grid/SiteIcon.svelte';
  import Icon from './ui/Icon.svelte';

  // A bar at the bottom of the start pages (it stays in place while the tiles scroll): the most visited sites
  // and recently closed tabs, each in a horizontally scrolling row. While they're off, the bar holds a small invitation instead —
  // a hidden setting would go unnoticed
  const startPage = $derived(
    bookmarks.loaded && !search.active && !bookmarks.virtual
      && [ROOT_FOLDER_ID, bookmarks.barId, bookmarks.startFolder()].includes(bookmarks.folderId),
  );
  const folders = $derived(enabledVirtualFolders());
  const rows = $derived(folders
    .map((folder) => ({...folder, items: shelves.lists[folder.id] ?? []}))
    .filter((row) => row.items.length > 0));
  const showInvite = $derived(startPage && folders.length === 0 && !settings.current.shelfInviteDismissed);
  const visible = $derived(startPage && (rows.length > 0 || showInvite));

  // Bars fixed to the bottom (selection, notifications) are lifted above the shelves
  let height = $state(0);
  $effect(() => {
    document.documentElement.style.setProperty('--shelves-height', `${visible ? height : 0}px`);
  });

  async function enable() {
    // Both permissions in one prompt, requested right in the click handler
    if (!await permissions.request(ALL_VIRTUAL_FOLDER_PERMISSIONS)) return;
    settings.update({showMostVisited: true, showRecentlyClosed: true});
  }

  /** A vertical wheel scrolls the row sideways — a mouse without a horizontal wheel can still reach every item */
  function onwheel(event: WheelEvent) {
    const row = event.currentTarget as HTMLElement;
    if (event.deltaX !== 0 || event.deltaY === 0 || row.scrollWidth <= row.clientWidth) return;
    const atStart = row.scrollLeft <= 0 && event.deltaY < 0;
    const atEnd = row.scrollLeft + row.clientWidth >= row.scrollWidth - 1 && event.deltaY > 0;
    if (atStart || atEnd) return;
    event.preventDefault();
    row.scrollLeft += event.deltaY;
  }
</script>

{#if visible}
  <div class="shelves" bind:clientHeight={height}>
    {#each rows as row (row.id)}
      <section class="shelf" aria-label={row.title}>
        <h2 class="shelf__title">{row.title}</h2>
        <ul class="shelf__items" {onwheel}>
          {#each row.items as item (item.id)}
            <li>
              <a
                class="shelf__item"
                href={item.url}
                title={item.title === item.url ? item.url : `${item.title}\n${item.url}`}
                draggable="false"
                data-bookmark-id={item.id}
                target={settings.current.openInNewTab ? '_blank' : undefined}
              >
                <SiteIcon entry={icons.get(item.url!)} appearance="mini"/>
                <span class="shelf__name">{item.title}</span>
              </a>
            </li>
          {/each}
        </ul>
        <!-- Opens the whole list as a folder; a compact version of the regular button -->
        <button type="button" class="button shelf__all" onclick={() => bookmarks.navigate(row.id)}>
          {t.virtual.showAll}
          <span class="shelf__count">{row.items.length}</span>
          <Icon name="forward" size={14}/>
        </button>
      </section>
    {/each}

    {#if showInvite}
      <section class="shelf-invite" aria-label={t.virtual.inviteTitle}>
        <p class="shelf-invite__text"><strong>{t.virtual.inviteTitle}.</strong> {t.virtual.inviteText}</p>
        <div class="shelf-invite__actions">
          <button type="button" class="button button--primary" onclick={enable}>{t.virtual.inviteEnable}</button>
          <button type="button" class="button" onclick={() => settings.update({shelfInviteDismissed: true})}>
            {t.virtual.inviteLater}
          </button>
        </div>
      </section>
    {/if}
  </div>
{/if}

<style>
  /* The bottom of the app layout: stays in place while the tiles above it scroll */
  .shelves {
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  .shelf {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
  }

  .shelf__title {
    overflow: hidden;
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* One row that scrolls sideways */
  .shelf__items {
    display: flex;
    gap: 8px;
    margin: 0;
    padding: 2px 2px 6px;
    overflow-x: auto;
    list-style: none;
    scroll-snap-type: x proximity;
    /* The right edge fades out — a hint that the row scrolls */
    mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent);
    scrollbar-width: thin;
    scrollbar-color: color-mix(in oklab, var(--text) 30%, transparent) transparent;
  }

  /* Short cards: long names end with an ellipsis; the full name and URL are in the tooltip */
  .shelf__items li {
    flex: 0 0 150px;
    /* Without it the item grows to fit the whole unwrapped name */
    min-width: 0;
    scroll-snap-align: start;
  }

  .shelf__item {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-small);
    background: var(--field-bg);
    color: var(--text);
    font-size: 0.8125rem;
    text-decoration: none;
    transition: background-color 0.15s;
  }

  .shelf__item:hover {
    background: var(--field-hover);
  }

  .shelf__item:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .shelf__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .shelf__all {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px 4px 12px;
    font-size: 0.8125rem;
  }

  .shelf__count {
    min-width: 20px;
    padding: 0 6px;
    border-radius: 10px;
    background: color-mix(in oklab, var(--accent) 18%, transparent);
    color: var(--accent);
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 18px;
    text-align: center;
  }

  /* Narrow window: the title goes above the row */
  @media (max-width: 640px) {
    .shelf {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .shelf__items {
      grid-column: 1 / -1;
      grid-row: 2;
    }
  }

  .shelf-invite {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .shelf-invite__text {
    flex: 1 1 320px;
    margin: 0;
    color: var(--text-muted);
    line-height: 1.45;
  }

  .shelf-invite__text strong {
    color: var(--text);
  }

  .shelf-invite__actions {
    display: flex;
    gap: 8px;
  }
</style>
