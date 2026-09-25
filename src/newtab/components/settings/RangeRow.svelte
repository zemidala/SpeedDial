<script lang="ts">
  import {RANGES, type RangeSettingKey} from '../../../lib/settings/schema';
  import {settings} from '../../../lib/settings/store.svelte';
  import SettingRow from './SettingRow.svelte';

  let {label, hint, key, unit = ''}: {label: string; hint?: string; key: RangeSettingKey; unit?: string} = $props();

  const range = $derived(RANGES[key]);
  const value = $derived(settings.current[key]);
</script>

<SettingRow {label} {hint}>
  {#snippet children(id)}
    <input
      {id}
      class="range"
      type="range"
      min={range.min}
      max={range.max}
      step={range.step}
      {value}
      oninput={(event) => settings.update({[key]: Number(event.currentTarget.value)})}
    >
    <output class="range-row__value" for={id}>{value}{unit}</output>
  {/snippet}
</SettingRow>

<style>
  .range-row__value {
    min-width: 48px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
</style>
