<script lang="ts">
  import type {RestoreMode} from '../../../lib/backup/backup';
  import Modal from '../ui/Modal.svelte';

  // Выбор способа восстановления копии
  let {title, onrestore, onclose}: {
    title: string;
    onrestore: (mode: RestoreMode) => Promise<void>;
    onclose: () => void;
  } = $props();

  const baseId = $props.id();
  let mode = $state<RestoreMode>('merge');
  let busy = $state(false);
  let error = $state('');

  async function restore() {
    busy = true;
    error = '';
    try {
      await onrestore(mode);
      onclose();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

<Modal {title} {onclose}>
  <div class="restore-dialog" role="radiogroup" aria-label="Способ восстановления">
    <label class="restore-dialog__option">
      <input type="radio" name="{baseId}-mode" value="merge" bind:group={mode}>
      <span>
        <span class="restore-dialog__label">Добавить недостающие закладки</span>
        <span class="restore-dialog__hint">Закладки и папки из копии, которых здесь нет. Ничего не удаляется, настройки не меняются</span>
      </span>
    </label>
    <label class="restore-dialog__option">
      <input type="radio" name="{baseId}-mode" value="replace" bind:group={mode}>
      <span>
        <span class="restore-dialog__label">Восстановить полностью</span>
        <span class="restore-dialog__hint">Закладки, их порядок, настройки и фон станут как в копии. Можно будет отменить</span>
      </span>
    </label>
  </div>
  {#if error}
    <p class="restore-dialog__error" role="alert">{error}</p>
  {/if}

  {#snippet footer()}
    <button type="button" class="button" onclick={onclose}>Отмена</button>
    <button type="button" class="button button--primary" disabled={busy} onclick={restore}>Восстановить</button>
  {/snippet}
</Modal>

<style>
  .restore-dialog {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .restore-dialog__option {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-small);
    cursor: pointer;
  }

  .restore-dialog__option:has(input:checked) {
    border-color: var(--accent);
  }

  .restore-dialog__option input {
    margin-top: 3px;
    accent-color: var(--accent);
  }

  .restore-dialog__label {
    display: block;
    font-weight: 600;
  }

  .restore-dialog__hint {
    display: block;
    margin-top: 2px;
    color: var(--text-muted);
    font-size: 13px;
  }

  .restore-dialog__error {
    margin: 12px 0 0;
    color: var(--danger);
    font-size: 13px;
  }
</style>
