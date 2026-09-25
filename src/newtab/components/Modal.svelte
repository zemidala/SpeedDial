<script lang="ts">
  import {onMount, type Snippet} from 'svelte';

  let {title, onclose, children}: {title: string; onclose: () => void; children: Snippet} = $props();

  let dialog: HTMLDialogElement;

  // Нативный <dialog>: фокус внутри окна, закрытие по Esc, остальная страница недоступна
  onMount(() => dialog.showModal());
</script>

<dialog bind:this={dialog} class="modal" aria-labelledby="modal-title" {onclose}>
  <h2 id="modal-title">{title}</h2>
  {@render children()}
</dialog>

<style>
  .modal {
    width: min(360px, 90vw);
    padding: 20px;
    border: none;
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-raised);
  }

  .modal::backdrop {
    background: rgb(0 0 0 / 0.5);
  }
</style>
