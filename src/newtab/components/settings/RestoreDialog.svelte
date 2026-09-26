<script lang="ts">
  import type {RestoreMode} from '../../../lib/backup/backup';
  import {t} from '../../../lib/i18n/index.svelte';
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
  <div class="restore-dialog" role="radiogroup" aria-label={t.backup.restoreModes}>
    <label class="restore-dialog__option">
      <input type="radio" name="{baseId}-mode" value="merge" bind:group={mode}>
      <span>
        <span class="restore-dialog__label">{t.backup.merge}</span>
        <span class="restore-dialog__hint">{t.backup.mergeHint}</span>
      </span>
    </label>
    <label class="restore-dialog__option">
      <input type="radio" name="{baseId}-mode" value="replace" bind:group={mode}>
      <span>
        <span class="restore-dialog__label">{t.backup.replace}</span>
        <span class="restore-dialog__hint">{t.backup.replaceHint}</span>
      </span>
    </label>
  </div>
  {#if error}
    <p class="restore-dialog__error" role="alert">{error}</p>
  {/if}

  {#snippet footer()}
    <button type="button" class="button" onclick={onclose}>{t.common.cancel}</button>
    <button type="button" class="button button--primary" disabled={busy} onclick={restore}>{t.backup.restore}</button>
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
    font-size: 0.8125rem;
  }

  .restore-dialog__error {
    margin: 12px 0 0;
    color: var(--danger);
    font-size: 0.8125rem;
  }
</style>
