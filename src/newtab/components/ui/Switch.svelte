<script lang="ts">
  let {id, checked, disabled = false, onchange}: {
    id?: string;
    checked: boolean;
    disabled?: boolean;
    /** Может отказаться менять значение (например, если не выдали разрешение) — состояние задаёт checked */
    onchange: (checked: boolean) => void;
  } = $props();

  function handleChange(event: Event & {currentTarget: HTMLInputElement}) {
    const requested = event.currentTarget.checked;
    // Переключатель управляется только через checked: сразу возвращаем прежнее положение,
    // а новое появится, когда изменится состояние
    event.currentTarget.checked = checked;
    onchange(requested);
  }
</script>

<span class="switch">
  <input {id} class="switch__input" type="checkbox" role="switch" {checked} {disabled} onchange={handleChange}>
  <span class="switch__track" aria-hidden="true"></span>
</span>
