<script lang="ts">
  import {onMount} from 'svelte';
  import {canListSystemFonts, firstFamily, fontStack, installedFonts, SYSTEM_FONT, systemFontFamilies} from '../../../lib/fonts';
  import {t} from '../../../lib/i18n/index.svelte';
  import {settings} from '../../../lib/settings/store.svelte';
  import SettingRow from './SettingRow.svelte';

  // Выбор шрифта из установленных; под названием — пример текста этим шрифтом, как в настройках Edge
  const CUSTOM = '__custom__';

  let fonts = $state.raw<string[]>([]);
  let status = $state('');
  /** «Другой…» выбран вручную — поле ввода видно, даже пока оно пустое */
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

<SettingRow label={t.view.font}>
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

<style>
  /* Пример и кнопка — в колонке элементов управления, под списком шрифтов */
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
