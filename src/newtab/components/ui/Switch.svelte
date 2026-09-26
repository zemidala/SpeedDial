<script lang="ts">
  let {id, checked, disabled = false, onchange}: {
    id?: string;
    checked: boolean;
    disabled?: boolean;
    /** May refuse to change the value (e.g. if a permission wasn't granted) — checked defines the state */
    onchange: (checked: boolean) => void;
  } = $props();

  function handleChange(event: Event & {currentTarget: HTMLInputElement}) {
    const requested = event.currentTarget.checked;
    // The switch is driven only by checked: the previous position is restored at once,
    // and the new one appears when the state changes
    event.currentTarget.checked = checked;
    onchange(requested);
  }
</script>

<span class="switch">
  <input {id} class="switch__input" type="checkbox" role="switch" {checked} {disabled} onchange={handleChange}>
  <span class="switch__track" aria-hidden="true"></span>
</span>
