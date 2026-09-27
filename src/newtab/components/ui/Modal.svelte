<script lang="ts">
  import {onMount, type Snippet} from 'svelte';
  import {modals} from '../../../lib/ui.svelte';
  import Notice from './Notice.svelte';

  let {title, size = 'small', onclose, closeOnBackdrop, children, footer}: {
    title: string;
    size?: 'small' | 'large';
    onclose: () => void;
    /** A click outside the dialog closes it when this says so (e.g. nothing was changed) */
    closeOnBackdrop?: () => boolean;
    children: Snippet;
    /** Buttons at the bottom of the dialog */
    footer?: Snippet;
  } = $props();

  // The backdrop belongs to the dialog element itself: a click whose press and release both land outside
  // the dialog's box is a click on the backdrop (a drag that ends outside, e.g. selecting text, isn't)
  let pressedOutside = false;
  const outside = (event: MouseEvent) => {
    const box = dialog.getBoundingClientRect();
    return event.target === dialog && (event.clientX < box.left || event.clientX > box.right
      || event.clientY < box.top || event.clientY > box.bottom);
  };

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

<dialog
  bind:this={dialog}
  class="modal modal--{size}"
  aria-labelledby={titleId}
  {onclose}
  onmousedown={(event) => (pressedOutside = outside(event))}
  onclick={(event) => {
    if (pressedOutside && outside(event) && closeOnBackdrop?.()) onclose();
  }}
>
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
