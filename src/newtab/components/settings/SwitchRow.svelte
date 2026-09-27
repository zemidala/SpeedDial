<script lang="ts">
  import type {SettingKey} from '../../../lib/settings/changes.svelte';
  import type {BooleanSettingKey} from '../../../lib/settings/schema';
  import {settings} from '../../../lib/settings/store.svelte';
  import Switch from '../ui/Switch.svelte';
  import SettingRow from './SettingRow.svelte';

  // A switch bound to setting key, or with its own checked/onchange
  let {label, hint, key, setting, checked, disabled = false, onchange}: {
    label: string;
    hint?: string;
    key?: BooleanSettingKey;
    /** The setting(s) a switch with its own checked/onchange changes — for marking the row as changed */
    setting?: SettingKey | SettingKey[];
    checked?: boolean;
    disabled?: boolean;
    onchange?: (checked: boolean) => void;
  } = $props();

  const value = $derived(checked ?? (key ? settings.current[key] : false));

  function change(next: boolean) {
    if (onchange) onchange(next);
    else if (key) settings.update({[key]: next});
  }
</script>

<SettingRow {label} {hint} setting={setting ?? key}>
  {#snippet children(id)}
    <Switch {id} checked={value} {disabled} onchange={change}/>
  {/snippet}
</SettingRow>
