<script lang="ts">
  import {hideNotice, notice} from '../../../lib/notice.svelte';
  import Icon from './Icon.svelte';

  // Уведомление об ошибке в углу экрана. Показывается в верхнем открытом модальном окне
  // (или на странице, если окон нет): всё вне модального окна недоступно для кликов
</script>

{#if notice.message}
  <div class="notice notice--{notice.kind}" role={notice.kind === 'error' ? 'alert' : 'status'}>
    <p class="notice__message">{notice.message}</p>
    <button type="button" class="notice__close" aria-label="Закрыть уведомление" onclick={hideNotice}>
      <Icon name="close" size={16}/>
    </button>
  </div>
{/if}

<style>
  .notice {
    position: fixed;
    right: 16px;
    bottom: 16px;
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
    font-size: 14px;
    font-weight: normal;
    line-height: 1.45;
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
