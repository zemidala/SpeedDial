<script lang="ts">
  import {t} from '../../../lib/i18n/index.svelte';
  import type {ConfirmOptions} from '../../../lib/ui.svelte';
  import Modal from './Modal.svelte';

  let {options, onclose}: {options: ConfirmOptions; onclose: () => void} = $props();

  let error = $state('');
  let busy = $state(false);

  async function confirm() {
    busy = true;
    error = '';
    try {
      await options.onConfirm();
      onclose();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

<Modal title={options.title} {onclose}>
  <p class="confirm-dialog__message">{options.message}</p>
  {#if error}
    <p class="confirm-dialog__error" role="alert">{error}</p>
  {/if}

  {#snippet footer()}
    <button type="button" class="button" onclick={onclose}>{t.common.cancel}</button>
    <button
      type="button"
      class="button"
      class:button--danger={options.danger}
      class:button--primary={!options.danger}
      disabled={busy}
      onclick={confirm}
    >{options.confirmLabel}</button>
  {/snippet}
</Modal>

<style>
  .confirm-dialog__message {
    margin: 0;
    line-height: 1.45;
  }

  .confirm-dialog__error {
    margin: 12px 0 0;
    color: var(--danger);
    font-size: 13px;
  }
</style>
