<script lang="ts">
  import type {Snippet} from 'svelte';

  // Строка настроек: подпись с пояснением слева, элемент управления справа.
  // children получает id — его нужно отдать полю ввода, чтобы подпись была с ним связана.
  // Кнопкам id не передаём: подпись заменила бы им название
  let {label, hint, stacked = false, children}: {
    label: string;
    hint?: string;
    /** Элемент управления под подписью на всю ширину (для многострочных полей) */
    stacked?: boolean;
    children: Snippet<[string]>;
  } = $props();

  const id = $props.id();
</script>

<div class="setting-row" class:setting-row--stacked={stacked}>
  <div class="setting-row__text">
    <label class="setting-row__label" for={id}>{label}</label>
    {#if hint}
      <p class="setting-row__hint">{hint}</p>
    {/if}
  </div>
  <div class="setting-row__control">
    {@render children(id)}
  </div>
</div>

<style>
  .setting-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: center;
    gap: 8px 24px;
    padding: 10px 0;
  }

  .setting-row--stacked {
    grid-template-columns: minmax(0, 1fr);
  }

  .setting-row__text {
    text-align: right;
  }

  .setting-row--stacked .setting-row__text {
    text-align: left;
  }

  .setting-row__label {
    font-weight: 600;
  }

  .setting-row__hint {
    margin: 4px 0 0;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.4;
    white-space: pre-line;
  }

  .setting-row__control {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
</style>
