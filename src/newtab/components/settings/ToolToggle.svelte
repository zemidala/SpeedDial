<script lang="ts">
  import type {BooleanSettingKey} from '../../../lib/settings/schema';
  import {settings} from '../../../lib/settings/store.svelte';

  // A button that stays pressed, like "Bold" on Word's ribbon; a checkbox underneath
  let {key, label, text}: {
    key: BooleanSettingKey;
    /** The name — a tooltip and what screen readers read */
    label: string;
    /** The letter on the button */
    text: string;
  } = $props();
</script>

<label class="tool-button" title={label}>
  <input
    class="tool-button__input"
    type="checkbox"
    checked={settings.current[key]}
    aria-label={label}
    onchange={(event) => settings.update({[key]: event.currentTarget.checked})}
  >
  <span class="tool-button__text tool-button__text--bold">{text}</span>
</label>
