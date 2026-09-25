<script lang="ts">
  import {MediaQuery} from 'svelte/reactivity';
  import {icons} from '../../lib/icons.svelte';
  import {COLUMNS_OPTIONS, DEFAULT_SETTINGS, settings, THEME_COLORS, type Theme} from '../../lib/settings.svelte';
  import Icon from './Icon.svelte';

  let open = $state(false);
  let root: HTMLElement;

  const themes: Array<{value: Theme; label: string}> = [
    {value: 'auto', label: 'Системная'},
    {value: 'light', label: 'Светлая'},
    {value: 'dark', label: 'Тёмная'},
  ];

  const colorFields = [
    {key: 'tileColor', label: 'Цвет плитки'},
    {key: 'folderColor', label: 'Цвет папки'},
  ] as const;

  // Для палитры нужен конкретный цвет, даже когда выбран «по теме»
  const systemDark = new MediaQuery('(prefers-color-scheme: dark)');
  const themeColors = $derived.by(() => {
    const {theme} = settings.current;
    const dark = theme === 'auto' ? systemDark.current : theme === 'dark';
    return dark ? THEME_COLORS.dark : THEME_COLORS.light;
  });

  // Изменения применяются и сохраняются сразу; панель закрывается кликом мимо или по Esc
  function onWindowClick(event: MouseEvent) {
    if (open && !root.contains(event.target as Node)) open = false;
  }

  function onWindowKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') open = false;
  }

  async function onSiteIconsChange(event: Event & {currentTarget: HTMLInputElement}) {
    const checkbox = event.currentTarget;
    // Если в доступе к сайтам отказали, галочка возвращается обратно
    checkbox.checked = await icons.setSiteIconsEnabled(checkbox.checked);
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeydown}/>

<div class="settings" bind:this={root}>
  <button
    type="button"
    class="icon-button"
    aria-label="Настройки"
    aria-expanded={open}
    aria-controls="settings-panel"
    onclick={() => (open = !open)}
  >
    <Icon name={open ? 'close' : 'settings'}/>
  </button>

  {#if open}
    <section id="settings-panel" class="settings-panel" aria-label="Настройки">
      <h2>Настройки</h2>

      <fieldset>
        <legend>Тема</legend>
        <div class="segmented">
          {#each themes as {value, label} (value)}
            <label>
              <input
                type="radio"
                name="theme"
                {value}
                checked={settings.current.theme === value}
                onchange={() => settings.update({theme: value})}
              >
              <span>{label}</span>
            </label>
          {/each}
        </div>
      </fieldset>

      <label for="columns">Количество колонок</label>
      <select
        id="columns"
        class="input"
        value={settings.current.columns}
        onchange={(event) => settings.update({columns: Number(event.currentTarget.value)})}
      >
        {#each COLUMNS_OPTIONS as value (value)}
          <option {value}>{value}</option>
        {/each}
      </select>

      {#each colorFields as {key, label} (key)}
        <label for={key}>{label}</label>
        <div class="color-row">
          <input
            id={key}
            type="color"
            value={settings.current[key] || themeColors[key]}
            oninput={(event) => settings.update({[key]: event.currentTarget.value})}
          >
          <span class="color-value">{settings.current[key] || 'по теме'}</span>
          <button
            type="button"
            class="button"
            disabled={!settings.current[key]}
            onclick={() => settings.update({[key]: DEFAULT_SETTINGS[key]})}
          >Сбросить</button>
        </div>
      {/each}

      <label for="font-family">Шрифт</label>
      <input
        id="font-family"
        class="input"
        type="text"
        placeholder={DEFAULT_SETTINGS.fontFamily}
        value={settings.current.fontFamily}
        oninput={(event) => settings.update({fontFamily: event.currentTarget.value})}
      >

      <fieldset>
        <legend>Иконки</legend>
        <label class="checkbox">
          <input
            type="checkbox"
            checked={settings.current.iconTint}
            onchange={(event) => settings.update({iconTint: event.currentTarget.checked})}
          >
          <span>Подкрашивать плитку цветом иконки</span>
        </label>
        <label class="checkbox">
          <input type="checkbox" checked={icons.siteIconsEnabled} onchange={onSiteIconsChange}>
          <span>
            Иконки высокого качества
            <small>Загружаются прямо с сайтов закладок. Понадобится разрешение на доступ к сайтам.</small>
          </span>
        </label>
      </fieldset>
    </section>
  {/if}
</div>

<style>
  .settings {
    position: relative;
    z-index: 900;
  }

  .settings-panel {
    position: absolute;
    top: 48px;
    right: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 320px;
    max-height: calc(100vh - 90px);
    padding: 20px;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-raised);
  }

  label,
  legend {
    margin-top: 8px;
    color: var(--text-muted);
    font-size: 14px;
  }

  fieldset {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    border: none;
  }

  legend {
    margin-bottom: 6px;
    padding: 0;
  }

  /* Переключатель темы: три кнопки-сегмента */
  .segmented {
    display: flex;
    padding: 3px;
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .segmented label {
    flex: 1;
    margin: 0;
  }

  .segmented input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .segmented span {
    display: block;
    padding: 6px 4px;
    border-radius: 6px;
    color: var(--text-muted);
    font-size: 13px;
    text-align: center;
    cursor: pointer;
  }

  .segmented input:checked + span {
    background: var(--accent);
    color: var(--accent-text);
  }

  .segmented input:focus-visible + span {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .color-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .color-row input {
    width: 40px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: none;
    cursor: pointer;
  }

  .color-value {
    flex: 1;
    color: var(--text-muted);
    font-family: ui-monospace, monospace;
    font-size: 13px;
  }

  .checkbox {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 0;
    color: var(--text);
    cursor: pointer;
  }

  .checkbox input {
    margin: 3px 0 0;
  }

  small {
    display: block;
    margin-top: 2px;
    color: var(--text-muted);
    font-size: 12px;
  }
</style>
