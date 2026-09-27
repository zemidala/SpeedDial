<script lang="ts">
  import {onMount} from 'svelte';
  import {canListSystemFonts, firstFamily, fontStack, installedFonts, SYSTEM_FONT, systemFontFamilies} from '../../../lib/fonts';
  import {t} from '../../../lib/i18n/index.svelte';
  import {settings} from '../../../lib/settings/store.svelte';
  import SettingRow from './SettingRow.svelte';

  // Font picker with installed fonts; below it a sample line set in the chosen font, as in Edge's font settings.
  // Everything is wrapped in one block so the group's row dividers don't separate the sample from the picker
  const CUSTOM = '__custom__';

  let fonts = $state.raw<string[]>([]);
  let status = $state('');
  /** "Other…" was picked explicitly — keep the input visible even while it's empty */
  let customChosen = $state(false);

  onMount(() => {
    fonts = installedFonts();
  });

  const current = $derived(firstFamily(settings.current.fontFamily));
  const known = $derived(current === SYSTEM_FONT || fonts.includes(current));
  const selected = $derived(customChosen || (fonts.length > 0 && !known) ? CUSTOM : current);

  function choose(value: string) {
    customChosen = value === CUSTOM;
    if (!customChosen) settings.update({fontFamily: fontStack(value)});
  }

  async function loadSystemFonts() {
    status = '';
    const all = await systemFontFamilies();
    if (all) fonts = [...new Set([...fonts, ...all])].sort((a, b) => a.localeCompare(b));
    else status = t.view.allFontsDenied;
  }
</script>

<div class="font-row">
  <SettingRow label={t.view.font} setting="fontFamily">
    {#snippet children(id)}
      <select {id} class="input" value={selected} onchange={(event) => choose(event.currentTarget.value)}>
        <option value={SYSTEM_FONT}>{t.view.fontSystem}</option>
        {#each fonts as font (font)}
          <option value={font} style:font-family={fontStack(font)}>{font}</option>
        {/each}
        <option value={CUSTOM}>{t.view.fontCustom}</option>
      </select>
    {/snippet}
  </SettingRow>
  <p class="font-row__sample" style:font-family={settings.current.fontFamily}>{t.view.fontSample}</p>

  {#if selected === CUSTOM}
    <SettingRow label={t.view.fontCustomName}>
      {#snippet children(id)}
        <input
          {id}
          class="input"
          type="text"
          placeholder="Segoe UI, system-ui, sans-serif"
          value={settings.current.fontFamily}
          oninput={(event) => settings.update({fontFamily: event.currentTarget.value})}
        >
      {/snippet}
    </SettingRow>
  {/if}

  {#if canListSystemFonts()}
    <div class="font-row__actions">
      <button type="button" class="button" onclick={loadSystemFonts}>{t.view.allFonts}</button>
      {#if status}
        <span class="font-row__status" role="status">{status}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* The sample and the button sit in the controls column, under the font list */
  .font-row__sample,
  .font-row__actions {
    margin-left: calc(50% + 12px);
  }

  .font-row__sample {
    margin-top: -4px;
    margin-bottom: 6px;
    color: var(--text-muted);
    font-size: 1rem;
    line-height: 1.4;
  }

  .font-row__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    padding-bottom: 8px;
  }

  .font-row__status {
    color: var(--text-muted);
    font-size: 0.8125rem;
  }
</style>
