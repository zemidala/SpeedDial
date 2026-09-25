<script lang="ts">
  import {sortFolder} from '../../../lib/bookmarkActions';
  import {SORT_ORDERS, type SortOrder, TYPE_ORDERS, type TypeOrder} from '../../../lib/settings/schema';
  import {SORT_ORDER_NAMES, TYPE_ORDER_NAMES} from '../../../lib/sorting';
  import type {FolderRef} from '../../../lib/ui.svelte';
  import Modal from '../ui/Modal.svelte';

  // Навсегда упорядочивает содержимое папки в браузере
  let {folder, onclose}: {folder: FolderRef; onclose: () => void} = $props();

  const formId = $props.id();
  const orders = SORT_ORDERS.filter((order) => order !== 'none');

  let order = $state<SortOrder>('title');
  let typeOrder = $state<TypeOrder>('foldersFirst');
  let error = $state('');
  let sorting = $state(false);

  async function onsubmit(event: SubmitEvent) {
    event.preventDefault();
    sorting = true;
    error = '';
    try {
      await sortFolder(folder.id, order, typeOrder);
      onclose();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      sorting = false;
    }
  }
</script>

<Modal title="Сортировать «{folder.title}»" {onclose}>
  <form id={formId} class="sort-form" {onsubmit}>
    <label class="sort-form__label" for="{formId}-order">Порядок</label>
    <select id="{formId}-order" class="input" bind:value={order}>
      {#each orders as value (value)}
        <option {value}>{SORT_ORDER_NAMES[value]}</option>
      {/each}
    </select>

    <label class="sort-form__label" for="{formId}-type">Папки и закладки</label>
    <select id="{formId}-type" class="input" bind:value={typeOrder}>
      {#each TYPE_ORDERS as value (value)}
        <option {value}>{TYPE_ORDER_NAMES[value]}</option>
      {/each}
    </select>

    <p class="sort-form__hint">Порядок изменится и в самом браузере — в менеджере и на панели закладок.</p>
    {#if error}
      <p class="sort-form__error" role="alert">{error}</p>
    {/if}
  </form>

  {#snippet footer()}
    <button type="button" class="button" onclick={onclose}>Отмена</button>
    <button type="submit" class="button button--primary" form={formId} disabled={sorting}>Сортировать</button>
  {/snippet}
</Modal>

<style>
  .sort-form {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .sort-form__label {
    margin-top: 6px;
    color: var(--text-muted);
    font-size: 14px;
  }

  .sort-form__hint {
    margin: 10px 0 0;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.4;
  }

  .sort-form__error {
    margin: 0;
    color: var(--danger);
    font-size: 13px;
  }
</style>
