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
    <!-- Список управляется только через value: сразу возвращаем прежний выбор, новый появится вместе
         с изменением состояния (обработчик может отказаться, например, если не выдали разрешение) -->
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
