<script lang="ts" module>
  import type {IconName} from '../ui/Icon.svelte';

  export interface ToolOption {
    value: string;
    /** The name — a tooltip and what screen readers read */
    label: string;
    /** What the button shows: an icon or a few letters (e.g. "A" of different sizes) */
    icon?: IconName;
    text?: string;
    /** Font size of the letters */
    textSize?: string;
  }
</script>

<script lang="ts">
  import Icon from '../ui/Icon.svelte';

  // Buttons for one choice side by side, like the alignment buttons on Word's ribbon.
  // Radio buttons underneath: arrow keys move the choice, screen readers read the names
  let {label, value, options, onchange}: {
    /** The name of the whole group */
    label: string;
    value: string;
    options: ToolOption[];
    onchange: (value: string) => void;
  } = $props();

  const name = $props.id();
</script>

<div class="toolbar__group" role="radiogroup" aria-label={label}>
  {#each options as option (option.value)}
    <label class="tool-button" title={option.label}>
      <input
        class="tool-button__input"
        type="radio"
        {name}
        value={option.value}
        checked={option.value === value}
        aria-label={option.label}
        onchange={() => onchange(option.value)}
      >
      {#if option.icon}
        <Icon name={option.icon} size={18}/>
      {:else}
        <span class="tool-button__text" style:font-size={option.textSize}>{option.text}</span>
      {/if}
    </label>
  {/each}
</div>
