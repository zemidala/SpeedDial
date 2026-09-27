<script lang="ts">
  import type {Snippet} from 'svelte';
  import {type SettingKey, settingsChanges} from '../../../lib/settings/changes.svelte';

  // A settings row: a label with a hint on the left, the control on the right.
  // children receives an id — pass it to the input so the label is linked to it.
  // Buttons don't get the id: the label would replace their name
  let {label, hint, stacked = false, setting, children}: {
    label: string;
    hint?: string;
    /** The setting(s) this row changes — the row is marked once they differ from when the dialog opened */
    setting?: SettingKey | SettingKey[];
    /** The control below the label at full width (for multi-line fields) */
    stacked?: boolean;
    children: Snippet<[string]>;
  } = $props();

  const id = $props.id();
</script>

<div class="setting-row" class:setting-row--stacked={stacked} class:setting-row--changed={settingsChanges.changed(setting)}>
  <div class="setting-row__text">
    <label class="setting-row__label" for={id}>{label}</label>
    {#if hint}
      <p class="setting-row__hint">{hint}</p>
    {/if}
  </div>
  <div class="setting-row__control">
    {@render children(id)}
  </div>
</div>

<style>
  .setting-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: center;
    gap: 8px 24px;
    padding: 10px 0;
  }

  /* Changed since the dialog opened: an accent bar at the edge — easy to find when going over the changes */
  .setting-row--changed {
    margin: 0 -12px;
    padding-inline: 12px;
    border-radius: var(--radius-small);
    background: color-mix(in oklab, var(--accent) 10%, transparent);
    box-shadow: inset 3px 0 0 var(--accent);
  }

  .setting-row--stacked {
    grid-template-columns: minmax(0, 1fr);
  }

  .setting-row__text {
    text-align: right;
  }

  .setting-row--stacked .setting-row__text {
    text-align: left;
  }

  .setting-row__label {
    font-weight: 600;
  }

  .setting-row__hint {
    margin: 4px 0 0;
    color: var(--text-muted);
    font-size: 0.75rem;
    line-height: 1.4;
    white-space: pre-line;
  }

  .setting-row__control {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
</style>
