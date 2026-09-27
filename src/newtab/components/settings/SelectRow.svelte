<script lang="ts" module>
  export interface SelectOption {
    value: string;
    label: string;
  }
</script>

<script lang="ts">
  import SettingRow from './SettingRow.svelte';

  let {label, hint, value, options, placeholder, onchange}: {
    label: string;
    hint?: string;
    value: string | number;
    options: SelectOption[];
    /** Shown, and the field marked invalid, when value isn't among the options — e.g. the chosen folder is gone */
    placeholder?: string;
    onchange: (value: string) => void;
  } = $props();

  const missing = $derived(placeholder !== undefined && !options.some((option) => option.value === String(value)));
</script>

<SettingRow {label} {hint}>
  {#snippet children(id)}
    <!-- The list is driven only by value: the previous choice is restored at once, the new one appears together
         with the state change (the handler may refuse, e.g. if a permission wasn't granted) -->
    <select
      {id}
      class="input"
      aria-invalid={missing || undefined}
      value={missing ? '' : String(value)}
      onchange={(event) => {
        const next = event.currentTarget.value;
        event.currentTarget.value = missing ? '' : String(value);
        onchange(next);
      }}
    >
      {#if missing}
        <option value="" disabled>{placeholder}</option>
      {/if}
      {#each options as option (option.value)}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  {/snippet}
</SettingRow>
