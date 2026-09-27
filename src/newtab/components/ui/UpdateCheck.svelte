<script lang="ts">
  import {onMount} from 'svelte';
  import {t} from '../../../lib/i18n/index.svelte';
  import {applyUpdate, checkForUpdate, type UpdateStatus} from '../../../lib/updates';

  // Update status with its button — in the toolbar popup and in Settings → About. Checks when shown.
  // Unpacked: "update" is a newer build on disk, and the button reloads the extension in any case
  let {development}: {development: boolean} = $props();

  let status = $state.raw<UpdateStatus | null>(null);

  async function check() {
    status = null;
    status = await checkForUpdate(development);
  }

  onMount(() => {
    void check();
  });

  const text = $derived.by(() => {
    if (!status) return t.updates.checking;
    switch (status.state) {
      case 'available':
        return development ? t.updates.developmentAvailable(status.version) : t.updates.available(status.version);
      case 'none':
        return development ? t.updates.developmentLatest : t.updates.latest;
      case 'throttled':
        return t.updates.throttled;
      case 'failed':
        return t.updates.failed(status.error);
    }
  });
  const available = $derived(status?.state === 'available');
</script>

<div class="update-check">
  <span class={{'update-check__status': true, 'update-check__status--available': available}} role="status">
    {#if available}<span class="update-check__dot" aria-hidden="true"></span>{/if}
    {text}
  </span>
  {#if development || available}
    <button
      type="button"
      class={{button: true, 'button--primary': available}}
      title={development ? t.updates.reloadHint : t.updates.updateHint}
      onclick={applyUpdate}
    >{development ? t.updates.reload : t.updates.update}</button>
  {:else}
    <button type="button" class="button" disabled={!status} onclick={check}>{t.updates.checkAgain}</button>
  {/if}
</div>

<style>
  .update-check {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 12px;
  }

  .update-check__status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
  }

  .update-check__status--available {
    color: var(--text);
    font-weight: 600;
  }

  .update-check__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
  }
</style>
