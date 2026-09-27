<script lang="ts">
  import {onMount} from 'svelte';
  import {brokenLinkStorage} from '../lib/brokenLinks';
  import {currentLanguage, t} from '../lib/i18n/index.svelte';
  import {openSettingsInNewTab} from '../lib/settingsRequest';
  import {type BookmarkStats, bookmarkStats} from '../lib/stats';
  import {isDevelopmentInstall} from '../lib/updates';
  import Icon from '../newtab/components/ui/Icon.svelte';
  import UpdateCheck from '../newtab/components/ui/UpdateCheck.svelte';

  const version = chrome.runtime.getManifest().version;
  let stats = $state.raw<BookmarkStats | null>(null);
  let development = $state<boolean | null>(null);

  onMount(() => {
    Promise.all([chrome.bookmarks.getTree(), brokenLinkStorage.load()])
      .then(([[root], broken]) => (stats = bookmarkStats(root, new Set(Object.keys(broken)))))
      .catch((error) => console.error('Failed to count bookmarks', error));
    isDevelopmentInstall().then((value) => (development = value)).catch(() => (development = false));
  });

  $effect(() => {
    document.documentElement.lang = currentLanguage();
  });

  const format = (value: number) => value.toLocaleString(currentLanguage());

  async function open() {
    await chrome.tabs.create({});
    window.close();
  }

  async function openSettings() {
    await openSettingsInNewTab('view');
    window.close();
  }
</script>

<main class="popup">
  <header class="popup__head">
    <img src="/icons/icon48.png" alt="" width="40" height="40">
    <div>
      <h1 class="popup__name">SpeedDial</h1>
      <p class="popup__version">{t.about.versionLine(version)}</p>
    </div>
  </header>

  <dl class="popup__stats">
    <div class="popup__stat">
      <dt>{t.popup.sites}</dt>
      <dd>{stats ? format(stats.sites) : '…'}</dd>
    </div>
    <div class="popup__stat">
      <dt>{t.popup.folders}</dt>
      <dd>{stats ? format(stats.folders) : '…'}</dd>
    </div>
    <div class={{'popup__stat': true, 'popup__stat--broken': Boolean(stats?.broken)}}>
      <dt>{t.popup.broken}</dt>
      <dd>{stats ? format(stats.broken) : '…'}</dd>
    </div>
  </dl>

  {#if development !== null}
    <section class="popup__updates" aria-label={t.updates.title}>
      <UpdateCheck {development}/>
    </section>
  {/if}

  <div class="popup__actions">
    <button type="button" class="button button--primary" onclick={open}>{t.popup.open}</button>
    <button type="button" class="button popup__settings" onclick={openSettings}>
      <Icon name="settings"/>
      {t.common.settings}
    </button>
  </div>
</main>

<style>
  :global(body) {
    width: 340px;
    margin: 0;
    background: var(--surface);
  }

  .popup {
    display: grid;
    gap: 14px;
    padding: 16px;
  }

  .popup__head {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .popup__name {
    margin: 0;
    font-size: 1.125rem;
  }

  .popup__version {
    margin: 2px 0 0;
    color: var(--text-muted);
    font-size: 0.8125rem;
  }

  .popup__stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin: 0;
  }

  .popup__stat {
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-small);
  }

  .popup__stat dt {
    overflow: hidden;
    color: var(--text-muted);
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 0.75rem;
  }

  .popup__stat dd {
    margin: 2px 0 0;
    font-size: 1.25rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .popup__stat--broken dd {
    color: var(--danger);
  }

  .popup__updates {
    padding-top: 12px;
    border-top: 1px solid var(--border);
    font-size: 0.8125rem;
  }

  .popup__actions {
    display: flex;
    gap: 8px;
  }

  .popup__actions .button {
    flex: 1;
    white-space: nowrap;
  }

  .popup__settings {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .popup__settings :global(svg) {
    width: 16px;
    height: 16px;
  }
</style>
