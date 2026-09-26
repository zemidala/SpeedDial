<script lang="ts">
  import {onMount, type Snippet} from 'svelte';
  import {modals} from '../../../lib/ui.svelte';
  import Notice from './Notice.svelte';

  let {title, size = 'small', onclose, children, footer}: {
    title: string;
    size?: 'small' | 'large';
    onclose: () => void;
    children: Snippet;
    /** Buttons at the bottom of the dialog */
    footer?: Snippet;
  } = $props();

  const titleId = $props.id();
  let dialog: HTMLDialogElement;
  let level = $state(0); // This dialog's number among the open ones; notifications are shown by the topmost

  // Native dialog element: focus stays inside, Esc closes it, the rest of the page is inert
  onMount(() => {
    dialog.showModal();
    level = ++modals.depth;
    return () => {
      modals.depth--;
    };
  });
</script>

<dialog bind:this={dialog} class="modal modal--{size}" aria-labelledby={titleId} {onclose}>
  <h2 id={titleId} class="modal__title">{title}</h2>
  <div class="modal__body">
    {@render children()}
  </div>
  {#if footer}
    <div class="modal__footer">
      {@render footer()}
    </div>
  {/if}
  {#if level === modals.depth}
    <Notice/>
  {/if}
</dialog>

<style>
  .modal {
    display: flex;
    flex-direction: column;
    max-height: min(90vh, 900px);
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-raised);
  }

  .modal:not([open]) {
    display: none;
  }

  .modal--small {
    width: min(380px, 92vw);
  }

  .modal--large {
    width: min(840px, 94vw);
  }

  .modal::backdrop {
    background: var(--backdrop);
  }

  .modal__title {
    margin: 0;
    padding: 20px 20px 12px;
  }

  .modal__body {
    flex: 1;
    min-height: 0;
    padding: 0 20px 20px;
    overflow-y: auto;
  }

  .modal__footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px;
    border-top: 1px solid var(--border);
  }
</style>
