<script lang="ts">
  import {t} from '../../../lib/i18n/index.svelte';
  import {hideNotice, notice, runNoticeAction} from '../../../lib/notice.svelte';
  import Icon from './Icon.svelte';

  // Error notification in the corner of the screen. Shown in the topmost open modal dialog
  // (or on the page if there are none): everything outside a modal dialog can't be clicked
</script>

{#if notice.message}
  <div class="notice notice--{notice.kind}" role={notice.kind === 'error' ? 'alert' : 'status'}>
    <p class="notice__message">{notice.message}</p>
    {#if notice.action}
      <button type="button" class="notice__action" onclick={runNoticeAction}>{notice.action.label}</button>
    {/if}
    <button type="button" class="notice__close" aria-label={t.notice.close} onclick={hideNotice}>
      <Icon name="close" size={16}/>
    </button>
  </div>
{/if}

<style>
  .notice {
    position: fixed;
    right: 16px;
    bottom: calc(16px + var(--shelves-height, 0px));
    z-index: 2000;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    max-width: min(440px, calc(100vw - 32px));
    padding: 12px 12px 12px 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-raised);
    text-align: left;
  }

  .notice--error {
    border-color: var(--danger);
  }

  .notice--info {
    border-color: var(--accent);
  }

  .notice__message {
    margin: 0;
    font-size: 0.875rem;
    font-weight: normal;
    line-height: 1.45;
  }

  .notice__action {
    flex-shrink: 0;
    align-self: center;
    padding: 4px 10px;
    border: none;
    border-radius: 4px;
    background: none;
    color: var(--accent);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }

  .notice__action:hover {
    background: var(--surface-hover);
  }

  .notice__close {
    display: flex;
    flex-shrink: 0;
    padding: 4px;
    border: none;
    border-radius: 4px;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
  }

  .notice__close:hover {
    background: var(--surface-hover);
    color: var(--text);
  }
</style>
