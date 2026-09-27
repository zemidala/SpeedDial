<script lang="ts">
  import type {SettingKey} from '../../../lib/settings/changes.svelte';
  import SettingRow from './SettingRow.svelte';
  import ToolChoice, {type ToolOption} from './ToolChoice.svelte';

  // A setting chosen with icon buttons side by side, like the alignment buttons in Word
  let {label, hint, value, options, setting, onchange}: {
    label: string;
    hint?: string;
    value: string;
    options: ToolOption[];
    onchange: (value: string) => void;
    /** The setting these buttons change — for marking the row as changed */
    setting?: SettingKey;
  } = $props();
</script>

<SettingRow {label} {hint} {setting}>
  <div class="toolbar">
    <ToolChoice {label} {value} {options} {onchange}/>
  </div>
</SettingRow>
