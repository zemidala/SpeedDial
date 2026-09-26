<script lang="ts" module>
  export interface SelectOption {
    value: string;
    label: string;
  }
</script>

<script lang="ts">
  import SettingRow from './SettingRow.svelte';

  let {label, hint, value, options, onchange}: {
    label: string;
    hint?: string;
    value: string | number;
    options: SelectOption[];
    onchange: (value: string) => void;
  } = $props();
</script>

<SettingRow {label} {hint}>
  {#snippet children(id)}
    <!-- The list is driven only by value: the previous choice is restored at once, the new one appears together
         with the state change (the handler may refuse, e.g. if a permission wasn't granted) -->
    <select
      {id}
      class="input"
      value={String(value)}
      onchange={(event) => {
        const next = event.currentTarget.value;
        event.currentTarget.value = String(value);
        onchange(next);
      }}
    >
      {#each options as option (option.value)}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  {/snippet}
</SettingRow>
